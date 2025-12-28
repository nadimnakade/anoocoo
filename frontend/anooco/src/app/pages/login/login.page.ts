import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

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
    private alertController: AlertController
  ) { }

  ngOnInit() {
  }

  async onLogin() {
    if (!this.credentials.email || !this.credentials.password) {
      this.showAlert('Error', 'Please fill in all fields');
      return;
    }

    this.apiService.login(this.credentials).subscribe({
      next: (res: any) => {
        // Save user session
        localStorage.setItem('user', JSON.stringify(res));
        // Force reload to update app component state or use a subject
        window.location.href = '/dashboard'; 
      },
      error: async (err) => {
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