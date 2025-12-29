import { Component } from '@angular/core';
import { ApiService } from './services/api.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  currentUser: any = null;
  isDarkMode = false;

  constructor(private api: ApiService, private toast: ToastController) {
    this.loadUser();
    this.checkTheme();
  }

  checkTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      document.body.classList.add('dark');
    } else if (savedTheme === 'light') {
      this.isDarkMode = false;
      document.body.classList.remove('dark');
    } else {
      // Use system preference if no saved theme
      this.isDarkMode = prefersDark.matches;
      if (this.isDarkMode) {
        document.body.classList.add('dark');
      }
    }
  }

  toggleTheme(event: any) {
    this.isDarkMode = event.detail.checked;
    if (this.isDarkMode) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  loadUser() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      this.currentUser = JSON.parse(userStr);
      // Refresh profile to get latest TrustScore
      if (this.currentUser.UserId) {
        this.api.getUserProfile(this.currentUser.UserId).subscribe({
          next: (profile: any) => {
            // Merge profile data
            this.currentUser = { ...this.currentUser, ...profile };
            localStorage.setItem('user', JSON.stringify(this.currentUser));
          },
          error: (err) => console.error('Failed to load profile', err)
        });
      }
    } else {
      // Fallback or redirect? For now, just keep null
      this.currentUser = { Username: 'Guest', TrustScore: 0 };
    }
  }


  async seedData() {
    this.api.seedData().subscribe({
      next: async (res: any) => {
        const t = await this.toast.create({
          message: res.Message || 'Data seeded!',
          duration: 2000,
          color: 'success'
        });
        t.present();
        // Force reload or signal update?
        // Ideally SignalR would push these new events, but SeedController doesn't broadcast yet.
        // For now, user can pull-to-refresh or reload.
      },
      error: async (err) => {
        const t = await this.toast.create({
          message: 'Seeding failed: ' + err.message,
          duration: 2000,
          color: 'danger'
        });
        t.present();
      }
    });
  }
}
