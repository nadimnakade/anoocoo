import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { LocationService } from './location.service';
import { VoiceService } from './voice.service';

@Injectable({
  providedIn: 'root'
})
export class RoadFeatureService {
  // Observables for UI
  potholeDetected$ = new Subject<{ severity: number, timestamp: number }>();
  speedAlert$ = new Subject<{ speed: number, limit: number }>();
  currentSpeed$ = new Subject<number>();
  trafficDetected$ = new Subject<void>();

  // Config
  public speedLimitKmh = 120; // Default limit
  public potholeThreshold = 15; // m/s^2 (Gravity is ~9.8)
  public mutedRadiusMeters = 0;
  public alertRadiusKm = 2; // Default 2km
  public potholeConfirmationMode = true; // Default to prompting user
  public voiceAlertKm = 0.7;
  public mutedStreets: string[] = [];
  public speedContext = '';
  public speedLimitSource: 'default' | 'ocr' | 'manual' = 'default';
  public trafficSlowMinKmh = 2;
  public trafficSlowMaxKmh = 8;
  public trafficSustainSamples = 20;
  public trafficCooldownMs = 300000;
  public trafficResetSpeedKmh = 10;
  public trafficStoppedThresholdKmh = 0.2;
  public enableAccidentReports = true;
  public enablePotholeReports = true;
  public enableTrafficReports = true;
  public enableEnforcementReports = true;
  public enableEmergencyAlerts = true;
  public enableParkingAutoMark = false;
  public reportingPaused = false;
  public enableVoice = true;
  public enableGeolocation = true;

  private lastSpeedCheck = 0;
  private lastPotholeSpike: { severity: number, timestamp: number } | null = null;

  // Traffic detection
  private lowSpeedSamples = 0;
  private lastTrafficReport = 0;

  constructor(
    private locationService: LocationService,
    private ngZone: NgZone,
    private voiceService: VoiceService
  ) {
    this.loadConfig();
  }

  loadConfig() {
    const savedSpeed = localStorage.getItem('anooco_speed_limit');
    if (savedSpeed) this.speedLimitKmh = parseInt(savedSpeed, 10);

    const savedPothole = localStorage.getItem('anooco_pothole_threshold');
    if (savedPothole) this.potholeThreshold = parseFloat(savedPothole);
    const savedRadius = localStorage.getItem('anooco_muted_radius');
    if (savedRadius) this.mutedRadiusMeters = parseInt(savedRadius, 10);

    const savedAlertRadius = localStorage.getItem('anooco_alert_radius_km');
    if (savedAlertRadius) this.alertRadiusKm = parseFloat(savedAlertRadius);
    const savedVoiceAlert = localStorage.getItem('anooco_voice_alert_km');
    if (savedVoiceAlert) this.voiceAlertKm = parseFloat(savedVoiceAlert);

    const savedStreets = localStorage.getItem('anooco_muted_streets');
    if (savedStreets) {
      try {
        this.mutedStreets = JSON.parse(savedStreets);
      } catch {
        this.mutedStreets = [];
      }
    }
    const savedContext = localStorage.getItem('anooco_speed_context');
    if (savedContext) this.speedContext = savedContext;
    const savedSource = localStorage.getItem('anooco_speed_source');
    if (savedSource === 'ocr' || savedSource === 'manual' || savedSource === 'default') {
      this.speedLimitSource = savedSource;
    }
    const tMin = localStorage.getItem('anooco_traffic_min_kmh');
    if (tMin) this.trafficSlowMinKmh = parseFloat(tMin);
    const tMax = localStorage.getItem('anooco_traffic_max_kmh');
    if (tMax) this.trafficSlowMaxKmh = parseFloat(tMax);
    const tSamples = localStorage.getItem('anooco_traffic_sustain_samples');
    if (tSamples) this.trafficSustainSamples = parseInt(tSamples, 10);
    const tCooldown = localStorage.getItem('anooco_traffic_cooldown_ms');
    if (tCooldown) this.trafficCooldownMs = parseInt(tCooldown, 10);
    const tReset = localStorage.getItem('anooco_traffic_reset_speed');
    if (tReset) this.trafficResetSpeedKmh = parseFloat(tReset);
    const tStop = localStorage.getItem('anooco_traffic_stopped_threshold');
    if (tStop) this.trafficStoppedThresholdKmh = parseFloat(tStop);
    const confMode = localStorage.getItem('anooco_pothole_confirm_mode');
    if (confMode === 'auto') {
      this.potholeConfirmationMode = false;
    }
    const accPref = localStorage.getItem('anooco_enable_accident_reports');
    if (accPref !== null) this.enableAccidentReports = accPref === '1';
    const potPref = localStorage.getItem('anooco_enable_pothole_reports');
    if (potPref !== null) this.enablePotholeReports = potPref === '1';
    const trafPref = localStorage.getItem('anooco_enable_traffic_reports');
    if (trafPref !== null) this.enableTrafficReports = trafPref === '1';
    const enfPref = localStorage.getItem('anooco_enable_enforcement_reports');
    if (enfPref !== null) this.enableEnforcementReports = enfPref === '1';
    const emergencyPref = localStorage.getItem('anooco_enable_emergency_alerts');
    if (emergencyPref !== null) this.enableEmergencyAlerts = emergencyPref === '1';
    const parkAuto = localStorage.getItem('anooco_parking_auto_mark');
    if (parkAuto !== null) this.enableParkingAutoMark = parkAuto === '1';
    const paused = localStorage.getItem('anooco_reporting_paused');
    if (paused !== null) this.reportingPaused = paused === '1';

    const voice = localStorage.getItem('anooco_enable_voice');
    if (voice !== null) {
      this.enableVoice = voice === '1';
    }
    this.voiceService.setMuted(!this.enableVoice);

    const geo = localStorage.getItem('anooco_enable_geolocation');
    if (geo !== null) {
      this.enableGeolocation = geo === '1';
    }
    this.locationService.setEnabled(this.enableGeolocation);
  }

