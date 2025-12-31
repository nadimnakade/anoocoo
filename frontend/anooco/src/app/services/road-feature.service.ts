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
  public speedLimitKmh = 120; // Default limit
  public potholeThreshold = 15; // m/s^2 (Gravity is ~9.8)

  private lastSpeedCheck = 0;

  constructor(
    private locationService: LocationService,
    private ngZone: NgZone
  ) {
    this.loadConfig();
  }

  loadConfig() {
    const savedSpeed = localStorage.getItem('anooco_speed_limit');
    if (savedSpeed) this.speedLimitKmh = parseInt(savedSpeed, 10);

    const savedPothole = localStorage.getItem('anooco_pothole_threshold');
    if (savedPothole) this.potholeThreshold = parseFloat(savedPothole);
  }

  updateConfig(speedLimit: number, potholeSensitivity: number) {
    this.speedLimitKmh = speedLimit;
    this.potholeThreshold = potholeSensitivity;
    localStorage.setItem('anooco_speed_limit', speedLimit.toString());
    localStorage.setItem('anooco_pothole_threshold', potholeSensitivity.toString());
  }

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
    if (magnitude > this.potholeThreshold) {
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
    if (speedKmh > this.speedLimitKmh) {
      // Avoid spamming alerts (e.g., every 10 seconds)
      const now = Date.now();
      if (now - this.lastSpeedCheck > 10000) {
        this.speedAlert$.next({
          speed: Math.round(speedKmh),
          limit: this.speedLimitKmh
        });
        this.lastSpeedCheck = now;
      }
    }
  }

  async calibrateSensitivity(seconds: number = 5): Promise<number> {
    return new Promise((resolve) => {
      const samples: number[] = [];
      const handler = (event: DeviceMotionEvent) => {
        const a = event.accelerationIncludingGravity;
        if (!a) return;
        const x = a.x ?? 0;
        const y = a.y ?? 0;
        const z = a.z ?? 0;
        const m = Math.sqrt(x * x + y * y + z * z);
        samples.push(m);
      };
      window.addEventListener('devicemotion', handler, true);
      setTimeout(() => {
        window.removeEventListener('devicemotion', handler, true);
        let mean = 0;
        if (samples.length > 0) {
          mean = samples.reduce((p, c) => p + c, 0) / samples.length;
        }
        let variance = 0;
        for (const v of samples) {
          const d = v - mean;
          variance += d * d;
        }
        variance = samples.length ? variance / samples.length : 0;
        const std = Math.sqrt(variance);
        const newThreshold = Math.max(12, mean + std * 2);
        this.updateConfig(this.speedLimitKmh, newThreshold);
        resolve(newThreshold);
      }, seconds * 1000);
    });
  }
}
