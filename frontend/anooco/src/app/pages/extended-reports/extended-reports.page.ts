import { Component, OnInit } from '@angular/core';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-extended-reports',
  templateUrl: './extended-reports.page.html',
  styleUrls: ['./extended-reports.page.scss'],
  standalone: false
})
export class ExtendedReportsPage implements OnInit {

  reportTypes = [
    { name: 'Map Issue', icon: 'map-outline', color: 'primary' },
    { name: 'Pave', icon: 'construct-outline', color: 'warning' },
    { name: 'Road Closure', icon: 'close-circle-outline', color: 'danger' },
    { name: 'Place', icon: 'storefront-outline', color: 'success' },
    { name: 'Speed Limit', icon: 'speedometer-outline', color: 'medium' },
    { name: 'General Error', icon: 'bug-outline', color: 'dark' }
  ];

  constructor(
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) { }

  ngOnInit() {
  }

  async submitReport(type: string) {
    const loading = await this.loadingCtrl.create({
      message: 'Submitting report...',
      duration: 1000
    });
    await loading.present();

    await loading.onDidDismiss();
    
    const toast = await this.toastCtrl.create({
      message: `Thanks! ${type} report submitted.`,
      duration: 2000,
      position: 'bottom',
      color: 'success',
      icon: 'checkmark-circle'
    });
    toast.present();
  }
}
