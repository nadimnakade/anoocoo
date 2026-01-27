import { Component, OnInit } from '@angular/core';
import { ToastController, LoadingController, ModalController, NavController } from '@ionic/angular';
import { ApiService } from '../../services/api.service';

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

  recentReports: any[] = [];

  constructor(
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private api: ApiService,
    private modalCtrl: ModalController,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.loadReports();
  }

  goBack() {
    this.navCtrl.back();
  }

  ionViewWillEnter() {
    this.loadReports();
  }

  loadReports() {
    this.api.getRecentReports().subscribe({
      next: (data) => {
        this.recentReports = data;
      },
      error: (err) => {
        console.error('Failed to load reports', err);
      }
    });
  }

  getImageUrl(report: any) {
    if (!report.hasImage) return null;
    return this.api.getReportImageUrl(report.id);
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
