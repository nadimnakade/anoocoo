import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-alerts',
  templateUrl: './alerts.page.html',
  styleUrls: ['./alerts.page.scss'],
  standalone: false
})
export class AlertsPage implements OnInit {
  alerts: any[] = [];
  isLoading = false;
  readonly recentHours = 24;

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadAlerts();
  }

  loadAlerts(event?: any) {
    this.isLoading = true;
    const now = Date.now();
    const cutoffMs = this.recentHours * 60 * 60 * 1000;

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

        this.alerts = normalized
          .filter(evt => {
            if (!evt.updatedAt) return false;
            const t = new Date(evt.updatedAt).getTime();
            if (!t) return false;
            return now - t <= cutoffMs;
          })
          .sort((a, b) => {
            const ta = new Date(a.updatedAt).getTime();
            const tb = new Date(b.updatedAt).getTime();
            return tb - ta;
          });

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

  getIcon(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return 'warning';
      case 'ACCIDENT': return 'medkit';
      case 'POLICE': return 'shield';
      case 'TRAFFIC': return 'car';
      default: return 'alert-circle';
    }
  }

  getColor(type: string) {
    switch (type?.toUpperCase()) {
      case 'POTHOLE': return '#ffc409';
      case 'ACCIDENT': return '#eb445a';
      case 'POLICE': return '#3880ff';
      case 'TRAFFIC': return '#ffc409';
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

