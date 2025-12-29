import { Component, OnInit } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-activity',
  templateUrl: './activity.page.html',
  styleUrls: ['./activity.page.scss'],
  standalone: false
})
export class ActivityPage implements OnInit {
  activities: any[] = [];
  userId: string = '';

  constructor(
    private api: ApiService,
    private loadingCtrl: LoadingController
  ) { }

  ngOnInit() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userId = user.UserId;
      this.loadActivity();
    }
  }

  async loadActivity() {
    if (!this.userId) return;

    const loading = await this.loadingCtrl.create({
      message: 'Loading activity...',
      spinner: 'crescent'
    });
    await loading.present();

    this.api.getUserActivity(this.userId).subscribe({
      next: (data: any) => {
        this.activities = data;
        loading.dismiss();
      },
      error: (err) => {
        console.error('Activity load error', err);
        loading.dismiss();
      }
    });
  }
}