  updateConfig(speedLimit: number, potholeSensitivity: number) {
    this.speedLimitKmh = speedLimit;
    this.potholeThreshold = potholeSensitivity;
    localStorage.setItem('anooco_speed_limit', speedLimit.toString());
    localStorage.setItem('anooco_pothole_threshold', potholeSensitivity.toString());
    this.speedLimitSource = 'manual';
    localStorage.setItem('anooco_speed_source', this.speedLimitSource);
  }

  updateMute(radiusMeters: number, streets: string[]) {
    this.mutedRadiusMeters = Math.max(0, radiusMeters || 0);
    this.mutedStreets = streets.map(s => s.trim()).filter(s => s.length > 0);
    localStorage.setItem('anooco_muted_radius', this.mutedRadiusMeters.toString());
    localStorage.setItem('anooco_muted_streets', JSON.stringify(this.mutedStreets));
  }

  updateAlertRadius(km: number) {
    this.alertRadiusKm = Math.max(0.1, km);
    localStorage.setItem('anooco_alert_radius_km', this.alertRadiusKm.toString());
  }
  updateVoiceAlertRadius(km: number) {
    this.voiceAlertKm = Math.max(0.1, km);
    localStorage.setItem('anooco_voice_alert_km', this.voiceAlertKm.toString());
  }
  updateTrafficConfig(cfg: {
    minKmh?: number;
    maxKmh?: number;
    sustainSamples?: number;
    cooldownMs?: number;
    resetSpeedKmh?: number;
    stoppedThresholdKmh?: number;
  }) {
    if (cfg.minKmh !== undefined) this.trafficSlowMinKmh = Math.max(0, cfg.minKmh);
    if (cfg.maxKmh !== undefined) this.trafficSlowMaxKmh = Math.max(this.trafficSlowMinKmh, cfg.maxKmh);
    if (cfg.sustainSamples !== undefined) this.trafficSustainSamples = Math.max(1, Math.floor(cfg.sustainSamples));
    if (cfg.cooldownMs !== undefined) this.trafficCooldownMs = Math.max(0, Math.floor(cfg.cooldownMs));
    if (cfg.resetSpeedKmh !== undefined) this.trafficResetSpeedKmh = Math.max(0, cfg.resetSpeedKmh);
    if (cfg.stoppedThresholdKmh !== undefined) this.trafficStoppedThresholdKmh = Math.max(0, cfg.stoppedThresholdKmh);
    localStorage.setItem('anooco_traffic_min_kmh', this.trafficSlowMinKmh.toString());
    localStorage.setItem('anooco_traffic_max_kmh', this.trafficSlowMaxKmh.toString());
    localStorage.setItem('anooco_traffic_sustain_samples', this.trafficSustainSamples.toString());
    localStorage.setItem('anooco_traffic_cooldown_ms', this.trafficCooldownMs.toString());
    localStorage.setItem('anooco_traffic_reset_speed', this.trafficResetSpeedKmh.toString());
    localStorage.setItem('anooco_traffic_stopped_threshold', this.trafficStoppedThresholdKmh.toString());
  }

