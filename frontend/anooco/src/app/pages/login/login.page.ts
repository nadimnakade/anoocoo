import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {
  credentials = {
    email: '',
    password: ''
  };

  constructor(
    private apiService: ApiService,
    private router: Router,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) { }

  ngOnInit() {
    // Check for existing session
    const userStr = localStorage.getItem('user');
    if (userStr) {
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }

  async onLogin() {
    if (!this.credentials.email || !this.credentials.password) {
      this.showAlert('Error', 'Please fill in all fields');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Logging in...',
      spinner: 'crescent'
    });
    await loading.present();

    this.apiService.login(this.credentials).subscribe({
      next: async (res: any) => {
        await loading.dismiss();
        // Save user session
        localStorage.setItem('user', JSON.stringify(res));
        // Force reload to update app component state or use a subject
        window.location.href = '/dashboard';
      },
      error: async (err) => {
        await loading.dismiss();
        this.showAlert('Login Failed', err.error || 'Invalid credentials');
      }
    });
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }
}
