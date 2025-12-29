import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: false
})
export class SignupPage implements OnInit {
  user = {
    username: '',
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
  }

  async onSignup() {
    if (!this.user.email || !this.user.password) {
      this.showAlert('Error', 'Please fill in all fields');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Creating account...',
      spinner: 'crescent'
    });
    await loading.present();

    this.apiService.signup(this.user).subscribe({
      next: async (res: any) => {
        await loading.dismiss();
        // Save user session
        localStorage.setItem('user', JSON.stringify(res));
        this.router.navigate(['/dashboard']);
      },
      error: async (err) => {
        await loading.dismiss();
        this.showAlert('Signup Failed', err.error || 'Unknown error');
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
