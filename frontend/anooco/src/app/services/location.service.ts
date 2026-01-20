import { Injectable } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private positionSubject = new BehaviorSubject<Position | null>(null);
  public position$: Observable<Position | null> = this.positionSubject.asObservable();

  currentPosition: any = null;
  watchId: string | null = null;
  private isEnabled = true;

  constructor() { }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stopTracking();
    }
  }

  async getCurrentLocation() {
    if (!this.isEnabled) {
      console.warn('Geolocation is disabled by user settings.');
      throw new Error('Geolocation disabled');
    }
    const coordinates = await Geolocation.getCurrentPosition();
    this.currentPosition = coordinates;
    this.positionSubject.next(coordinates);
    return coordinates;
  }

  async startTracking() {
    if (!this.isEnabled) {
      console.warn('Geolocation is disabled by user settings. Tracking not started.');
      return;
    }
    if (this.watchId) return;

    this.watchId = await Geolocation.watchPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }, (position, err) => {
      if (position) {
        this.currentPosition = position;
        this.positionSubject.next(position);
      }
    });
  }

  async stopTracking() {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }
}