  updateSpeedContext(context: string) {
    this.speedContext = context || '';
    localStorage.setItem('anooco_speed_context', this.speedContext);
  }

  updatePotholeConfirmationMode(confirm: boolean) {
    this.potholeConfirmationMode = confirm;
    localStorage.setItem('anooco_pothole_confirm_mode', confirm ? 'confirm' : 'auto');
  }

  updateReportPreferences(cfg: {
    accidents?: boolean;
    potholes?: boolean;
    traffic?: boolean;
    enforcement?: boolean;
    emergencyAlerts?: boolean;
  }) {
    if (cfg.accidents !== undefined) {
      this.enableAccidentReports = cfg.accidents;
      localStorage.setItem('anooco_enable_accident_reports', cfg.accidents ? '1' : '0');
    }
    if (cfg.potholes !== undefined) {
      this.enablePotholeReports = cfg.potholes;
      localStorage.setItem('anooco_enable_pothole_reports', cfg.potholes ? '1' : '0');
    }
    if (cfg.traffic !== undefined) {
      this.enableTrafficReports = cfg.traffic;
      localStorage.setItem('anooco_enable_traffic_reports', cfg.traffic ? '1' : '0');
    }
    if (cfg.enforcement !== undefined) {
      this.enableEnforcementReports = cfg.enforcement;
      localStorage.setItem('anooco_enable_enforcement_reports', cfg.enforcement ? '1' : '0');
    }
    if (cfg.emergencyAlerts !== undefined) {
      this.enableEmergencyAlerts = cfg.emergencyAlerts;
      localStorage.setItem('anooco_enable_emergency_alerts', cfg.emergencyAlerts ? '1' : '0');
    }
  }

  updateParkingAutoMark(enabled: boolean) {
    this.enableParkingAutoMark = enabled;
    localStorage.setItem('anooco_parking_auto_mark', enabled ? '1' : '0');
  }

  setReportingPaused(paused: boolean) {
    this.reportingPaused = paused;
    localStorage.setItem('anooco_reporting_paused', paused ? '1' : '0');
  }

  setTemporarySpeedLimit(limitKmh: number, context?: string) {
    this.speedLimitKmh = Math.max(10, Math.min(160, Math.round(limitKmh)));
    if (context !== undefined) {
      this.speedContext = context || '';
    }
    this.speedLimitSource = context === 'from road sign' ? 'ocr' : 'manual';
    localStorage.setItem('anooco_speed_limit', this.speedLimitKmh.toString());
    localStorage.setItem('anooco_speed_context', this.speedContext);
    localStorage.setItem('anooco_speed_source', this.speedLimitSource);
  }

  updateVoicePreference(enabled: boolean) {
    this.enableVoice = enabled;
    localStorage.setItem('anooco_enable_voice', enabled ? '1' : '0');
    this.voiceService.setMuted(!enabled);
  }

  updateGeolocationPreference(enabled: boolean) {
    this.enableGeolocation = enabled;
    localStorage.setItem('anooco_enable_geolocation', enabled ? '1' : '0');
    this.locationService.setEnabled(enabled);
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
      this.lastPotholeSpike = { severity: magnitude, timestamp: Date.now() };
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

    // Emit current speed
    this.ngZone.run(() => {
        this.currentSpeed$.next(Math.round(speedKmh));
    });

    // Auto-Traffic Detection
    // If speed is between 0.5 and 5 km/h (slow moving, not stopped)
    if (speedKmh > this.trafficSlowMinKmh && speedKmh < this.trafficSlowMaxKmh) {
      this.lowSpeedSamples++;
      if (this.lowSpeedSamples > this.trafficSustainSamples) {
        const now = Date.now();
        if (now - this.lastTrafficReport > this.trafficCooldownMs) {
           this.trafficDetected$.next();
           this.lastTrafficReport = now;
           this.lowSpeedSamples = 0;
        }
      }
    } else {
      if (speedKmh > this.trafficResetSpeedKmh || speedKmh < this.trafficStoppedThresholdKmh) {
         this.lowSpeedSamples = 0;
      }
    }

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

  hasRecentSpike(windowMs: number = 30000): boolean {
    if (!this.lastPotholeSpike) return false;
    return Date.now() - this.lastPotholeSpike.timestamp <= windowMs;
  }

  getLastSpike(): { severity: number, timestamp: number } | null {
    return this.lastPotholeSpike;
  }
}
