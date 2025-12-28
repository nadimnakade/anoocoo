import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

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

  seedData() {
    return this.http.post(`${this.apiUrl}/seed`, {});
  }
}
