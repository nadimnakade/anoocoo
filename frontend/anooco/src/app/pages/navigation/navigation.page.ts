import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { LocationService } from 'src/app/services/location.service';
import { RoadFeatureService } from 'src/app/services/road-feature.service';
import { DrivingService } from 'src/app/services/driving.service';
import { VoiceService } from 'src/app/services/voice.service';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import * as L from 'leaflet';
import 'leaflet-routing-machine';
import { Subscription } from 'rxjs';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { OcrService } from 'src/app/services/ocr.service';
import { PotholeAiService } from 'src/app/services/pothole-ai.service';

// Fix for Leaflet icons
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.page.html',
  styleUrls: ['./navigation.page.scss'],
  standalone: false
})
export class NavigationPage implements OnInit, OnDestroy {
  map: L.Map | undefined;
  startLocation = '';
  endLocation = '';
  alertRadius = 2.0;
  isLoading = false;
  currentSpeed = 0;
  speedLimit = 120;
  speedLimitSource: 'default' | 'ocr' | 'manual' = 'default';

  routeStats: { duration: string, distance: string } | null = null;
  routeEvents: any[] = [];

  startSuggestions: any[] = [];
  endSuggestions: any[] = [];
  isStartLoading = false;
  isEndLoading = false;
  private searchTimeout: any;

  private routingControl: any;
  private eventMarkers: (L.Marker | L.CircleMarker)[] = [];
  private currentLat = 0;
  private currentLng = 0;
  private spokenEvents = new Set<string>();
  private trackingInterval: any;

  private currentRoutePath: number[][] | null = null;
  private lastEventsRefresh = 0;
  private subscriptions = new Subscription();
  public handsFreeEnabled = false;
  private isListening = false;
  private abortWake = false;

  constructor(
    private api: ApiService,
    private locationService: LocationService,
    private roadFeatureService: RoadFeatureService,
    private drivingService: DrivingService,
    private voiceService: VoiceService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
    private ocrService: OcrService,
    private potholeAiService: PotholeAiService
  ) { }

  ngOnInit() {
    this.alertRadius = this.roadFeatureService.alertRadiusKm;

    this.subscriptions.add(
      this.roadFeatureService.currentSpeed$.subscribe(speed => {
        this.currentSpeed = speed;
        this.speedLimit = this.roadFeatureService.speedLimitKmh;
        this.speedLimitSource = this.roadFeatureService.speedLimitSource;
      })
    );

    // Subscribe to Auto-Traffic Detection
    this.subscriptions.add(
      this.roadFeatureService.trafficDetected$.subscribe(() => {
        this.handleTrafficDetected();
      })
    );

    // Subscribe to Pothole Detection (AI Confirmation Mode)
    this.subscriptions.add(
      this.roadFeatureService.potholeDetected$.subscribe(evt => {
        if (this.roadFeatureService.potholeConfirmationMode) {
          this.handlePotholeDetected(evt);
        }
      })
    );

    // Auto-Handsfree when Driving Mode detected
    this.subscriptions.add(
      this.drivingService.isDrivingMode$.subscribe(isDriving => {
        if (isDriving && !this.handsFreeEnabled) {
          this.toggleHandsFree();
          this.showToast('Driving Mode Enabled (Hands-free ON)');
        }
      })
    );
  }

  ionViewDidEnter() {
    this.initMap();
    this.startTracking();
  }

  ionViewWillLeave() {
    this.stopTracking();
  }

  ngOnDestroy() {
    this.stopTracking();
    this.subscriptions.unsubscribe();
    if (this.map) {
      this.map.remove();
    }
  }

