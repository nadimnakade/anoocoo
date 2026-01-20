import { Component, OnInit } from '@angular/core';
import { LoadingController, ToastController, NavController } from '@ionic/angular';
import { VehicleDataService, VehicleServiceLocation } from '../../services/vehicle-data';
import { Geolocation } from '@capacitor/geolocation';

@Component({
  selector: 'app-vehicle-services',
  templateUrl: './vehicle-services.page.html',
  styleUrls: ['./vehicle-services.page.scss'],
  standalone: false
})
export class VehicleServicesPage implements OnInit {

  segmentValue: 'gas' | 'parking' | 'ev' = 'gas';
  services: VehicleServiceLocation[] = [];
  isLoading = false;
  currentLat: number = 0;
  currentLon: number = 0;

  constructor(
    private vehicleDataService: VehicleDataService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.getCurrentLocation();
  }

  async getCurrentLocation() {
    const loading = await this.loadingCtrl.create({ message: 'Locating...' });
    await loading.present();

    try {
      const coordinates = await Geolocation.getCurrentPosition();
      this.currentLat = coordinates.coords.latitude;
      this.currentLon = coordinates.coords.longitude;
      
      this.loadServices();
    } catch (error) {
      console.error('Error getting location', error);
      this.showToast('Could not get location. Using default.');
      // Fallback location (e.g., New York City) if geolocation fails
      this.currentLat = 40.7128;
      this.currentLon = -74.0060;
      this.loadServices();
    } finally {
      loading.dismiss();
    }
  }

  segmentChanged(ev: any) {
    this.segmentValue = ev.detail.value;
    this.loadServices();
  }

  async loadServices() {
    this.isLoading = true;
    this.services = []; // Clear current list

    this.vehicleDataService.getNearbyServices(this.currentLat, this.currentLon, 5000, this.segmentValue)
      .subscribe({
        next: (data) => {
          this.services = data;
          this.isLoading = false;
          if (data.length === 0) {
            this.showToast(`No ${this.segmentValue} stations found nearby.`);
          }
        },
        error: (err) => {
          console.error(err);
          this.isLoading = false;
          this.showToast('Failed to load services.');
        }
      });
  }

  navigateToService(service: VehicleServiceLocation) {
    this.navCtrl.navigateForward('/navigation', {
      queryParams: {
        destLat: service.lat,
        destLon: service.lon,
        destName: service.name
      }
    });
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
