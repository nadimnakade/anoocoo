import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MenuController, ModalController, LoadingController, Platform, ToastController, AlertController, ActionSheetController, NavController, ViewWillEnter, ViewWillLeave } from '@ionic/angular';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
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
export class DashboardPage implements OnInit, OnDestroy, ViewWillEnter, ViewWillLeave {
  map: L.Map | undefined;
  events: any[] = [];
  recentEvents: any[] = [];
  isEventsLoading = false;
  watchId: string | null = null;
  userMarker: L.Marker | undefined;
  // Track announced events: ID -> { count, lastTime }
  // count 0: Not alerted
  // count 1: Alerted at distance (First warning)
  // count 2: Alerted near (Reminder)
  private alertTracker: Map<string, { count: number, lastAlertTime: number }> = new Map();
  private lastReconfirm: Map<string, number> = new Map();
  isListening = false;
  handsFreeEnabled = false;
  private abortWake = false;
  private listenTimeout: any;
  eventMarkers: L.Marker[] = [];
  showAddressTags = true;
  fullMapMode = false;
  viewMode: 'map' | 'split' | 'list' = 'map';
  showExpired = false;
  currentSpeed = 0;
  speedLimit = 120; // Default, update from config
  speedLimitSource: 'default' | 'ocr' | 'manual' = 'default';
  eventFilter: 'all' | 'pothole' = 'all';
  pendingFocusEventId: string | null = null;

  isReportModalOpen = false;
  private isPotholeAlertShowing = false;
  private lastPotholeAlertTime = 0;
  subscriptions: Subscription = new Subscription();
  isLocationBlocked = false;
  locationBlockReason: 'permission' | 'disabled' | 'unknown' = 'unknown';
  isBottomSheetOpen = false;

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

  async ionViewWillEnter() {
    this.isBottomSheetOpen = true;
    this.cdr.detectChanges();
    try {
      await KeepAwake.keepAwake();
    } catch {}
  }

  async ionViewWillLeave() {
    this.isBottomSheetOpen = false;
    this.cdr.detectChanges();
    try {
      await KeepAwake.allowSleep();
    } catch {}
  }



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

        // Prevent spam: Check if alert is showing or if recently shown (within 30s)
        const now = Date.now();
        if (this.isPotholeAlertShowing || (now - this.lastPotholeAlertTime < 30000)) {
          return;
        }

        if (!this.roadFeatureService.enablePotholeReports || this.roadFeatureService.reportingPaused) {
          return;
        }

        this.isPotholeAlertShowing = true;
        this.lastPotholeAlertTime = now;

