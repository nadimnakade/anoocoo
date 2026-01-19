import { Component, OnInit } from '@angular/core';
import { ToastController, AlertController } from '@ionic/angular';

@Component({
  selector: 'app-social',
  templateUrl: './social.page.html',
  styleUrls: ['./social.page.scss'],
  standalone: false
})
export class SocialPage implements OnInit {

  isVisible: boolean = true;
  friends = [
    { id: 1, name: 'Alice', status: 'Driving', avatar: 'https://i.pravatar.cc/150?u=alice' },
    { id: 2, name: 'Bob', status: 'Online', avatar: 'https://i.pravatar.cc/150?u=bob' },
    { id: 3, name: 'Charlie', status: 'Offline', avatar: 'https://i.pravatar.cc/150?u=charlie' }
  ];

  constructor(
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
  }

  async sendBeep(friendName: string) {
    const toast = await this.toastCtrl.create({
      message: `Beep sent to ${friendName}! 🚗💨`,
      duration: 2000,
      color: 'primary',
      position: 'bottom'
    });
    toast.present();
  }

  async addFriend() {
    const alert = await this.alertCtrl.create({
      header: 'Add Friend',
      inputs: [
        {
          name: 'username',
          type: 'text',
          placeholder: 'Username or Email'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add',
          handler: (data) => {
            if (data.username) {
              this.showToast(`Friend request sent to ${data.username}`);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}
