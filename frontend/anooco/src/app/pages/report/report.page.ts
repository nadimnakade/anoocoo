import { Component } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { ApiService } from '../../services/api.service';
import { AlertController, LoadingController, NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-report',
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  standalone: false
})
export class ReportPage {
  submitting = false;
  lastMessage = '';
  selectedType: any = null;
  capturedImage: string | undefined;

  types = [
    { key: 'ACCIDENT', label: 'Accident', color: '#D32F2F', icon: 'warning' },
    { key: 'TRAFFIC', label: 'Traffic', color: '#FBC02D', icon: 'car' },
    { key: 'POTHOLE', label: 'Pothole', color: '#D32F2F', icon: 'trail-sign' },
    { key: 'POLICE', label: 'Police', color: '#1976D2', icon: 'shield-checkmark' },
    { key: 'PARK', label: 'Parking', color: '#388E3C', icon: 'park-outline' },
    { key: 'LIFT', label: 'Lift', color: '#212121', icon: 'walk' }
  ];

  constructor(
    private location: LocationService,
    private api: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private router: Router,
    private navCtrl: NavController
  ) {}

  goBack() {
    this.navCtrl.back();
  }

  selectType(type: any) {
    this.selectedType = type;
    this.capturedImage = undefined;
  }

  cancelSelection() {
    this.selectedType = null;
    this.capturedImage = undefined;
  }

  async takePicture() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt
      });
      this.capturedImage = `data:image/jpeg;base64,${image.base64String}`;
    } catch (e) {
      console.log('User cancelled photo or error', e);
    }
  }

  async submit() {
    if (this.submitting || !this.selectedType) return;
    this.submitting = true;
    const type = this.selectedType.key;

    const loading = await this.loadingCtrl.create({
      message: 'Submitting...',
      spinner: 'crescent'
    });
    await loading.present();
    try {
      const position = await this.location.getCurrentLocation();
      const text = `Manual report: ${type}`;
      await new Promise<void>((resolve, reject) => {
        this.api.sendReport(text, position, type, this.capturedImage).subscribe({
          next: () => resolve(),
          error: (err) => reject(err)
        });
      });
      this.lastMessage = `${this.selectedType.label} report submitted.`;
      await loading.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'Report Sent',
        message: this.lastMessage,
        buttons: [{ text: 'OK' }]
      });
      await alert.present();
      this.submitting = false;
      this.cancelSelection();
      this.router.navigateByUrl('/dashboard');
    } catch (e: any) {
      await loading.dismiss();
      this.submitting = false;
      const alert = await this.alertCtrl.create({
        header: 'Error',
        message: 'Failed to send report',
        buttons: ['OK']
      });
      await alert.present();
    }
  }
}
