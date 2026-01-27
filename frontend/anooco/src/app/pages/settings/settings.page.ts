import { Component, OnInit } from '@angular/core';
import { RoadFeatureService } from '../../services/road-feature.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})
export class SettingsPage implements OnInit {

  constructor(
    public roadFeatureService: RoadFeatureService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
  }

  goBack() {
    this.navCtrl.back();
  }

  toggleVoice(event: any) {
    this.roadFeatureService.updateVoicePreference(event.detail.checked);
  }

  toggleGeolocation(event: any) {
    this.roadFeatureService.updateGeolocationPreference(event.detail.checked);
  }
}
