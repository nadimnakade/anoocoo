import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  signup(user: any) {
    return this.http.post(`${this.apiUrl}/auth/signup`, user);
  }

  login(credentials: any) {
    return this.http.post(`${this.apiUrl}/auth/login`, credentials);
  }

  getEvents() {
    return this.http.get(`${this.apiUrl}/events`);
  }

  getUserProfile(userId: string) {
    return this.http.get(`${this.apiUrl}/user/profile?userId=${userId}`);
  }

  getUserActivity(userId: string) {
    return this.http.get(`${this.apiUrl}/user/activity?userId=${userId}`);
  }

  updateProfile(userId: string, data: any) {
    return this.http.post(`${this.apiUrl}/user/update`, { userId, ...data });
  }

  sendReport(text: string, location: any) {
    const payload = {
      rawText: text,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: new Date().toISOString()
    };
    return this.http.post(`${this.apiUrl}/reports`, payload);
  }

  sendReportWithQueue(text: string, location: any): Observable<any> {
    const obs = this.sendReport(text, location).pipe(
      catchError(err => {
        try {
          const payload = {
            rawText: text,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: new Date().toISOString()
          };
          const key = 'anooco_offline_reports';
          const existing = localStorage.getItem(key);
          const arr = existing ? JSON.parse(existing) : [];
          arr.push(payload);
          localStorage.setItem(key, JSON.stringify(arr));
        } catch (_) {}
        return of({ queued: true });
      })
    );
    return obs;
  }

  syncOfflineReports(): Observable<{ sent: number, remaining: number }> {
    const key = 'anooco_offline_reports';
    const existing = localStorage.getItem(key);
    const arr: any[] = existing ? JSON.parse(existing) : [];
    if (!arr.length) return of({ sent: 0, remaining: 0 });

    let sent = 0;
    const promises = arr.map(async (payload) => {
      try {
        await this.http.post(`${this.apiUrl}/reports`, payload).toPromise();
        sent++;
      } catch (_) {}
    });
    return new Observable(sub => {
      Promise.all(promises).then(() => {
        const remaining = arr.length - sent;
        if (remaining > 0) {
          const leftover = arr.slice(sent);
          localStorage.setItem(key, JSON.stringify(leftover));
        } else {
          localStorage.removeItem(key);
        }
        sub.next({ sent, remaining });
        sub.complete();
      });
    });
  }

  confirmEvent(eventId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/events/${eventId}/confirm`, {}).pipe(
      catchError(() => of({ ok: false }))
    );
  }

  seedData() {
    return this.http.post(`${this.apiUrl}/seed`, {});
  }
}
