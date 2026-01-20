import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { LocationService } from 'src/app/services/location.service';
import { RoadFeatureService } from 'src/app/services/road-feature.service';
import { DrivingService } from 'src/app/services/driving.service';
import { VoiceService } from 'src/app/services/voice.service';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import * as L from 'leaflet';
import 'leaflet-routing-machine';
import { Subscription, forkJoin } from 'rxjs';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { OcrService } from 'src/app/services/ocr.service';
import { PotholeAiService } from 'src/app/services/pothole-ai.service';
import { ActivatedRoute } from '@angular/router';

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

  routeStats: { duration: string, distance: string, roughnessIndex?: number, potholeCount?: number, potholesLast24h?: number } | null = null;
  routeEvents: any[] = [];
  enforcementHotspots: any[] = [];

  startSuggestions: any[] = [];
  endSuggestions: any[] = [];
  isStartLoading = false;
  isEndLoading = false;
  private searchTimeout: any;

  private routingControl: any;
  private eventMarkers: (L.Marker | L.CircleMarker)[] = [];
  private enforcementMarkers: L.CircleMarker[] = [];
  private currentLat = 0;
  private currentLng = 0;
  private spokenEvents = new Set<string>();
  private spokenHotspots = new Set<string>();
  private trackingInterval: any;

  private currentRoutePath: number[][] | null = null;
  private lastEventsRefresh = 0;
  private subscriptions = new Subscription();
  public handsFreeEnabled = false;
  private isListening = false;
  private abortWake = false;
  private destinationCoords: L.LatLng | null = null;

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
    private potholeAiService: PotholeAiService,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.subscriptions.add(
      this.route.queryParams.subscribe(params => {
        if (params['destLat'] && params['destLon']) {
          const lat = parseFloat(params['destLat']);
          const lon = parseFloat(params['destLon']);
          this.destinationCoords = L.latLng(lat, lon);
          this.endLocation = params['destName'] || 'Selected Destination';

          // Trigger route finding if map is already initialized
          if (this.map) {
            this.findRoute();
          }
        }
      })
    );

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
        if (!this.roadFeatureService.enablePotholeReports || this.roadFeatureService.reportingPaused) {
          return;
        }
        if (this.roadFeatureService.potholeConfirmationMode) {
          this.handlePotholeDetected(evt);
        } else {
          this.autoReportPothole(evt);
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

  async ionViewDidEnter() {
    await this.initMap();
    this.startTracking();
    if (this.destinationCoords) {
      // Small delay to ensure map view is ready
      setTimeout(() => {
        this.findRoute();
      }, 100);
    }
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

          this.checkProximityToHotspots();

          // Check route deviation
          this.checkRouteDeviation();

          // Periodic refresh of events (every 60s)
          const now = Date.now();
          if (this.currentRoutePath && (now - this.lastEventsRefresh > 60000)) {
            this.fetchEventsAlongRoute(this.currentRoutePath, true); // silent refresh
            this.fetchEnforcementHotspots(this.currentRoutePath, true);
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
    if (this.roadFeatureService.enableParkingAutoMark && this.currentLat && this.currentLng) {
      this.saveParkingSpotFromCoords(this.currentLat, this.currentLng, true);
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

  checkProximityToHotspots() {
    if (this.enforcementHotspots.length === 0) return;

    this.enforcementHotspots.forEach(h => {
      const distKm = this.calculateDistance(this.currentLat, this.currentLng, h.latitude, h.longitude);
      h.distanceFromUser = distKm.toFixed(1);

      const key = `${h.latitude}:${h.longitude}:${h.typicalDayOfWeek}:${h.typicalHourOfDay}`;

      if (distKm < this.roadFeatureService.voiceAlertKm && !this.spokenHotspots.has(key)) {
        this.speakEnforcementHotspot(h, distKm);
        this.spokenHotspots.add(key);
      }
    });
  }

  speakEvent(evt: any, distKm: number) {
    const type = (evt.eventType || '').toString().toUpperCase();
    let text: string;

    if (type === 'EMERGENCY_VEHICLE') {
      if (!this.roadFeatureService.enableEmergencyAlerts) {
        return;
      }
      const avgSpeedKmh = 40;
      const etaMinutes = Math.max(1, Math.round((distKm / avgSpeedKmh) * 60));
      text = `Emergency vehicle approaching your way in ${etaMinutes} minutes.`;
    } else {
      text = `Caution. ${evt.eventType} reported ${distKm.toFixed(1)} kilometers ahead.`;
    }

    this.speak(text);
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
    if (!this.roadFeatureService.enableTrafficReports || this.roadFeatureService.reportingPaused) {
      return;
    }
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

  async autoReportPothole(evt: { severity: number }) {
    try {
      const pos = await this.locationService.getCurrentLocation();
      this.api.sendReport(`Pothole auto-reported via AI (Severity ${evt.severity.toFixed(1)})`, pos, 'POTHOLE').subscribe({
        next: () => this.showToast('Pothole auto-reported.'),
        error: () => this.showToast('Failed to auto-report.')
      });
    } catch {
      this.showToast('Location unavailable. Could not auto-report pothole.');
    }
  }

  saveParkingSpotFromCoords(lat: number, lng: number, silent = false) {
    const data = {
      lat,
      lng,
      savedAt: new Date().toISOString(),
      source: 'navigation'
    };
    localStorage.setItem('anooco_parking_spot', JSON.stringify(data));
    if (!silent) {
      this.showToast('Parking location saved.');
      this.speak('Parking location saved.');
    }
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

  recenterMap() {
    this.getCurrentLocation();
    this.map?.setView([this.currentLat, this.currentLng], 17);
    this.showToast('Recentered');
  }

  async reportEvent(type: string) {
    try {
      const pos = await this.locationService.getCurrentLocation();
      const reportText = `Manual report: ${type}`;
      
      this.api.sendReport(reportText, pos, type).subscribe({
        next: () => {
          this.showToast(`${type} reported successfully!`);
          this.speak(`${type} reported.`);
          
          // Optimistically add marker
          if (this.map && pos.coords) {
             const marker = L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
                radius: 8,
                fillColor: this.getColor(type),
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
             }).bindPopup(`<b>${type}</b><br>Just reported`).addTo(this.map);
             this.eventMarkers.push(marker);
          }
        },
        error: () => this.showToast('Failed to report event.')
      });
    } catch (e) {
      this.showToast('Location unavailable for report.');
    }
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
      this.showToast('Location unavailable. Showing default map. Please enable GPS.');
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
    const targetState = !this.handsFreeEnabled;

    if (targetState) {
      try {
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            this.showToast('Speech recognition permission is required for hands-free mode.');
            return;
          }
        }
      } catch (e) {
        console.warn('Speech recognition permission error', e);
        this.showToast('Speech recognition is not available on this device.');
        return;
      }
    }

    this.handsFreeEnabled = targetState;
    this.cdr.detectChanges();

    if (this.handsFreeEnabled) {
      this.showToast('Hands-free on. Say "Hey Anooco" or a report command.');
      this.speak('Hands-free mode on. You can say Hey Anooco or directly say a report like report pothole.');
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
        // Continuous listening for wake word or full command
        const res = await SpeechRecognition.start({
          language: "en-US",
          maxResults: 1,
          prompt: "Say 'Hey Anooco' or 'Hey Scout'",
          partialResults: false,
          popup: false,
        });

        const raw = (res.matches && res.matches[0]) ? res.matches[0] : "";
        const text = raw.toLowerCase();

        // Relaxed wake detection: allows "Hey Scout", "Scout", "Echo", etc.
        const hasWake = text.includes("hey anooco") || text.includes("hey scout") || text.includes("hey echo") ||
                        text.includes("scout") || text.includes("echo");

        if (hasWake) {
           // Check for embedded commands in wake phrase
           if (text.includes("beam") && text.includes("emergency")) {
               this.handleEmergencyBeamCommand();
               continue;
           }
           if (text.includes("take me to my car") || text.includes("my car")) {
               this.navigateToCar();
               continue;
           }

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
    if (lower.includes('scout') || lower.includes('echo')) {
      if (lower.includes('on') || lower.includes('start')) {
        if (!this.handsFreeEnabled) {
          await this.toggleHandsFree();
        } else {
          this.speak('Hands-free already on.');
        }
        return;
      }
      if (lower.includes('off') || lower.includes('stop')) {
        if (this.handsFreeEnabled) {
          await this.toggleHandsFree();
        } else {
          this.speak('Hands-free already off.');
        }
        return;
      }
      if (lower.includes('pause') || lower.includes('mute')) {
        this.roadFeatureService.setReportingPaused(true);
        this.speak('Reporting paused.');
        return;
      }
      if (lower.includes('resume') || lower.includes('unpause')) {
        this.roadFeatureService.setReportingPaused(false);
        this.speak('Reporting resumed.');
        return;
      }
      if (lower.includes('take me to my car') || lower.includes('my car')) {
        this.navigateToCar();
        return;
      }
      if (lower.includes('park here') || lower.includes('save parking') || lower.includes('save my car')) {
        if (this.currentLat && this.currentLng) {
          this.saveParkingSpotFromCoords(this.currentLat, this.currentLng);
        } else {
          try {
            const pos = await this.locationService.getCurrentLocation();
            this.saveParkingSpotFromCoords(pos.coords.latitude, pos.coords.longitude);
          } catch {
            this.speak('Location unavailable. Could not save parking.');
          }
        }
        return;
      }
      if (lower.includes('beam') && lower.includes('emergency')) {
        await this.handleEmergencyBeamCommand();
        return;
      }
    }

    if (lower.includes('take me to my car') || lower.includes('my car')) {
      this.navigateToCar();
      return;
    }

    if (lower.includes('park here') || lower.includes('save parking') || lower.includes('save my car')) {
      try {
        const pos = await this.locationService.getCurrentLocation();
        this.saveParkingSpotFromCoords(pos.coords.latitude, pos.coords.longitude);
      } catch {
        this.speak('Location unavailable. Could not save parking.');
      }
      return;
    }

    const pos = await this.locationService.getCurrentLocation();

    if (this.roadFeatureService.reportingPaused) {
      this.speak('Reporting is currently paused.');
      return;
    }

    if (lower.includes('pothole')) {
      if (!this.roadFeatureService.enablePotholeReports) {
        this.speak('Pothole reporting is disabled in settings.');
        return;
      }
      this.api.sendReport('Pothole reported via Voice', pos, 'POTHOLE').subscribe();
      this.speak("Pothole reported.");
    } else if (lower.includes('accident')) {
      if (!this.roadFeatureService.enableAccidentReports) {
        this.speak('Accident reporting is disabled in settings.');
        return;
      }
      this.api.sendReport('Accident reported via Voice', pos, 'ACCIDENT').subscribe();
      this.speak("Accident reported.");
    } else if (lower.includes('traffic')) {
      if (!this.roadFeatureService.enableTrafficReports) {
        this.speak('Traffic reporting is disabled in settings.');
        return;
      }
      this.api.sendReport('Traffic reported via Voice', pos, 'TRAFFIC').subscribe();
      this.speak("Traffic reported.");
    } else if (lower.includes('police')) {
      if (!this.roadFeatureService.enableEnforcementReports) {
        this.speak('Enforcement reporting is disabled in settings.');
        return;
      }
      this.api.sendReport('Police reported via Voice', pos, 'POLICE').subscribe();
      this.speak("Police reported.");
    } else if (lower.includes('beam') && lower.includes('emergency')) {
      await this.handleEmergencyBeamCommand();
    } else {
      this.speak("Sorry, I didn't catch that.");
    }
  }

  private async handleEmergencyBeamCommand() {
    this.speak("Emergency beam activated. Alerting contacts.");
    this.showToast('Emergency Beam Activated');

    try {
        const pos = await this.locationService.getCurrentLocation();
        this.api.sendReportWithQueue('EMERGENCY BEAM ACTIVATED', pos, 'emergency')
          .subscribe({
            next: () => this.showToast('Emergency alert sent.'),
            error: () => this.showToast('Failed to send emergency alert.')
          });
    } catch (e) {
        console.error(e);
        this.showToast('Could not get location for emergency.');
    }
  }

  navigateToCar() {
    const stored = localStorage.getItem('anooco_parking_spot');
    if (!stored) {
      this.speak('No parking location saved.');
      this.showToast('No parking location saved.');
      return;
    }
    try {
      const data = JSON.parse(stored);
      if (!data.lat || !data.lng) {
        this.speak('Parking location is invalid.');
        return;
      }
      const query = encodeURIComponent(`${data.lat},${data.lng}`);
      this.speak('Opening route to your car.');
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_system');
    } catch {
      this.speak('Parking location is invalid.');
    }
  }

  onSearchInput(event: any, type: 'start' | 'end') {
    const query = event.detail.value;

    if (type === 'end') {
      this.destinationCoords = null;
    }

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
    this.enforcementHotspots = [];
    this.spokenEvents.clear();
    this.spokenHotspots.clear();

    // Clear old route
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }

    // Clear old markers
    this.eventMarkers.forEach(m => m.remove());
    this.eventMarkers = [];
    this.enforcementMarkers.forEach(m => m.remove());
    this.enforcementMarkers = [];

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

      if (this.destinationCoords) {
        endCoords = this.destinationCoords;
      } else {
        const endRes = await this.geocode(this.endLocation);
        if (endRes) {
          endCoords = endRes;
        } else {
          this.showToast('Destination not found.');
          this.isLoading = false;
          return;
        }
      }

      this.routingControl = (L as any).Routing.control({
        waypoints: [
          startCoords,
          endCoords
        ],
        routeWhileDragging: false,
        show: false, // Hide the default instructions panel for cleaner UI
        addWaypoints: false
      }).on('routesfound', (e: any) => {
        const routes = e.routes || [];
        if (!routes.length) {
          this.showToast('No route found.');
          this.isLoading = false;
          return;
        }
        this.selectSmoothestRoute(routes);
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

  async fetchRouteSmoothness(path: number[][]) {
    this.api.getRouteSmoothness(path, this.alertRadius).subscribe({
      next: (data: any) => {
        if (!this.routeStats) {
          return;
        }

        this.routeStats = {
          ...this.routeStats,
          roughnessIndex: data?.roughnessIndex ?? 0,
          potholeCount: data?.potholeCount ?? 0,
          potholesLast24h: data?.potholesLast24h ?? 0
        };
      },
      error: (err: any) => {
        console.error(err);
      }
    });
  }

  async fetchEnforcementHotspots(path: number[][], silent = false) {
    this.api.getEnforcementHotspots(path, this.alertRadius).subscribe({
      next: (data: any) => {
        this.enforcementHotspots = Array.isArray(data?.hotspots) ? data.hotspots : [];
        this.plotEnforcementHotspots(this.enforcementHotspots);

        if (!silent && this.enforcementHotspots.length > 0) {
          this.showToast(`Enforcement hotspots nearby: ${this.enforcementHotspots.length}`);
        }
      },
      error: (err: any) => {
        console.error(err);
      }
    });
  }

  private selectSmoothestRoute(routes: any[]) {
    const paths = routes.map((route: any) =>
      route.coordinates.map((c: any) => [c.lat, c.lng]) as number[][]
    );

    const summaries = routes.map((route: any) => ({
      distanceKm: route.summary.totalDistance / 1000,
      durationMin: Math.round(route.summary.totalTime / 60)
    }));

    const smoothnessRequests = paths.map(path =>
      this.api.getRouteSmoothness(path, this.alertRadius)
    );

    forkJoin(smoothnessRequests).subscribe({
      next: (results: any[]) => {
        let bestIndex = 0;
        let bestScore = Number.POSITIVE_INFINITY;

        results.forEach((data, index) => {
          const score = data?.roughnessIndex ?? 1;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });

        const bestPath = paths[bestIndex];
        const summary = summaries[bestIndex];
        const data = results[bestIndex] || {};

        this.currentRoutePath = bestPath;
        this.lastEventsRefresh = Date.now();

        this.routeStats = {
          distance: summary.distanceKm.toFixed(1) + ' km',
          duration: summary.durationMin + ' min',
          roughnessIndex: data.roughnessIndex ?? 0,
          potholeCount: data.potholeCount ?? 0,
          potholesLast24h: data.potholesLast24h ?? 0
        };

        this.fetchEventsAlongRoute(bestPath);
        this.fetchEnforcementHotspots(bestPath);

        this.isLoading = false;
      },
      error: (err: any) => {
        console.error(err);

        const route = routes[0];
        const path = paths[0];
        const summary = summaries[0];

        this.currentRoutePath = path;
        this.lastEventsRefresh = Date.now();

        this.routeStats = {
          distance: summary.distanceKm.toFixed(1) + ' km',
          duration: summary.durationMin + ' min'
        };

        this.fetchEventsAlongRoute(path);
        this.fetchEnforcementHotspots(path);

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

  plotEnforcementHotspots(hotspots: any[]) {
    if (!this.map) return;

    this.enforcementMarkers.forEach(m => m.remove());
    this.enforcementMarkers = [];

    hotspots.forEach(h => {
      const marker = L.circleMarker([h.latitude, h.longitude], {
        radius: 10,
        fillColor: '#eb445a',
        color: '#ffffff',
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.4
      }).bindPopup(`
        <b>Enforcement hotspot</b><br>
        Typically active on ${this.getDayName(h.typicalDayOfWeek)} around ${h.typicalHourOfDay}:00
      `).addTo(this.map!);

      this.enforcementMarkers.push(marker);
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
      case 'EMERGENCY_VEHICLE': return 'flash';
      default: return 'alert-circle';
    }
  }

  getColor(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return '#ffc409'; // Warning
      case 'ACCIDENT': return '#eb445a'; // Danger
      case 'POLICE': return '#3880ff'; // Primary
      case 'TRAFFIC': return '#ffc409';
      case 'EMERGENCY_VEHICLE': return '#9c27b0';
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

  private getDayName(index: number): string {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (index < 0 || index >= names.length) {
      return 'Unknown';
    }
    return names[index];
  }

  speakEnforcementHotspot(h: any, distKm: number) {
    const day = this.getDayName(h.typicalDayOfWeek);
    const hour = h.typicalHourOfDay ?? 0;
    const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
    const text = `Caution. Enforcement hotspot about ${distKm.toFixed(1)} kilometers ahead. Typically active on ${day} around ${hourLabel}.`;
    this.speak(text);
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
