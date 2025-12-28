import { Component, OnInit } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-activity',
  templateUrl: './activity.page.html',
  styleUrls: ['./activity.page.scss'],
  standalone: false
})
export class ActivityPage implements OnInit {
  activities: any[] = [];
  userId: string = '';

  constructor(private api: ApiService) { }

  ngOnInit() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userId = user.UserId;
      this.loadActivity();
    }
  }

  loadActivity() {
    if (!this.userId) return;

    this.api.getUserActivity(this.userId).subscribe({
      next: (data: any) => this.activities = data,
      error: (err) => console.error('Activity load error', err)
    });
  }
}
