import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  currentPosition: any = null;

  constructor() { }

  async getCurrentLocation() {
    const coordinates = await Geolocation.getCurrentPosition();
    this.currentPosition = coordinates;
    return coordinates;
  }

  startTracking() {
    // Background tracking implementation
    // Ideally use capacitor-background-geolocation for production
    Geolocation.watchPosition({}, (position, err) => {
      if (position) {
        this.currentPosition = position;
        // Emit new position to API service
      }
    });
  }
}
