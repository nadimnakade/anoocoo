import { Component, OnInit } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-dashboard-v2',
  templateUrl: './dashboard-v2.page.html',
  styleUrls: ['./dashboard-v2.page.scss'],
  standalone: false
})
export class DashboardV2Page implements OnInit {

  isMenuOpen = false;

  constructor(
    private navCtrl: NavController,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  navigateTo(path: string) {
    this.navCtrl.navigateForward(path);
    this.isMenuOpen = false;
  }

  goBack() {
    this.navCtrl.back();
  }
}
