import { Component, OnInit } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';

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

  constructor(private api: ApiService) { }

  ngOnInit() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userId = user.UserId;
      this.loadProfile();
    }
  }

  loadProfile() {
    if (!this.userId) return;

    // Parallel requests
    this.api.getUserProfile(this.userId).subscribe({
      next: (data) => this.profile = data,
      error: (err) => console.error('Profile load error', err)
    });

    this.api.getUserActivity(this.userId).subscribe({
      next: (data: any) => this.activity = data,
      error: (err) => console.error('Activity load error', err)
    });
  }
}
