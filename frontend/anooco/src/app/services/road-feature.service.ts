import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { LocationService } from './location.service';

@Injectable({
  providedIn: 'root'
})
export class RoadFeatureService {
  // Observables for UI
  potholeDetected$ = new Subject<{ severity: number, timestamp: number }>();
  speedAlert$ = new Subject<{ speed: number, limit: number }>();

  // Config
  private readonly SPEED_LIMIT_KMH = 120; // Default limit
  private readonly POTHOLE_THRESHOLD = 15; // m/s^2 (Gravity is ~9.8)

  private lastSpeedCheck = 0;

  constructor(
    private locationService: LocationService,
    private ngZone: NgZone
  ) { }

  startMonitoring() {
    // 1. Start Accelerometer for Potholes
    this.startAccelerometer();

    // 2. Monitor Speed
    this.locationService.position$.subscribe(pos => {
      if (pos && pos.coords) {
        this.checkSpeed(pos.coords.speed); // speed is in m/s
      }
    });
  }

  private startAccelerometer() {
    // Use Web API for devicemotion
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', (event) => {
        this.processMotion(event);
      }, true);
    } else {
      console.warn('DeviceMotionEvent not supported');
    }
  }

  private processMotion(event: DeviceMotionEvent) {
    if (!event.accelerationIncludingGravity) return;

    const { x, y, z } = event.accelerationIncludingGravity;
    if (x === null || y === null || z === null) return;

    // Simple magnitude calculation
    const magnitude = Math.sqrt(x*x + y*y + z*z);

    // If magnitude exceeds threshold (approx > 1.5G)
    if (magnitude > this.POTHOLE_THRESHOLD) {
      // Debounce/Throttle could be added here
      this.ngZone.run(() => {
        this.potholeDetected$.next({
          severity: magnitude,
          timestamp: Date.now()
        });
      });
    }
  }

  private checkSpeed(speedMs: number | null) {
    if (speedMs === null) return;
    
    // Convert m/s to km/h
    const speedKmh = speedMs * 3.6;

    // Simple alert logic
    if (speedKmh > this.SPEED_LIMIT_KMH) {
      // Avoid spamming alerts (e.g., every 10 seconds)
      const now = Date.now();
      if (now - this.lastSpeedCheck > 10000) {
        this.speedAlert$.next({
          speed: Math.round(speedKmh),
          limit: this.SPEED_LIMIT_KMH
        });
        this.lastSpeedCheck = now;
      }
    }
  }
}
