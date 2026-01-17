import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MenuController, ModalController, LoadingController, Platform, ToastController, AlertController, ActionSheetController, NavController } from '@ionic/angular';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { ApiService } from '../../services/api.service';
import { SignalrService } from '../../services/signalr.service';
import { Subscription } from 'rxjs';
import { VoiceService } from '../../services/voice.service';
import { ReportLogicService } from '../../services/report-logic.service';
import { RoadFeatureService } from '../../services/road-feature.service';
import { DrivingService } from '../../services/driving.service';
import { DashcamService } from '../../services/dashcam.service';
import { OcrService } from '../../services/ocr.service';
import { PotholeAiService } from '../../services/pothole-ai.service';
import { LocationService } from '../../services/location.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit, OnDestroy {
  map: L.Map | undefined;
  events: any[] = [];
  recentEvents: any[] = [];
  isEventsLoading = false;
  watchId: string | null = null;
  userMarker: L.Marker | undefined;
  spokenEvents: Set<string> = new Set(); // Track announced events to avoid spam
  private lastReconfirm: Map<string, number> = new Map();
  isListening = false;
  handsFreeEnabled = false;
  private abortWake = false;
  private listenTimeout: any;
  eventMarkers: L.Marker[] = [];
  showAddressTags = true;
  fullMapMode = false;
  viewMode: 'map' | 'split' | 'list' = 'split';
  showExpired = false;
  currentSpeed = 0;
  speedLimit = 120; // Default, update from config
  speedLimitSource: 'default' | 'ocr' | 'manual' = 'default';
  eventFilter: 'all' | 'pothole' = 'all';
  pendingFocusEventId: string | null = null;

  isReportModalOpen = false;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private menuCtrl: MenuController,
    private apiService: ApiService,
    private modalCtrl: ModalController,
    private loadingController: LoadingController,
    private signalrService: SignalrService,
    private platform: Platform,
    private cdr: ChangeDetectorRef,
    private voiceService: VoiceService,
    private reportLogicService: ReportLogicService,
    private roadFeatureService: RoadFeatureService,
    private toastController: ToastController,
    private alertController: AlertController,
    private drivingService: DrivingService,
    private actionSheetController: ActionSheetController,
    private ocrService: OcrService,
    private dashcamService: DashcamService,
    private navCtrl: NavController,
    private potholeAiService: PotholeAiService,
    private locationService: LocationService,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.subscriptions.add(
      this.signalrService.eventCreated$.subscribe(evt => {
        this.handleNewEvent(evt);
      })
    );

    this.subscriptions.add(
      this.signalrService.eventUpdated$.subscribe(evt => {
        this.handleUpdatedEvent(evt);
      })
    );

    // Subscribe to Road Features
    this.subscriptions.add(
      this.roadFeatureService.currentSpeed$.subscribe((speed: number) => {
        this.currentSpeed = speed;
        this.speedLimit = this.roadFeatureService.speedLimitKmh;
        this.speedLimitSource = this.roadFeatureService.speedLimitSource;
      })
    );

    this.subscriptions.add(
      this.roadFeatureService.potholeDetected$.subscribe(async evt => {
        console.log('Pothole detected:', evt);
        this.speak('Possible pothole detected ahead.');
        const alert = await this.alertController.create({
          header: 'Pothole Detected',
          message: `Possible pothole detected (severity ${evt.severity.toFixed(1)}). Report it?`,
          buttons: [
            {
              text: 'Ignore',
              role: 'cancel'
            },
            {
              text: 'Report',
              handler: async () => {
                try {
                  const pos = await this.locationService.getCurrentLocation();
                  this.apiService.sendReportWithQueue('Pothole detected via gyro', pos, 'ai')
                    .subscribe({
                      next: () => {
                        this.showToast('Pothole reported.');
                      },
                      error: () => {
                        this.showToast('Failed to report pothole.', 'danger');
                      }
                    });
                } catch {
                  this.showToast('Location unavailable. Could not report pothole.', 'danger');
                }
              }
            }
          ]
        });
        await alert.present();
      })
    );

    this.subscriptions.add(
      this.roadFeatureService.speedAlert$.subscribe(evt => {
        const ctx = this.roadFeatureService.speedContext;
        const suffix = ctx && ctx.trim().length > 0 ? ` ${ctx.trim()}` : '';
        this.speak(`Slow down. Speed limit is ${evt.limit}.${suffix ? ' ' + suffix : ''}`);
        this.showToast(`Speed Alert: Exceeding ${evt.limit} km/h`, 'danger');
      })
    );

    // Subscribe to Auto-Driving Mode
    this.subscriptions.add(
      this.drivingService.isDrivingMode$.subscribe(isDriving => {
        if (isDriving && !this.handsFreeEnabled) {
          this.toggleHandsFree();
          this.showToast('Driving Mode Enabled (Car Detected)', 'success');
        }
      })
    );

    // Start monitoring road features
    this.roadFeatureService.startMonitoring();

    // Try to sync any offline reports
    this.apiService.syncOfflineReports().subscribe();

    // Request speech permissions early
    this.requestSpeechPermissions();
  }

  async openSettings() {
    this.navCtrl.navigateForward('/settings');
  }

  async openTools() {
    this.navCtrl.navigateForward('/tools');
  }

  async openEventActions(evt: any) {
    const type = (evt.eventType || '').toUpperCase();
    const falseLabel = type === 'POTHOLE' ? 'Not a pothole' : type === 'TRAFFIC' ? 'Not traffic' : 'Not relevant / false';
    const clearLabel = 'Gone / cleared';

    const sheet = await this.actionSheetController.create({
      header: 'Event options',
      buttons: [
        {
          text: 'Focus on map',
          handler: () => this.focusOnEvent(evt)
        },
        {
          text: 'Confirm',
          handler: () => {
            this.apiService.confirmEvent(evt.id).subscribe({
              next: () => this.showToast('Thanks for confirming!'),
              error: () => this.showToast('Could not confirm.')
            });
          }
        },
        {
          text: clearLabel,
          handler: () => {
            this.apiService.clearEvent(evt.id).subscribe({
              next: () => this.showToast('Marked as cleared.'),
              error: () => this.showToast('Could not update.')
            });
          }
        },
        {
          text: falseLabel,
          handler: () => {
            this.apiService.reportFalseEvent(evt.id).subscribe({
              next: () => this.showToast('Marked as false.'),
              error: () => this.showToast('Could not update.')
            });
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await sheet.present();
  }

  async quickScanPotholeAi() {
    const loading = await this.loadingController.create({
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
          this.apiService.sendReportWithQueue(`Verified pothole (AI ${result.score.toFixed(2)}, conf ${confidence.toFixed(2)})`, pos, 'ai')
            .subscribe({
              next: () => this.showToast('Pothole auto-reported (verified).'),
              error: () => this.showToast('Failed to auto-report.')
            });
          return;
        }

        const alert = await this.alertController.create({
          header: 'AI Analysis',
          message: `Pothole likely detected (score: ${result.score.toFixed(2)}). Report this?`,
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Report', handler: async () => {
                const pos = await this.locationService.getCurrentLocation();
                this.apiService.sendReportWithQueue(`Pothole detected via AI (score ${result.score.toFixed(2)})`, pos, 'ai')
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
        const alert = await this.alertController.create({
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

  async quickScanSign() {
    const loading = await this.loadingController.create({
      message: 'Scanning sign...'
    });
    await loading.present();

    try {
      const texts = await this.ocrService.captureAndReadSign();
      await loading.dismiss();

      if (texts.length > 0) {
        const detectedLimit = this.extractSpeedLimitFromTexts(texts);

        if (detectedLimit) {
          const alert = await this.alertController.create({
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
          const alert = await this.alertController.create({
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

  async requestSpeechPermissions() {
    try {
      const { available } = await SpeechRecognition.available();
      if (available) {
        await SpeechRecognition.requestPermissions();
      }
    } catch (e) {
      console.warn('Speech recognition not available', e);
    }
  }

  async startListening() {
    if (this.isListening) return;

    // Show guide toast
    this.showToast('Listening... Say "Report Accident" or "Traffic Ahead"', 'tertiary');

    // Pause wake loop if active to avoid conflict
    const wasHandsFree = this.handsFreeEnabled;
    if (wasHandsFree) {
        this.abortWake = true;
        // Allow loop to exit
        await new Promise(r => setTimeout(r, 200));
        try {
            await SpeechRecognition.stop();
        } catch {}
    }

    try {
      this.isListening = true;
      this.cdr.detectChanges();

      // Start listening
      this.listenTimeout = setTimeout(async () => {
        await this.stopListening();
      }, 12000);
      const heardText = await this.voiceService.startListening();

      clearTimeout(this.listenTimeout);
      this.isListening = false;
      this.cdr.detectChanges();

      if (heardText && heardText.length > 0) {
        this.processVoiceCommand(heardText);
      } else {
        this.speak("I didn't catch that. Please try again.");
      }

    } catch (e) {
      clearTimeout(this.listenTimeout);
      this.isListening = false;
      this.cdr.detectChanges();
      console.error(e);
      // Don't speak error to avoid loop if it fails silently
    } finally {
      // Resume wake loop if it was enabled and user didn't turn it off
      if (wasHandsFree && this.handsFreeEnabled) {
          this.startWakeLoop();
      }
    }
  }

  async stopListening(userInitiated: boolean = false) {
    try {
      await SpeechRecognition.stop();
    } catch {}
    finally {
      this.isListening = false;
      clearTimeout(this.listenTimeout);
      this.cdr.detectChanges();
    }
    if (userInitiated) {
      this.speak("Stopped listening.");
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
            this.showToast('Speech recognition permission is required for hands-free mode.', 'danger');
            return;
          }
        }
      } catch (e) {
        console.warn('Speech recognition permission error', e);
        this.showToast('Speech recognition is not available on this device.', 'danger');
        return;
      }
    }

    this.handsFreeEnabled = targetState;
    this.cdr.detectChanges();

    if (this.handsFreeEnabled) {
      this.showToast('Hands-free on. Say "Hey Anooco" or a report command.', 'tertiary');
      this.speak('Hands-free mode on. You can say Hey Anooco or directly say a report like report accident.');
      this.startWakeLoop();
    } else {
      this.abortWake = true;
      try { await SpeechRecognition.stop(); } catch {}
      this.showToast('Hands-free mode turned off.');
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
        const res = await SpeechRecognition.start({
          language: "en-US",
          maxResults: 1,
          prompt: "Say 'Hey Anooco'",
          partialResults: false,
          popup: false,
        });
        const raw = (res.matches && res.matches[0]) ? res.matches[0] : "";
        const text = raw.toLowerCase();
        if (text.includes("anooco") || text.includes("hey anooco")) {
          this.speak("Listening...");
          await this.startListening();
          // startListening handles the resumption of wake loop, so we break this instance
          break;
        } else if (raw && raw.trim().length > 0) {
          this.processVoiceCommand(raw);
        }
      } catch {
        // ignore transient errors
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  onAssistantPress() {
    this.startListening();
  }

  processVoiceCommand(text: string) {
    console.log('Voice command:', text);

    const intent = this.reportLogicService.parseVoiceCommand(text);

    if (intent) {
      const typeDisplay = intent.type.replace('REPORT_', '').toLowerCase();
      this.speak(`Reporting ${typeDisplay}.`);
      this.submitReportInternal(intent.type, text, 'voice');
    } else {
      this.speak("I didn't catch that. Please try again.");
    }
  }

  async showToast(msg: string, color: string = 'primary') {
    const toast = await this.toastController.create({
      message: msg,
      duration: 3000,
      color: color,
      position: 'top'
    });
    await toast.present();
  }

  async submitReportInternal(type: string, rawText: string, reportType: 'manual' | 'voice') {
    let location: any = null;

    try {
      location = await this.locationService.getCurrentLocation();
    } catch (e) {
      console.warn('Dashboard report: geolocation failed, falling back to marker', e);
    }

    if (!location && this.userMarker) {
      const pos = this.userMarker.getLatLng();
      location = {
        coords: {
          latitude: pos.lat,
          longitude: pos.lng,
          heading: 0,
          speed: 0
        }
      };
    }

    if (!location) {
      this.showToast('Location unavailable. Please enable GPS.', 'danger');
      this.speak('Location unknown.');
      return;
    }

    this.apiService.sendReport(rawText, location, reportType).subscribe({
      next: () => {
        setTimeout(() => this.loadEvents(), 1000);
      },
      error: () => {
        this.showToast('Failed to send report.', 'danger');
        this.speak("Failed to send report.");
      }
    });
  }

  async submitReport(type: string) {
    this.setOpen(false);
    this.submitReportInternal(type, `Manual report: ${type}`, 'manual');
    this.speak(`${type} report submitted.`);
  }
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
    }
  }

  handleNewEvent(evt: any) {
    // Check if already exists to avoid duplicates
    if (this.events.find(e => e.id === evt.id)) return;

    this.events.push(evt);
    this.plotEvents();

    // Announce if nearby
    if (this.userMarker) {
      const userPos = this.userMarker.getLatLng();
      const dist = this.calculateDistance(userPos.lat, userPos.lng, evt.latitude, evt.longitude);
      if (dist < 2000) { // 2km radius for new alerts
        this.speakEvent(evt, dist);
      }
    }
  }

  handleUpdatedEvent(evt: any) {
    const index = this.events.findIndex(e => e.id === evt.id);
    if (index !== -1) {
      this.events[index] = evt;
      this.plotEvents();
    }
  }

  setOpen(isOpen: boolean) {
    this.isReportModalOpen = isOpen;
  }

  async ionViewDidEnter() {
    const focusId = this.route.snapshot.queryParamMap.get('focusEventId');
    if (focusId) {
      this.pendingFocusEventId = focusId;
    }

    const loading = await this.loadingController.create({
      message: 'Loading map data...',
      spinner: 'crescent',
      duration: 5000 // Fallback
    });
    await loading.present();

    // Wait for DOM to be ready
    setTimeout(() => {
      this.loadMap();
    }, 100);

    this.loadEvents(() => {
      if (this.pendingFocusEventId) {
        const target = this.events.find(e => {
          const id = (e.id || e.Id)?.toString();
          return id === this.pendingFocusEventId;
        });
        if (target) {
          this.focusOnEvent(target);
        }
        this.pendingFocusEventId = null;
      }
      loading.dismiss();
    });

    this.startTracking();
  }

  ionViewWillLeave() {
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
    }
  }

  openMenu() {
    this.menuCtrl.open();
  }

  toggleExpiredVisibility() {
    this.showExpired = !this.showExpired;
    this.plotEvents();
  }

  private reconfirmEvent(evt: any, distanceMeters?: number) {
    if (!evt || !evt.id) return;
    this.apiService.confirmEvent(evt.id, distanceMeters).subscribe();
  }

  private isMutedForEvent(evt: any, userLat: number, userLng: number, distanceMeters: number): boolean {
    const radius = this.roadFeatureService.mutedRadiusMeters;
    if (radius > 0 && distanceMeters <= radius) return true;
    const addr = (evt.address || evt.Address || '').toString().toLowerCase();
    if (addr && this.roadFeatureService.mutedStreets.length > 0) {
      const match = this.roadFeatureService.mutedStreets.find(s => addr.includes(s.toLowerCase()));
      if (match) return true;
    }
    return false;
  }
  toggleViewMode() {
    if (this.viewMode === 'split') {
      this.viewMode = 'map';
    } else if (this.viewMode === 'map') {
      this.viewMode = 'list';
    } else {
      this.viewMode = 'split';
    }
    this.cdr.detectChanges();
  }

  async loadMap() {
    if (this.map) {
      this.map.remove();
    }

    try {
      let lat = 35.9375;
      let lng = 14.3754;

      try {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          await Geolocation.requestPermissions();
        }
        const current = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        lat = current.coords.latitude;
        lng = current.coords.longitude;
      } catch (geoErr) {
        console.warn('Geolocation unavailable, using fallback', geoErr);
        this.showToast('Location unavailable. Showing default map. Please enable GPS.');
      }

      this.map = L.map('map', {
        zoomControl: false, // Cleaner UI
        attributionControl: false
      }).setView([lat, lng], 14);

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(this.map);

      // Initialize user marker (hidden initially until location found)
      const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);

    } catch (e) {
      console.error("Error loading map", e);
    }
  }

  async startTracking() {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }

      this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
        if (position) {
          this.updateUserLocation(position.coords.latitude, position.coords.longitude);
        }
      });
    } catch (e) {
      console.error("Error starting tracking", e);
    }
  }

  updateUserLocation(lat: number, lng: number) {
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    }

    // Optional: Center map on user periodically or if far away
    // if (this.map) this.map.setView([lat, lng]);

    this.checkNearbyEvents(lat, lng);
  }

  checkNearbyEvents(userLat: number, userLng: number) {
    if (!this.events.length) return;

    this.events.forEach(evt => {
      const distance = this.calculateDistance(userLat, userLng, evt.latitude, evt.longitude);
      if (this.isMutedForEvent(evt, userLat, userLng, distance)) {
        return;
      }

      // If event is within 500m and hasn't been spoken yet
      if (distance < 500 && !this.spokenEvents.has(evt.id)) {
        this.speakEvent(evt, distance);
        this.spokenEvents.add(evt.id);
      }
      // Reconfirm proximity to extend server TTL (throttled)
      if (distance < 300) {
        const last = this.lastReconfirm.get(evt.id) || 0;
        const now = Date.now();
        if (now - last > 10 * 60 * 1000) {
          this.reconfirmEvent(evt, distance);
          this.lastReconfirm.set(evt.id, now);
        }
      }
    });
  }

  async speakEvent(evt: any, distanceMeters: number) {
    const distanceKm = (distanceMeters / 1000).toFixed(1);
    let text = "";

    let streetPart = "ahead";
    if (evt.address) {
       streetPart = `on ${evt.address.split(',')[0]}`; // Just the street/road name
    } else if (evt.Address) {
       streetPart = `on ${evt.Address.split(',')[0]}`;
    }

    const updatedAt = evt.updatedAt || evt.UpdatedAt;
    let potholeWindow = '';
    if (updatedAt) {
      const t = new Date(updatedAt).getTime();
      if (!isNaN(t)) {
        const hours = (Date.now() - t) / (1000 * 60 * 60);
        if (hours <= 24) {
          potholeWindow = 'in this street in the last 24 hours';
        }
      }
    }

    switch (evt.eventType?.toUpperCase()) {
      case 'POTHOLE':
        if (potholeWindow) {
          text = `Caution. Potholes reported ${potholeWindow}.`;
        } else {
          text = `Caution. Potholes ${streetPart} in ${distanceKm} kilometers.`;
        }
        break;
      case 'ACCIDENT':
        text = `Warning. Accident reported ${streetPart} ${distanceKm} kilometers ahead.`;
        break;
      case 'POLICE':
        text = `Police check reported ${streetPart} in ${distanceKm} kilometers.`;
        break;
      case 'TRAFFIC':
        text = `Heavy traffic ${streetPart} in ${distanceKm} kilometers.`;
        break;
      default:
        text = `${evt.eventType} reported ${streetPart} ${distanceKm} kilometers ahead.`;
    }

    this.speak(text);
  }

  speak(text: string) {
    this.voiceService.speak(text);
  }

  setEventFilter(filter: 'all' | 'pothole') {
    this.eventFilter = filter;
    this.plotEvents();
  }

  getFilteredEvents(): any[] {
    return this.events.filter(evt => {
      const status = (evt.status || evt.Status || '').toString().toLowerCase();
      const expired = status === 'expired' || status === 'inactive' || evt.isExpired === true;
      if (!this.showExpired && expired) return false;
      if (this.eventFilter === 'pothole' && (evt.eventType || '').toUpperCase() !== 'POTHOLE') return false;
      return true;
    });
  }

  // Haversine formula to calculate distance in meters
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  }

  loadEvents(callback?: () => void) {
    this.isEventsLoading = true;
    this.apiService.getEvents().subscribe({
      next: (data: any) => {
        this.events = Array.isArray(data) ? data : [];
        this.isEventsLoading = false;
        if (!this.events.length && Array.isArray(data)) {
          this.recentEvents = data.slice(0, 3);
        } else {
          this.recentEvents = [];
        }
        this.plotEvents();
        if (callback) callback();
      },
      error: (err) => {
        console.error('Error loading events', err);
        this.isEventsLoading = false;
        if (callback) callback();
      }
    });
  }

  plotEvents() {
    if (!this.map) return;

    this.eventMarkers.forEach(m => m.remove());
    this.eventMarkers = [];

    const filtered = this.getFilteredEvents();

    filtered.forEach(evt => {
      const type = evt.eventType?.toUpperCase() || 'UNKNOWN';
      const config = this.getMarkerConfig(type);
      const status = (evt.status || evt.Status || '').toString().toLowerCase();
      const expired = status === 'expired' || status === 'inactive' || evt.isExpired === true;

      const customIcon = L.divIcon({
        className: 'custom-event-marker-container', // Wrapper class if needed, or empty
        html: `
          <div class="custom-event-marker" style="
            background-color: ${expired ? '#9E9E9E' : config.color};
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            opacity: ${expired ? 0.7 : 1};
          ">
            ${config.icon}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16], // Center it
        popupAnchor: [0, -16]
      });

      const marker = L.marker([evt.latitude, evt.longitude], { icon: customIcon })
        .bindPopup(`
          <div style="text-align: center;">
            <h3 style="margin: 0; color: ${config.color};">${evt.eventType}</h3>
            ${evt.address || evt.Address ? `<p style="margin: 5px 0; font-weight: bold;">${evt.address || evt.Address}</p>` : ''}
            <p>Confirmed: ${evt.confirmationsCount}</p>
            <p style="font-size: 0.8em; color: #666;">${new Date(evt.updatedAt).toLocaleString()}</p>
          </div>
        `)
        .addTo(this.map!);

      if (this.showAddressTags && (evt.address || evt.Address)) {
        const street = (evt.address || evt.Address).split(',')[0];
        marker.bindTooltip(`${evt.eventType}: ${street}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -20],
          className: 'event-label'
        }).openTooltip();
      }

      // Add click listener to speak event details
      marker.on('click', () => {
        // We pass 0 distance to force immediate speech without "in X km" prefix logic if we want,
        // or we calculate actual distance. Let's calculate actual distance.
        if (this.userMarker) {
           const userPos = this.userMarker.getLatLng();
           const dist = this.calculateDistance(userPos.lat, userPos.lng, evt.latitude, evt.longitude);
           this.speakEvent(evt, dist);
           this.reconfirmEvent(evt);
        } else {
           // Fallback if user location unknown, just speak generic
           this.speak(`${evt.eventType} selected.`);
        }
      });
      this.eventMarkers.push(marker);
    });
  }

  focusOnEvent(evt: any) {
    if (this.map) {
      this.map.flyTo([evt.latitude, evt.longitude], 16);

      // Calculate distance and speak
      if (this.userMarker) {
        const userPos = this.userMarker.getLatLng();
        const dist = this.calculateDistance(userPos.lat, userPos.lng, evt.latitude, evt.longitude);
        this.speakEvent(evt, dist);
      } else {
        this.speak(`${evt.eventType} selected.`);
      }
    }
  }

  async onManualReport() {
    this.setOpen(true);
  }

  async navigateTo(type: 'HOME' | 'WORK') {
    const key = type === 'HOME' ? 'anooco_home_address' : 'anooco_work_address';
    const address = localStorage.getItem(key);

    if (!address) {
      this.showToast(`No ${type.toLowerCase()} address saved. Go to Tools > Navigation to set it.`);
      return;
    }

    this.speak(`Navigating to ${type.toLowerCase()}`);
    // Open Google Maps
    const query = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_system');
  }

  getMarkerConfig(type: string) {
    // Return SVG strings directly to avoid Web Component issues in Leaflet
    switch (type) {
      case 'ACCIDENT':
        return {
          color: '#D32F2F',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 32L32 464h448L256 32zm0 80l160 320H96L256 112zm0 88c-13.3 0-24 10.7-24 24v80c0 13.3 10.7 24 24 24s24-10.7 24-24v-80c0-13.3-10.7-24-24-24zm0 160c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24z"/></svg>`
        };
      case 'POTHOLE':
        return {
          color: '#D32F2F',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M469.6 153.9c-15.8-3.4-36.2-7-59.6-10.6l-19.2-85.3c-4.9-21.7-26.6-35.1-48.3-30.2L91.6 83.9C69.9 88.8 56.5 110.5 61.4 132.2l19.2 85.3c-27.1 26.6-43.9 63.8-43.9 104.9 0 81.1 66.2 146.9 148.2 146.9h142.3c81.9 0 148.2-65.8 148.2-146.9 0-59.5-35-110.4-85.8-135.5zM294.5 98.4l19.2 85.3c-48.4-6.4-98.8-6.4-147.2 0l-19.2-85.3 147.2-33.1z"/></svg>`
        };
      case 'POLICE':
        return {
          color: '#1976D2',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 32C174 69.1 96 85.2 32 96c0 128 16 256 224 384 208-128 224-256 224-384-64-10.8-142-26.9-224-64z"/></svg>`
        };
      case 'TRAFFIC':
        return {
          color: '#FBC02D',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M112 48h288L448 464H64L112 48zm64 48H128l-16 128h64V96zm128 0h-48v128h64l-16-128zM128 352l-16 64h288l-16-64H128z"/></svg>`
        };
      case 'PARK':
        return {
          color: '#388E3C',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M416 160c0-70.7-57.3-128-128-128H208C120 32 32 104 32 208c0 78.4 49.3 146.1 118.8 168.4L128 480h48l24-96h88c70.7 0 128-57.3 128-128zM208 288h-48v-96h48c26.5 0 48 21.5 48 48s-21.5 48-48 48z"/></svg>`
        };
      case 'LIFT':
        return {
          color: '#212121',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M128 416H64V128h64v288zm32-288v288h224c17.7 0 32-14.3 32-32 0-3.6-.6-7.1-1.7-10.4l-32-96c-5-15.1-19.2-25.6-35.1-25.6H208c-17.7 0-32 14.3-32 32zm0-64h128c17.7 0 32 14.3 32 32v32h-32V96H160v32zm256 96h32c17.7 0 32 14.3 32 32v160c0 17.7-14.3 32-32 32h-32V160z"/></svg>`
        };
      default:
        return {
          color: '#757575',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm0-336c-26.5 0-48 21.5-48 48h32c0-8.8 7.2-16 16-16s16 7.2 16 16-7.2 16-16 16-16 7.2-16 16v32h32v-20c22-2.2 48-24.3 48-60 0-26.5-21.5-48-48-48zm-16 208h32v32h-32v-32z"/></svg>`
        };
    }
  }
}
