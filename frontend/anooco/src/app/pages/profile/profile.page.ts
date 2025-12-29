import { Component, OnInit } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { ModalController, LoadingController } from '@ionic/angular';
import { EditProfileModalComponent } from './edit-profile-modal/edit-profile-modal.component';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false
})
export class ProfilePage implements OnInit {
  profile: any = null;
  activity: any[] = [];
  userId: string = '';

  constructor(
    private api: ApiService,
    private modalCtrl: ModalController,
    private loadingCtrl: LoadingController
  ) { }

  ngOnInit() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userId = user.UserId;
      this.loadProfile();
    }
  }

  async loadProfile() {
    if (!this.userId) return;

    const loading = await this.loadingCtrl.create({
      message: 'Loading profile...',
      spinner: 'crescent'
    });
    await loading.present();

    let loadedCount = 0;
    const checkDone = () => {
      loadedCount++;
      if (loadedCount >= 2) {
        loading.dismiss();
      }
    };

    // Parallel requests
    this.api.getUserProfile(this.userId).subscribe({
      next: (data) => {
        this.profile = data;
        checkDone();
      },
      error: (err) => {
        console.error('Profile load error', err);
        checkDone();
      }
    });

    this.api.getUserActivity(this.userId).subscribe({
      next: (data: any) => {
        this.activity = data || [];
        checkDone();
      },
      error: (err) => {
        console.error('Activity load error', err);
        checkDone();
      }
    });
  }

  async openEditProfile() {
    const modal = await this.modalCtrl.create({
      component: EditProfileModalComponent,
      componentProps: {
        profile: this.profile,
        userId: this.userId
      }
    });

    modal.onWillDismiss().then((ev) => {
      if (ev.role === 'confirm') {
        this.loadProfile(); // Refresh data
      }
    });

    await modal.present();
  }
}