        if (this.roadFeatureService.potholeConfirmationMode) {
          this.speak('Possible pothole detected ahead.');
          const alert = await this.alertController.create({
            header: 'Pothole Detected',
            message: `Possible pothole detected (severity ${evt.severity.toFixed(1)}). Report it?`,
            buttons: [
              {
                text: 'Ignore',
                role: 'cancel',
                handler: () => {
                  this.isPotholeAlertShowing = false;
                }
              },
              {
                text: 'Report',
                handler: async () => {
                  this.isPotholeAlertShowing = false;
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
        } else {
          // Auto-report mode - no alert needed, but we still respect the cooldown
          this.isPotholeAlertShowing = false; // Reset flag immediately since no UI is blocked
          try {
            const pos = await this.locationService.getCurrentLocation();
            this.apiService.sendReportWithQueue('Pothole auto-reported via gyro', pos, 'ai')
              .subscribe({
                next: () => {
                  this.showToast('Pothole auto-reported.');
                },
                error: () => {
                  this.showToast('Failed to auto-report pothole.', 'danger');
                }
              });
          } catch {
            this.showToast('Location unavailable. Could not auto-report pothole.', 'danger');
          }
        }
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

    // Check location status
    this.checkLocationStatus();
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        this.checkLocationStatus();
      }
    });
  }

  async checkLocationStatus() {
    try {
      // 1. Check Permissions
      const permissionStatus = await Geolocation.checkPermissions();

      if (permissionStatus.location !== 'granted') {
        // If not granted, try to request
        const request = await Geolocation.requestPermissions();
        if (request.location !== 'granted') {
          this.isLocationBlocked = true;
          this.locationBlockReason = 'permission';
          this.cdr.detectChanges();
          return;
        }
      }

      // 2. Check if Service is Enabled (by trying to get position)
      try {
        // Short timeout to verify we can get location
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 0
        });
        this.isLocationBlocked = false;
      } catch (e) {
        console.warn('Location service check failed (GPS likely off)', e);
        this.isLocationBlocked = true;
        this.locationBlockReason = 'disabled';
      }

    } catch (e) {
      console.error('Location check error', e);
      // Fallback: if we can't determine, we might block to be safe, or assume ok.
      // Given user requirement "app should not work", we block on error.
      this.isLocationBlocked = true;
      this.locationBlockReason = 'unknown';
    }
    this.cdr.detectChanges();
  }

  async openDeviceSettings() {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.Location,
        optionIOS: IOSSettings.App
      });
    } catch (e) {
      console.error('Error opening settings', e);
      // Fallback if plugin fails
      this.showToast('Could not open settings. Please open manually.', 'danger');
    }
  }

  async openSettings() {
    this.navCtrl.navigateForward('/settings');
  }

  async openTools() {
    this.navCtrl.navigateForward('/tools');
  }

  async openSettingsMenu() {
    const sheet = await this.actionSheetController.create({
      header: 'Settings',
      buttons: [
        {
          text: 'Settings',
          handler: () => this.openSettings()
        },
        {
          text: 'Tools',
          handler: () => this.openTools()
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await sheet.present();
  }

  openAlerts() {
    this.viewMode = 'list';
    this.cdr.detectChanges();
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
      // Silent enable as requested (visual feedback only)
      this.showToast('Hands-free active. Say "Scout" to command.', 'tertiary');
      this.startWakeLoop();
    } else {
      this.abortWake = true;
      this.isListening = false; // Reset listening state to prevent stuck loops
      try { await SpeechRecognition.stop(); } catch {}
      this.showToast('Hands-free mode off.');
    }
  }

  private async startWakeLoop() {
    this.abortWake = false;
    let consecutiveErrors = 0;

    while (this.handsFreeEnabled && !this.abortWake) {
      if (this.isListening) {
         // If already actively listening (for command), wait
         await new Promise(r => setTimeout(r, 1000));
         continue;
      }

      try {
        // Continuous listening for wake word (no popup, empty prompt)
        // This attempts to be as silent as possible
        // Note: Continuous calls to start() may cause audio ducking on some devices (Bluetooth fading)
        const heardText = await this.voiceService.startListening(false, "");
        const text = heardText.toLowerCase().trim();

        consecutiveErrors = 0; // Reset error count on success (even if no match but valid return)

        // Check if user said the trigger word
        if (text.includes('scout') || text.includes('hey scout') || text.includes('hey beam')) {

          // Check for "Stop" command immediately (e.g. "Scout Stop")
          if (text.includes('stop') || text.includes('off')) {
             this.toggleHandsFree();
             return;
          }

          // Parse command if present (e.g. "Scout Traffic")
          // Remove the trigger words to isolate the command
          let command = text.replace('hey scout', '').replace('hey beam', '').replace('scout', '').trim();

          if (command.length > 0) {
             // User said "Scout [Command]" - process immediately
             this.processVoiceCommand(command);
          } else {
             // User said just "Scout" - Trigger active listening for the command
             // We start a focused listening session with visual feedback (popup)
             this.isListening = true;
             this.cdr.detectChanges();

             try {
                // Use a short timeout for the command listening
                const cmd = await this.voiceService.startListening(true, "Listening...");
                if (cmd && cmd.length > 0) {
                    this.processVoiceCommand(cmd);
                }
             } catch (err) {
                // ignore command listen error
             } finally {
                this.isListening = false;
                this.cdr.detectChanges();
             }
          }
        }
      } catch (e) {
        // ignore transient errors to keep loop alive
        consecutiveErrors++;
        // If we hit multiple errors in a row, back off a bit more
        const delay = consecutiveErrors > 3 ? 2000 : 500;
        await new Promise(r => setTimeout(r, delay));
      }

      // Short pause before restarting loop to allow other audio to breathe
      // and prevent tight looping if recognizer returns immediately
      await new Promise(r => setTimeout(r, 300));
    }
  }

  onAssistantPress() {
    this.startListening();
  }

  processVoiceCommand(text: string) {
    console.log('Voice command:', text);

    const lower = text.toLowerCase();

    if (lower.includes('scout') || lower.includes('echo')) {
      if (lower.includes('on') || lower.includes('start')) {
        if (!this.handsFreeEnabled) {
          this.toggleHandsFree();
        } else {
          this.speak('Hands-free already on.');
        }
        return;
      }
      if (lower.includes('off') || lower.includes('stop')) {
        if (this.handsFreeEnabled) {
          this.toggleHandsFree();
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
      if (lower.includes('beam') && lower.includes('emergency')) {
        this.handleEmergencyBeamCommand();
        return;
      }
    }

    if (lower.includes('take me to my car') || lower.includes('my car')) {
      this.navigateToCar();
      return;
    }

    if (lower.includes('park here') || lower.includes('save parking') || lower.includes('save my car')) {
      this.saveParkingSpot();
      return;
    }

    // Direct mapping for common commands if logic service fails
    if (lower.includes('report accident') || lower.includes('accident')) {
      this.reportEvent('ACCIDENT');
      this.speak('Reporting accident.');
      return;
    }
    if (lower.includes('report traffic') || lower.includes('traffic')) {
      this.reportEvent('TRAFFIC');
      this.speak('Reporting traffic.');
      return;
    }
    if (lower.includes('report hazard') || lower.includes('pothole') || lower.includes('hazard')) {
      this.reportEvent('POTHOLE');
      this.speak('Reporting hazard.');
      return;
    }

    const intent = this.reportLogicService.parseVoiceCommand(text);

    if (intent) {
      if (this.roadFeatureService.reportingPaused) {
        this.speak('Reporting is currently paused.');
        return;
      }

      if (intent.type === 'REPORT_ACCIDENT' && !this.roadFeatureService.enableAccidentReports) {
        this.speak('Accident reporting is disabled in settings.');
        return;
      }
      if (intent.type === 'REPORT_HAZARD' && !this.roadFeatureService.enablePotholeReports) {
        this.speak('Hazard reporting is disabled in settings.');
        return;
      }
      if (intent.type === 'REPORT_ENFORCEMENT' && !this.roadFeatureService.enableEnforcementReports) {
        this.speak('Enforcement reporting is disabled in settings.');
        return;
      }
      if (intent.type === 'REPORT_TRAFFIC' && !this.roadFeatureService.enableTrafficReports) {
        this.speak('Traffic reporting is disabled in settings.');
        return;
      }

      const typeDisplay = intent.type.replace('REPORT_', '').toLowerCase();
      this.speak(`Reporting ${typeDisplay}.`);
      this.submitReportInternal(intent.type, text, 'voice');
    } else {
      this.speak("I didn't catch that. Please try again.");
    }
  }

  async reportEvent(eventType: string) {
    const rawText = `Report ${eventType.toLowerCase()}`;
    await this.submitReportInternal(`REPORT_${eventType}`, rawText, 'voice');
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

    // Optimistic Update: Show marker immediately
    const eventTypeRaw = type.replace(/^REPORT_/, ''); // Remove REPORT_ prefix if present
    const tempEvent = {
      id: `temp-${Date.now()}`,
      eventType: eventTypeRaw,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      reportType: reportType,
      confirmationsCount: 1,
      updatedAt: new Date().toISOString(),
      address: 'Locating...',
      status: 'Active',
      isTemp: true
    };
    this.events.push(tempEvent);
    this.plotEvents();

    this.apiService.sendReport(rawText, location, reportType).subscribe({
      next: () => {
        setTimeout(() => this.loadEvents(), 1000);
      },
      error: () => {
        // Remove temp event on error
        this.events = this.events.filter(e => e.id !== tempEvent.id);
        this.plotEvents();
        this.showToast('Failed to send report.', 'danger');
        this.speak("Failed to send report.");
      }
    });
  }

  async handleEmergencyBeamCommand() {
    this.speak("Emergency beam activated. Alerting contacts.");
    this.showToast('Emergency Beam Activated', 'danger');

    try {
        const pos = await this.locationService.getCurrentLocation();
        this.apiService.sendReportWithQueue('EMERGENCY BEAM ACTIVATED', pos, 'emergency')
          .subscribe({
            next: () => this.showToast('Emergency alert sent.'),
            error: () => this.showToast('Failed to send emergency alert.', 'danger')
          });
    } catch (e) {
        console.error(e);
        this.showToast('Could not get location for emergency.', 'danger');
    }
  }

  async submitReport(type: string) {
    this.setOpen(false);
    if (this.roadFeatureService.reportingPaused) {
      this.showToast('Reporting is paused in settings.', 'medium');
      this.speak('Reporting is currently paused.');
      return;
    }
    const upperType = (type || '').toUpperCase();
    if (upperType === 'ACCIDENT' && !this.roadFeatureService.enableAccidentReports) {
      this.showToast('Accident reporting disabled in settings.', 'medium');
      this.speak('Accident reporting is disabled.');
      return;
    }
    if (upperType === 'POTHOLE' && !this.roadFeatureService.enablePotholeReports) {
      this.showToast('Pothole reporting disabled in settings.', 'medium');
      this.speak('Pothole reporting is disabled.');
      return;
    }
    if (upperType === 'POLICE' && !this.roadFeatureService.enableEnforcementReports) {
      this.showToast('Enforcement reporting disabled in settings.', 'medium');
      this.speak('Enforcement reporting is disabled.');
      return;
    }
    if (upperType === 'TRAFFIC' && !this.roadFeatureService.enableTrafficReports) {
      this.showToast('Traffic reporting disabled in settings.', 'medium');
      this.speak('Traffic reporting is disabled.');
      return;
    }

    this.submitReportInternal(type, `Manual report: ${type}`, 'manual');
    this.speak(`${type} report submitted.`);
  }

  navigateToCar() {
    const stored = localStorage.getItem('anooco_parking_spot');
    if (!stored) {
      this.speak('No parking location saved.');
      this.showToast('No parking location saved.', 'medium');
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

  async saveParkingSpot() {
    try {
      let lat: number | null = null;
      let lng: number | null = null;

      try {
        const pos = await this.locationService.getCurrentLocation();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        if (this.userMarker) {
          const pos = this.userMarker.getLatLng();
          lat = pos.lat;
          lng = pos.lng;
        }
      }

      if (lat === null || lng === null) {
        this.showToast('Location unavailable. Could not save parking.', 'medium');
        this.speak('Location unavailable. Could not save parking.');
        return;
      }

      const data = {
        lat,
        lng,
        savedAt: new Date().toISOString(),
        source: 'dashboard'
      };
      localStorage.setItem('anooco_parking_spot', JSON.stringify(data));
      this.showToast('Parking location saved.', 'medium');
      this.speak('Parking location saved.');
    } catch {
      this.showToast('Failed to save parking location.', 'danger');
    }
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
        // Mark as alerted (count 1)
        this.alertTracker.set(evt.id, { count: 1, lastAlertTime: Date.now() });
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

      // Plot events if they are already loaded
      this.plotEvents();

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

    const now = Date.now();

    this.events.forEach(evt => {
      const id = evt.id || evt.Id;
      if (!id) return;

      const distance = this.calculateDistance(userLat, userLng, evt.latitude, evt.longitude);
      if (this.isMutedForEvent(evt, userLat, userLng, distance)) {
        return;
      }

      // Initialize tracker if missing
      if (!this.alertTracker.has(id)) {
        this.alertTracker.set(id, { count: 0, lastAlertTime: 0 });
      }
      const tracker = this.alertTracker.get(id)!;

      // 1. First Warning (within 2km)
      // If we haven't alerted yet (count 0) and we are within range
      if (distance < 2000 && tracker.count === 0) {
         this.speakEvent(evt, distance);
         tracker.count = 1;
         tracker.lastAlertTime = now;
         return;
      }

      // 2. Reminder (within 500m)
      // If we alerted once (count 1), are closer now, and enough time has passed
      if (distance < 500 && tracker.count === 1) {
         // Throttle reminders: must be at least 60s after first alert
         if (now - tracker.lastAlertTime > 60000) {
            this.speakEvent(evt, distance);
            tracker.count = 2; // Final state
            tracker.lastAlertTime = now;
         }
      }

      // Reconfirm proximity to extend server TTL (throttled)
      if (distance < 300) {
        const last = this.lastReconfirm.get(id) || 0;
        if (now - last > 10 * 60 * 1000) {
          this.reconfirmEvent(evt, distance);
          this.lastReconfirm.set(id, now);
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
      case 'EMERGENCY_VEHICLE': {
        if (!this.roadFeatureService.enableEmergencyAlerts) {
          return;
        }
        const avgSpeedKmh = 40;
        const etaMinutes = Math.max(1, Math.round((distanceMeters / 1000) / avgSpeedKmh * 60));
        text = `Emergency vehicle approaching your way in ${etaMinutes} minutes.`;
        break;
      }
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

  getAlertCount(): number {
    return this.getFilteredEvents().length;
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

      const lat = parseFloat(evt.latitude);
      const lng = parseFloat(evt.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

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

      const marker = L.marker([lat, lng], { icon: customIcon })
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
           const dist = this.calculateDistance(userPos.lat, userPos.lng, lat, lng);
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
      case 'EMERGENCY_VEHICLE':
        return {
          color: '#9C27B0',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 32l64 128h96l-80 96 32 160-112-64-112 64 32-160-80-96h96z"/></svg>`
        };
      default:
        return {
          color: '#757575',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm0-336c-26.5 0-48 21.5-48 48h32c0-8.8 7.2-16 16-16s16 7.2 16 16-7.2 16-16 16-16 7.2-16 16v32h32v-20c22-2.2 48-24.3 48-60 0-26.5-21.5-48-48-48zm-16 208h32v32h-32v-32z"/></svg>`
        };
    }
  }


}
