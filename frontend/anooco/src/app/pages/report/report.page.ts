import { Component } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { ApiService } from '../../services/api.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-report',
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  standalone: false
})
export class ReportPage {
  submitting = false;
  lastMessage = '';
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
    private router: Router
  ) {}

  async submit(type: string) {
    if (this.submitting) return;
    this.submitting = true;
    const loading = await this.loadingCtrl.create({
      message: 'Submitting...',
      spinner: 'crescent'
    });
    await loading.present();
    try {
      const position = await this.location.getCurrentLocation();
      const text = `Manual report: ${type}`;
      await new Promise<void>((resolve, reject) => {
        this.api.sendReport(text, position).subscribe({
          next: () => resolve(),
          error: (err) => reject(err)
        });
      });
      this.lastMessage = `${type} report submitted.`;
      await loading.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'Report Sent',
        message: this.lastMessage,
        buttons: [{ text: 'OK' }]
      });
      await alert.present();
      this.submitting = false;
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
