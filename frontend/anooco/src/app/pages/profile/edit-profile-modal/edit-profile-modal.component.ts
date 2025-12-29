import { Component, Input, OnInit } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-edit-profile-modal',
  templateUrl: './edit-profile-modal.component.html',
  styleUrls: ['./edit-profile-modal.component.scss'],
  standalone: false
})
export class EditProfileModalComponent implements OnInit {
  @Input() profile: any;
  @Input() userId: string = '';

  formData = {
    username: '',
    phoneNumber: '',
    avatarUrl: ''
  };

  constructor(
    private modalCtrl: ModalController,
    private api: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    if (this.profile) {
      this.formData.username = this.profile.Username || '';
      this.formData.phoneNumber = this.profile.PhoneNumber || '';
      this.formData.avatarUrl = this.profile.AvatarUrl || '';
    }
  }

  cancel() {
    this.modalCtrl.dismiss();
  }

  save() {
    this.api.updateProfile(this.userId, this.formData).subscribe({
      next: async () => {
        const toast = await this.toastCtrl.create({
          message: 'Profile updated successfully',
          duration: 2000,
          color: 'success'
        });
        toast.present();
        this.modalCtrl.dismiss(this.formData, 'confirm');
      },
      error: async (err) => {
        const toast = await this.toastCtrl.create({
          message: 'Failed to update profile',
          duration: 2000,
          color: 'danger'
        });
        toast.present();
      }
    });
  }
}