  startTracking() {
    // Initial fetch
    this.getCurrentLocation();

    // Poll for updates (real-time simulation)
    this.trackingInterval = setInterval(async () => {
      try {
        const pos = await this.locationService.getCurrentLocation();
        if (pos && pos.coords) {
          this.currentLat = pos.coords.latitude;
          this.currentLng = pos.coords.longitude;

          // Update marker
          if (this.map) {
             // Ideally update a specific user marker, but for now we rely on getCurrentLocation updating the view/marker if called manually.
             // Let's ensure we have a marker for the user that moves.
             this.updateUserMarker();
          }

          // Check proximity
          this.checkProximityToEvents();

          // Check route deviation
          this.checkRouteDeviation();

          // Periodic refresh of events (every 60s)
          const now = Date.now();
          if (this.currentRoutePath && (now - this.lastEventsRefresh > 60000)) {
            this.fetchEventsAlongRoute(this.currentRoutePath, true); // silent refresh
            this.lastEventsRefresh = now;
          }
        }
      } catch (e) {
        console.warn('Tracking error', e);
      }
    }, 5000); // Check every 5s
  }

  private userMarker: L.Marker | null = null;
  updateUserMarker() {
    if (!this.map) return;
    if (this.userMarker) {
      this.userMarker.setLatLng([this.currentLat, this.currentLng]);
    } else {
      this.userMarker = L.marker([this.currentLat, this.currentLng])
        .bindPopup('You are here')
        .addTo(this.map);
    }
  }

  stopTracking() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  checkProximityToEvents() {
    if (this.routeEvents.length === 0) return;

    this.routeEvents.forEach(evt => {
      const distKm = this.calculateDistance(this.currentLat, this.currentLng, evt.latitude, evt.longitude);

      // Update UI distance
      evt.distanceFromUser = distKm.toFixed(1);

      // Trigger Voice Alert if < 1km and not spoken
      if (distKm < this.roadFeatureService.voiceAlertKm && !this.spokenEvents.has(evt.id)) {
        this.speakEvent(evt, distKm);
        this.spokenEvents.add(evt.id);
      }
    });
  }

  speakEvent(evt: any, distKm: number) {
    const text = `Caution. ${evt.eventType} reported ${distKm.toFixed(1)} kilometers ahead.`;

    // Use shared speak method
    this.speak(text);

    // Show Confirmation UI (Proactive Confirmation)
    this.presentConfirmationToast(evt, text);
  }

