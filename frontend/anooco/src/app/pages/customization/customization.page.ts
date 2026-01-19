import { Component, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-customization',
  templateUrl: './customization.page.html',
  styleUrls: ['./customization.page.scss'],
  standalone: false
})
export class CustomizationPage implements OnInit {

  settings = {
    mapMode: 'auto',
    carIcon: 'arrow',
    voice: 'scout'
  };

  constructor(private toastCtrl: ToastController) { }

  ngOnInit() {
    // Load settings from storage if implemented
  }

  settingChanged(setting: string, event: any) {
    const value = event.detail.value;
    
    // In a real app, we would save this to persistent storage here
    console.log(`Setting ${setting} changed to ${value}`);
    
    this.showToast(`${this.formatName(setting)} updated to ${this.formatValue(value)}`);
  }

  getCarIconName(): string {
    switch (this.settings.carIcon) {
      case 'racecar': return 'car-sport';
      case 'truck': return 'bus'; // Closest approximation
      case 'cat': return 'paw';
      default: return 'navigate'; // Arrow
    }
  }

  getCarIconColor(): string {
    switch (this.settings.carIcon) {
      case 'racecar': return 'danger';
      case 'truck': return 'warning';
      case 'cat': return 'tertiary';
      default: return 'primary';
    }
  }

  private formatName(name: string): string {
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  private formatValue(val: string): string {
    return val.charAt(0).toUpperCase() + val.slice(1);
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 1500,
      position: 'bottom'
    });
    toast.present();
  }
}
