import { Component, inject } from '@angular/core';
import { LoadingController, AlertController, ToastController, ActionSheetController, NavController } from '@ionic/angular';
import { OcrService } from '../../services/ocr.service';
import { DashcamService } from '../../services/dashcam.service';
import { RoadFeatureService } from '../../services/road-feature.service';
import { DrivingService } from '../../services/driving.service';
import { PotholeAiService } from '../../services/pothole-ai.service';
import { ApiService } from '../../services/api.service';
import { LocationService } from '../../services/location.service';

@Component({
  selector: 'app-tools',
  templateUrl: './tools.page.html',
  styleUrls: ['./tools.page.scss'],
  standalone: false
})
export class ToolsPage {

  private loadingController = inject(LoadingController);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private actionSheetController = inject(ActionSheetController);
  private ocrService = inject(OcrService);
  private dashcamService = inject(DashcamService);
  private roadFeatureService = inject(RoadFeatureService);
  private drivingService = inject(DrivingService);
  private potholeAiService = inject(PotholeAiService);
  private navCtrl = inject(NavController);
  private apiService = inject(ApiService);
  private locationService = inject(LocationService);



  async scanPotholeAi() {
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
          this.apiService.sendReportWithQueue(`Verified pothole (AI ${result.score.toFixed(2)}, conf ${confidence.toFixed(2)})`, pos)
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
            { text: 'Report', handler: async () => {
              const pos = await this.locationService.getCurrentLocation();
              this.apiService.sendReportWithQueue(`Pothole detected via AI (score ${result.score.toFixed(2)})`, pos)
                .subscribe({
                  next: () => this.showToast('Pothole reported.'),
                  error: () => this.showToast('Failed to report.')
                });
            }}
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
    } catch (e) {
      await loading.dismiss();
      this.showToast('AI analysis failed.');
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  // --- OCR Section ---
  async scanSign() {
    const loading = await this.loadingController.create({
      message: 'Scanning sign...',
    });
    await loading.present();

    try {
      const texts = await this.ocrService.captureAndReadSign();
      await loading.dismiss();

      if (texts.length > 0) {
        // Show result
        const alert = await this.alertController.create({
          header: 'Sign Detected',
          message: texts.join('\n'),
          buttons: ['OK']
        });
        await alert.present();
      } else {
        this.showToast('No text detected.');
      }
    } catch (e) {
      await loading.dismiss();
      console.error('OCR Error', e);
      this.showToast('Failed to scan sign.');
    }
  }

  // --- Dashcam Section ---
  async connectDashcam() {
    const alert = await this.alertController.create({
      header: 'Connect to Dashcam',
      inputs: [
        {
          name: 'ssid',
          type: 'text',
          placeholder: 'Dashcam WiFi SSID'
        },
        {
          name: 'password',
          type: 'password',
          placeholder: 'Password (if any)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Connect',
          handler: async (data) => {
            if (!data.ssid) {
              this.showToast('SSID is required');
              return false;
            }
            const loading = await this.loadingController.create({ message: 'Connecting...' });
            await loading.present();

            const success = await this.dashcamService.connectToDashcam(data.ssid, data.password);
            await loading.dismiss();

            if (success) {
              this.showToast('Connected to Dashcam!');
            } else {
              this.showToast('Failed to connect.');
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async viewDashcamRecordings() {
    if (!this.dashcamService.isConnected$.value) {
      const confirm = await this.alertController.create({
        header: 'Not Connected',
        message: 'You need to connect to the dashcam WiFi first.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Connect Now', handler: () => this.connectDashcam() }
        ]
      });
      await confirm.present();
      return;
    }

    const loading = await this.loadingController.create({ message: 'Fetching recordings...' });
    await loading.present();

    try {
      const files: any[] = await this.dashcamService.listRecordings();
      await loading.dismiss();

      if (files.length === 0) {
        this.showToast('No recordings found.');
        return;
      }

      // Show files in an action sheet or modal
      // For simplicity, let's use a simple alert list or just toast count for now,
      // or map them to an action sheet.
      const buttons = files.slice(0, 10).map((f: any) => ({
        text: f.name,
        handler: () => {
          this.showToast(`Selected: ${f.name}`);
          // Future: Download or play
        }
      }));

      buttons.push({
        text: 'Cancel',
        role: 'cancel',
        handler: () => {}
      } as any);

      const sheet = await this.actionSheetController.create({
        header: 'Recent Recordings',
        buttons: buttons
      });
      await sheet.present();

    } catch (e) {
      await loading.dismiss();
      this.showToast('Failed to list files.');
    }
  }

  // --- Configuration Section ---
  async configureAlerts() {
    const alert = await this.alertController.create({
      header: 'Alert Thresholds',
      inputs: [
        {
          name: 'speedLimit',
          type: 'number',
          placeholder: 'Speed Limit (km/h)',
          value: this.roadFeatureService.speedLimitKmh,
          label: 'Speed Limit (km/h)'
        },
        {
          name: 'potholeSensitivity',
          type: 'number',
          placeholder: 'Pothole Sensitivity (10-20)',
          value: this.roadFeatureService.potholeThreshold,
          label: 'Sensitivity (Higher = Less Sensitive)'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Save',
          handler: (data) => {
            const limit = parseInt(data.speedLimit, 10) || 120;
            const sens = parseFloat(data.potholeSensitivity) || 15;
            this.roadFeatureService.updateConfig(limit, sens);
            this.showToast(`Settings updated: Limit ${limit}km/h, Sens ${sens}`);
          }
        }
      ]
    });
    await alert.present();
  }

  async calibratePotholeSensitivity() {
    const loading = await this.loadingController.create({ message: 'Calibrating motion...' });
    await loading.present();
    try {
      const threshold = await this.roadFeatureService.calibrateSensitivity(5);
      await loading.dismiss();
      const alert = await this.alertController.create({
        header: 'Calibration Complete',
        message: `New sensitivity set to ${threshold.toFixed(1)} m/s²`,
        buttons: ['OK']
      });
      await alert.present();
    } catch {
      await loading.dismiss();
      this.showToast('Calibration failed.');
    }
  }

  async configureMuteSettings() {
    const alert = await this.alertController.create({
      header: 'Mute Settings',
      inputs: [
        {
          name: 'radius',
          type: 'number',
          placeholder: 'Mute radius (meters)',
          value: this.roadFeatureService.mutedRadiusMeters
        },
        {
          name: 'streets',
          type: 'text',
          placeholder: 'Muted streets (comma separated)',
          value: this.roadFeatureService.mutedStreets.join(', ')
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', handler: (data) => {
            const radius = parseInt(data.radius, 10) || 0;
            const streets = (data.streets || '').split(',').map((s: string) => s.trim());
            this.roadFeatureService.updateMute(radius, streets);
            this.showToast('Mute settings updated.');
          }
        }
      ]
    });
    await alert.present();
  }

  async configureSpeedContext() {
    const alert = await this.alertController.create({
      header: 'Speed Alert Context',
      inputs: [
        {
          name: 'context',
          type: 'text',
          placeholder: 'e.g., School zone ahead',
          value: this.roadFeatureService.speedContext
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Save', handler: (data) => {
            this.roadFeatureService.updateSpeedContext(data.context || '');
            this.showToast('Speed alert context saved.');
          }
        }
      ]
    });
    await alert.present();
  }

  async configureAutoStart() {
    const devices = await this.drivingService.getPairedDevices();

    const inputs = devices.map(d => ({
      type: 'radio' as const,
      label: d.name || d.address,
      value: d,
      checked: false
    }));

    inputs.unshift({
      type: 'radio' as const,
      label: 'None (Disable Auto-Start)',
      value: null,
      checked: false
    });

    const alert = await this.alertController.create({
      header: 'Select Car Bluetooth',
      inputs: inputs,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Save',
          handler: (data) => {
            if (data) {
              this.drivingService.saveCarDevice(data.name, data.address);
              this.showToast(`Auto-start set to: ${data.name}`);
            } else {
              // Handle disable
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private async showToast(msg: string, color: string = 'primary') {
    const toast = await this.toastController.create({
      message: msg,
      duration: 2000,
      color: color,
      position: 'bottom'
    });
    await toast.present();
  }
}