  async presentConfirmationToast(evt: any, msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      position: 'bottom',
      duration: 10000, // Stay longer for interaction
      buttons: [
        {
          text: 'Confirm',
          role: 'confirm',
          handler: () => {
            this.confirmEvent(evt);
          }
        },
        {
          text: 'Not Here',
          role: 'cancel',
          handler: () => {
            this.reportNotHere(evt);
          }
        }
      ]
    });
    toast.present();
  }

  confirmEvent(evt: any) {
    this.api.confirmEvent(evt.id).subscribe({
      next: () => this.showToast('Thanks for confirming!'),
      error: () => this.showToast('Could not confirm.')
    });
  }

  async reportNotHere(evt: any) {
    const actionSheet = await this.alertCtrl.create({
      header: 'Is this issue gone?',
      buttons: [
        {
          text: 'Yes, Cleared/Passed',
          handler: () => {
            this.api.clearEvent(evt.id).subscribe(() => this.showToast('Marked as cleared.'));
          }
        },
        {
          text: 'Never was here (False Report)',
          handler: () => {
            this.api.reportFalseEvent(evt.id).subscribe(() => this.showToast('Reported as false.'));
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async handleTrafficDetected() {
    const pos = await this.locationService.getCurrentLocation();
    this.api.sendReport('Heavy traffic detected automatically', pos, 'TRAFFIC').subscribe({
      next: () => this.showToast('Heavy traffic auto-reported.'),
      error: (e) => console.error('Auto-traffic report failed', e)
    });
  }

  async handlePotholeDetected(evt: { severity: number }) {
    // Show a quick prompt
    const alert = await this.alertCtrl.create({
      header: 'Pothole Detected',
      message: `Possible pothole detected (Severity: ${evt.severity.toFixed(1)}). Report it?`,
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Report',
          handler: async () => {
            const pos = await this.locationService.getCurrentLocation();
            this.api.sendReport(`Pothole detected via AI (Severity ${evt.severity.toFixed(1)})`, pos, 'POTHOLE').subscribe({
              next: () => this.showToast('Pothole reported.'),
              error: () => this.showToast('Failed to report.')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async quickScanSign() {
    const loading = await this.loadingCtrl.create({
      message: 'Scanning sign...'
    });
    await loading.present();

    try {
      const texts = await this.ocrService.captureAndReadSign();
      await loading.dismiss();

      if (texts.length > 0) {
        const detectedLimit = this.extractSpeedLimitFromTexts(texts);

        if (detectedLimit) {
          const alert = await this.alertCtrl.create({
            header: 'Speed Limit Detected',
            message: `Detected ${detectedLimit} km/h from sign.\n\nRaw text:\n${texts.join('\n')}`,
            buttons: [
              {
                text: 'Ignore',
                role: 'cancel'
              },
              {
                text: 'Use for alerts',
                handler: () => {
                  this.roadFeatureService.setTemporarySpeedLimit(detectedLimit, 'from road sign');
                  this.showToast(`Speed limit set to ${detectedLimit} km/h`);
                }
              }
            ]
          });
          await alert.present();
        } else {
          const alert = await this.alertCtrl.create({
            header: 'Sign Detected',
            message: texts.join('\n'),
            buttons: ['OK']
          });
          await alert.present();
        }
      } else {
        this.showToast('No text detected.');
      }
    } catch {
      await loading.dismiss();
      this.showToast('Failed to scan sign.');
    }
  }

  async quickScanPotholeAi() {
    const loading = await this.loadingCtrl.create({
      message: 'Analyzing road surface...'
    });
    await loading.present();
    try {
      const result = await this.potholeAiService.confirmPotholeFromCamera();
      await loading.dismiss();
      if (result.isPothole) {
        let autoVerified = false;
        let confidence = result.score;
        if (this.roadFeatureService.hasRecentSpike(30000)) {
          const spike = this.roadFeatureService.getLastSpike();
          const base = this.roadFeatureService.potholeThreshold;
          const severityNorm = spike ? Math.min(1, Math.max(0, (spike.severity - base) / 10)) : 0;
          confidence = Math.min(1, result.score * 0.6 + severityNorm * 0.4);
          autoVerified = confidence >= 0.7;
        }

        if (autoVerified) {
          const pos = await this.locationService.getCurrentLocation();
          this.api.sendReportWithQueue(`Verified pothole (AI ${result.score.toFixed(2)}, conf ${confidence.toFixed(2)})`, pos, 'ai')
            .subscribe({
              next: () => this.showToast('Pothole auto-reported (verified).'),
              error: () => this.showToast('Failed to auto-report.')
            });
          return;
        }

        const alert = await this.alertCtrl.create({
          header: 'AI Analysis',
          message: `Pothole likely detected (score: ${result.score.toFixed(2)}). Report this?`,
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Report', handler: async () => {
                const pos = await this.locationService.getCurrentLocation();
                this.api.sendReportWithQueue(`Pothole detected via AI (score ${result.score.toFixed(2)})`, pos, 'ai')
                  .subscribe({
                    next: () => this.showToast('Pothole reported.'),
                    error: () => this.showToast('Failed to report.')
                  });
              }
            }
          ]
        });
        await alert.present();
      } else {
        const alert = await this.alertCtrl.create({
          header: 'AI Analysis',
          message: `No pothole detected (score: ${result.score.toFixed(2)})`,
          buttons: ['OK']
        });
        await alert.present();
      }
    } catch {
      await loading.dismiss();
      this.showToast('AI analysis failed.');
    }
  }

  private extractSpeedLimitFromTexts(texts: string[]): number | null {
    const joined = texts.join(' ').replace(/\s+/g, ' ');
    const regex = /\b([1-9][0-9]{0,2})\s*(km\/h|kmh|kph)?\b/gi;
    const candidates: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(joined)) !== null) {
      const val = parseInt(match[1], 10);
      if (val >= 10 && val <= 160) {
        candidates.push(val);
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a - b);
    return candidates[0];
  }

  async initMap() {
    if (this.map) return;

    let lat = 35.9375;
    let lng = 14.3754;

    try {
      const pos = await this.locationService.getCurrentLocation();
      if (pos && pos.coords) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        this.currentLat = lat;
        this.currentLng = lng;
      }
    } catch (e) {
      console.warn('Navigation init: geolocation unavailable, using fallback', e);
    }

    this.map = L.map('nav-map', {
      zoomControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      dragging: true
    }).setView([lat, lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.updateUserMarker();
  }

  async getCurrentLocation() {
    try {
      const pos = await this.locationService.getCurrentLocation();
      if (pos && pos.coords) {
        this.currentLat = pos.coords.latitude;
        this.currentLng = pos.coords.longitude;

        if (this.map) {
          this.map.setView([this.currentLat, this.currentLng], 13);
          this.updateUserMarker();
        }
      }
    } catch (e) {
      console.error('Loc error', e);
    }
  }

  useCurrentLocation() {
    this.startLocation = 'Current Location';
    // Logic to use actual coords handled in findRoute
  }

  updateRadius() {
    this.roadFeatureService.updateAlertRadius(this.alertRadius);

    // Real-time update: Refresh events if route is active
    if (this.currentRoutePath) {
      this.fetchEventsAlongRoute(this.currentRoutePath);
    }
  }

  async toggleHandsFree() {
    this.handsFreeEnabled = !this.handsFreeEnabled;
    this.cdr.detectChanges();
    if (this.handsFreeEnabled) {
      this.showToast('Hands-free mode enabled');
      this.startWakeLoop();
    } else {
      this.abortWake = true;
      this.showToast('Hands-free mode disabled');
      try { await SpeechRecognition.stop(); } catch {}
    }
  }

  private async startWakeLoop() {
    this.abortWake = false;
    while (this.handsFreeEnabled && !this.abortWake) {
      if (this.isListening) {
         await new Promise(r => setTimeout(r, 1000));
         continue;
      }

      try {
        const available = await SpeechRecognition.available();
        if (!available.available) {
          break;
        }
        // Continuous listening for Wake Word
        const res = await SpeechRecognition.start({
          language: "en-US",
          maxResults: 1,
          prompt: "Say 'Hey Anooco'",
          partialResults: false,
          popup: false,
        });
        const text = (res.matches && res.matches[0]) ? res.matches[0].toLowerCase() : "";
        if (text.includes("anooco") || text.includes("hey anooco")) {
          this.speak("Listening...");
          await this.listenForCommand();
        }
      } catch {
        // ignore transient errors
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  async listenForCommand() {
    this.isListening = true;
    try {
      const command = await this.voiceService.startListening();
      if (command) {
        await this.processVoiceCommand(command);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isListening = false;
    }
  }

  speak(text: string) {
    this.voiceService.speak(text);
  }

  async processVoiceCommand(cmd: string) {
    const lower = cmd.toLowerCase();
    const pos = await this.locationService.getCurrentLocation();

    if (lower.includes('pothole')) {
      this.api.sendReport('Pothole reported via Voice', pos, 'POTHOLE').subscribe();
      this.speak("Pothole reported.");
    } else if (lower.includes('accident')) {
      this.api.sendReport('Accident reported via Voice', pos, 'ACCIDENT').subscribe();
      this.speak("Accident reported.");
    } else if (lower.includes('traffic')) {
      this.api.sendReport('Traffic reported via Voice', pos, 'TRAFFIC').subscribe();
      this.speak("Traffic reported.");
    } else if (lower.includes('police')) {
      this.api.sendReport('Police reported via Voice', pos, 'POLICE').subscribe();
      this.speak("Police reported.");
    } else {
      this.speak("Sorry, I didn't catch that.");
    }
  }

  onSearchInput(event: any, type: 'start' | 'end') {
    const query = event.detail.value;

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    // Reset loading on clear or new input (will be re-enabled in timeout if valid)
    if (type === 'start') this.isStartLoading = false;
    else this.isEndLoading = false;

    if (!query || query.length < 3) {
      if (type === 'start') this.startSuggestions = [];
      else this.endSuggestions = [];
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      if (type === 'start') this.isStartLoading = true;
      else this.isEndLoading = true;

      const results = await this.searchAddress(query);

      if (type === 'start') {
        this.startSuggestions = results;
        this.isStartLoading = false;
      } else {
        this.endSuggestions = results;
        this.isEndLoading = false;
      }
    }, 500); // 500ms debounce
  }

  selectAddress(item: any, type: 'start' | 'end') {
    if (type === 'start') {
      this.startLocation = item.display_name;
      this.startSuggestions = [];
    } else {
      this.endLocation = item.display_name;
      this.endSuggestions = [];
    }
  }

  async searchAddress(query: string) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async findRoute() {
    if (!this.map || !this.endLocation) return;

    this.isLoading = true;
    this.routeEvents = [];
    this.routeStats = null;

    // Clear old route
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }

    // Clear old markers
    this.eventMarkers.forEach(m => m.remove());
    this.eventMarkers = [];

    // Geocode Start (if not current)
    let startCoords = L.latLng(this.currentLat, this.currentLng);

    // Check if we are using current location but don't have it yet
    const isUsingCurrentLocation = this.startLocation === 'Current Location' || this.startLocation.trim() === '';

    if (isUsingCurrentLocation && (this.currentLat === 0 && this.currentLng === 0)) {
      this.showToast('Fetching current location...');
      await this.getCurrentLocation();
      // Update coords after fetch
      startCoords = L.latLng(this.currentLat, this.currentLng);

      if (this.currentLat === 0 && this.currentLng === 0) {
        this.showToast('Current location not found. Please ensure GPS is enabled.');
        this.isLoading = false;
        return;
      }
    }

    // Note: For a real app, you'd use a Geocoding service here to convert text address to lat/lng.
    // For this demo, we'll assume start is current location if text is "Current Location"
    // And end location needs geocoding.
    // Since we don't have a geocoding API set up in frontend yet (only backend),
    // we will simulate geocoding for a few Malta locations for demo purposes or use a simple nominatim call.

    let endCoords: L.LatLng | null = null;

    try {
      if (this.startLocation !== 'Current Location' && this.startLocation.trim() !== '') {
        const res = await this.geocode(this.startLocation);
        if (res) startCoords = res;
      }

      const endRes = await this.geocode(this.endLocation);
      if (endRes) {
        endCoords = endRes;
      } else {
        this.showToast('Destination not found.');
        this.isLoading = false;
        return;
      }

      // Calculate Route using OSRM (via Leaflet Routing Machine)
      // Note: L.Routing.control usually adds itself to map. We need to hook into it to get the path.

      this.routingControl = (L as any).Routing.control({
        waypoints: [
          startCoords,
          endCoords
        ],
        routeWhileDragging: false,
        show: false, // Hide the default instructions panel for cleaner UI
        addWaypoints: false
      }).on('routesfound', (e: any) => {
        const routes = e.routes;
        const route = routes[0];

        this.routeStats = {
          distance: (route.summary.totalDistance / 1000).toFixed(1) + ' km',
          duration: Math.round(route.summary.totalTime / 60) + ' min'
        };

        // Extract coordinates for backend search
        // OSRM returns array of {lat, lng}
        const path = route.coordinates.map((c: any) => [c.lat, c.lng]);

        this.currentRoutePath = path; // Store for deviation checks and refresh
        this.lastEventsRefresh = Date.now();

        this.fetchEventsAlongRoute(path);

      }).addTo(this.map);

    } catch (e) {
      console.error(e);
      this.showToast('Error calculating route.');
      this.isLoading = false;
    }
  }

  async fetchEventsAlongRoute(path: number[][], silent = false) {
    this.api.getEventsAlongRoute(path, this.alertRadius).subscribe({
      next: (events: any) => {
        this.routeEvents = events.map((e: any) => ({
          ...e,
          distanceFromUser: this.calculateDistance(this.currentLat, this.currentLng, e.latitude, e.longitude).toFixed(1)
        }));
        this.plotEvents(this.routeEvents);
        this.isLoading = false;

        if (!silent) {
          if (this.routeEvents.length > 0) {
            this.showToast(`Found ${this.routeEvents.length} alerts along your route.`);
          } else {
            this.showToast('No alerts found on this route. Safe travels!');
          }
        }
      },
      error: (err: any) => {
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  checkRouteDeviation() {
    if (!this.currentRoutePath || !this.routingControl) return;

    // Skip check if we just started or path is empty
    if (this.currentRoutePath.length < 2) return;

    const deviationThresholdKm = 0.2; // 200 meters deviation triggers reroute
    let minDist = Infinity;

    // Check distance to all segments of the route
    // (Optimization: In a real app, track the current segment index and only check neighbors)
    for (let i = 0; i < this.currentRoutePath.length - 1; i++) {
      const p1 = this.currentRoutePath[i];
      const p2 = this.currentRoutePath[i + 1];
      const d = this.distanceToSegment(
        this.currentLat, this.currentLng,
        p1[0], p1[1],
        p2[0], p2[1]
      );
      if (d < minDist) minDist = d;
    }

    // If we are significantly off-route
    if (minDist > deviationThresholdKm) {
      console.log('User deviated from route. Recalculating...', minDist);
      this.showToast('Recalculating route...');

      // Update start point to current location, keep destination
      const waypoints = this.routingControl.getWaypoints();
      // Ensure we have a destination
      if (waypoints && waypoints.length > 1) {
        const destination = waypoints[waypoints.length - 1];

        // This triggers 'routesfound' which updates currentRoutePath and fetches events
        this.routingControl.setWaypoints([
          L.latLng(this.currentLat, this.currentLng),
          destination.latLng
        ]);

        // Clear path temporarily to prevent multiple triggers
        this.currentRoutePath = null;
      }
    }
  }

  distanceToSegment(lat: number, lon: number, lat1: number, lon1: number, lat2: number, lon2: number) {
    // Project point P onto segment AB
    const x = lat, y = lon;
    const x1 = lat1, y1 = lon1;
    const x2 = lat2, y2 = lon2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;

    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    }
    else if (param > 1) {
      xx = x2;
      yy = y2;
    }
    else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return this.calculateDistance(lat, lon, xx, yy);
  }

  plotEvents(events: any[]) {
    if (!this.map) return;

    events.forEach(evt => {
      const color = this.getColor(evt.eventType);
      const marker = L.circleMarker([evt.latitude, evt.longitude], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).bindPopup(`
        <b>${evt.eventType}</b><br>
        ${evt.address || ''}
      `).addTo(this.map!);

      this.eventMarkers.push(marker);
    });
  }

  // Simple client-side geocoding shim (Nominatim)
  async geocode(query: string): Promise<L.LatLng | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.length > 0) {
      return L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
    }
    return null;
  }

  getIcon(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return 'warning';
      case 'ACCIDENT': return 'medkit';
      case 'POLICE': return 'shield';
      case 'TRAFFIC': return 'car';
      default: return 'alert-circle';
    }
  }

  getColor(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return '#ffc409'; // Warning
      case 'ACCIDENT': return '#eb445a'; // Danger
      case 'POLICE': return '#3880ff'; // Primary
      case 'TRAFFIC': return '#ffc409';
      default: return '#medium';
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  focusEvent(evt: any) {
    if (this.map) {
      this.map.setView([evt.latitude, evt.longitude], 15);
    }
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}
