import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/services/api.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-alerts',
  templateUrl: './alerts.page.html',
  styleUrls: ['./alerts.page.scss'],
  standalone: false
})
export class AlertsPage implements OnInit {
  alerts: any[] = [];
  private rawAlerts: any[] = [];
  isLoading = false;
  timeWindowHours = 24;
  eventFilter: 'all' | 'pothole' | 'police' | 'traffic' = 'all';

  constructor(
    private api: ApiService,
    private router: Router,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.loadAlerts();
  }

  goBack() {
    this.navCtrl.back();
  }

  loadAlerts(event?: any) {
    this.isLoading = true;

    this.api.getEvents().subscribe({
      next: (data: any) => {
        const raw = Array.isArray(data) ? data : [];
        const normalized = raw.map(evt => ({
          ...evt,
          id: evt.id || evt.Id,
          eventType: evt.eventType || evt.EventType,
          address: evt.address || evt.Address,
          updatedAt: evt.updatedAt || evt.UpdatedAt
        }));

        this.rawAlerts = normalized;
        this.applyFilters();

        this.isLoading = false;
        if (event && event.target && typeof event.target.complete === 'function') {
          event.target.complete();
        }
      },
      error: () => {
        this.isLoading = false;
        if (event && event.target && typeof event.target.complete === 'function') {
          event.target.complete();
        }
      }
    });
  }

  setTimeWindow(hours: number) {
    this.timeWindowHours = hours;
    this.applyFilters();
  }

  setEventFilter(filter: 'all' | 'pothole' | 'police' | 'traffic') {
    this.eventFilter = filter;
    this.applyFilters();
  }

  private applyFilters() {
    const now = Date.now();
    const cutoffMs = this.timeWindowHours * 60 * 60 * 1000;

    this.alerts = this.rawAlerts
      .filter(evt => {
        if (!evt.updatedAt) return false;
        const t = new Date(evt.updatedAt).getTime();
        if (!t) return false;
        if (now - t > cutoffMs) return false;

        const type = (evt.eventType || '').toString().toUpperCase();
        if (this.eventFilter === 'pothole') {
          return type === 'POTHOLE';
        }
        if (this.eventFilter === 'police') {
          return type === 'POLICE';
        }
        if (this.eventFilter === 'traffic') {
          return type === 'TRAFFIC';
        }
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.updatedAt).getTime();
        const tb = new Date(b.updatedAt).getTime();
        return tb - ta;
      });
  }

  getIcon(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return 'warning';
      case 'ACCIDENT': return 'medkit';
      case 'POLICE': return 'shield';
      case 'TRAFFIC': return 'car';
      case 'EMERGENCY_VEHICLE': return 'flash';
      default: return 'alert-circle';
    }
  }

  getColor(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return '#ffc409';
      case 'ACCIDENT': return '#eb445a';
      case 'POLICE': return '#3880ff';
      case 'TRAFFIC': return '#ffc409';
      case 'EMERGENCY_VEHICLE': return '#9c27b0';
      default: return '#medium';
    }
  }

  openOnMap(evt: any) {
    if (!evt || !evt.id) {
      return;
    }

    this.router.navigate(['/dashboard'], {
      queryParams: {
        focusEventId: evt.id
      }
    });
  }
}
