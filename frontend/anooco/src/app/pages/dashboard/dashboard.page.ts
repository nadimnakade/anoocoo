import { Component, OnInit } from '@angular/core';
import { MenuController, ModalController } from '@ionic/angular';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit {
  map: L.Map | undefined;
  events: any[] = [];
  watchId: string | null = null;
  userMarker: L.Marker | undefined;
  spokenEvents: Set<string> = new Set(); // Track announced events to avoid spam

  isReportModalOpen = false;

  constructor(
    private menuCtrl: MenuController,
    private apiService: ApiService,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
  }

  setOpen(isOpen: boolean) {
    this.isReportModalOpen = isOpen;
  }

  async submitReport(type: string) {
    this.setOpen(false);

    if (!this.userMarker) {
      this.speak("Location not found. Cannot submit report.");
      return;
    }

    const pos = this.userMarker.getLatLng();
    const location = {
      coords: {
        latitude: pos.lat,
        longitude: pos.lng,
        heading: 0,
        speed: 0
      }
    };

    const text = `Manual report: ${type}`;

    this.apiService.sendReport(text, location).subscribe({
      next: () => {
        this.speak(`${type} report submitted.`);
        // Refresh events after a short delay to see the new one
        setTimeout(() => this.loadEvents(), 1000);
      },
      error: (err) => {
        console.error(err);
        this.speak("Failed to submit report.");
      }
    });
  }

  async ionViewDidEnter() {
    // Wait for DOM to be ready
    setTimeout(() => {
      this.loadMap();
    }, 100);
    this.loadEvents();
    this.startTracking();
  }

  ionViewWillLeave() {
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
    }
  }

  openMenu() {
    this.menuCtrl.open();
  }

  async loadMap() {
    if (this.map) {
      this.map.remove();
    }

    try {
      // Force Malta for demo purposes if requested, otherwise try geolocation
      // For now, let's default to Malta as requested by user
      const lat = 35.9375;
      const lng = 14.3754;

      this.map = L.map('map', {
        zoomControl: false, // Cleaner UI
        attributionControl: false
      }).setView([lat, lng], 12); // Zoom level 12 for island view

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(this.map);

      // Initialize user marker (hidden initially until location found)
      const userIcon = L.divIcon({
        className: 'user-marker',
        html: '<div style="background-color: #4285F4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);

    } catch (e) {
      console.error("Error loading map", e);
    }
  }

  async startTracking() {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        await Geolocation.requestPermissions();
      }

      this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
        if (position) {
          this.updateUserLocation(position.coords.latitude, position.coords.longitude);
        }
      });
    } catch (e) {
      console.error("Error starting tracking", e);
    }
  }

  updateUserLocation(lat: number, lng: number) {
    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    }

    // Optional: Center map on user periodically or if far away
    // if (this.map) this.map.setView([lat, lng]);

    this.checkNearbyEvents(lat, lng);
  }

  checkNearbyEvents(userLat: number, userLng: number) {
    if (!this.events.length) return;

    this.events.forEach(evt => {
      const distance = this.calculateDistance(userLat, userLng, evt.latitude, evt.longitude);

      // If event is within 500m and hasn't been spoken yet
      if (distance < 500 && !this.spokenEvents.has(evt.id)) {
        this.speakEvent(evt, distance);
        this.spokenEvents.add(evt.id);
      }
    });
  }

  async speakEvent(evt: any, distanceMeters: number) {
    const distanceKm = (distanceMeters / 1000).toFixed(1);
    let text = "";

    // Try to get street name
    let streetPart = "on the street";
    try {
      const street = await this.getStreetName(evt.latitude, evt.longitude);
      if (street) {
        streetPart = `on ${street}`;
      }
    } catch (e) {
      console.log('Could not fetch street name');
    }

    // Customize message based on type
    switch (evt.eventType?.toUpperCase()) {
      case 'POTHOLE':
        text = `Caution. Potholes ahead in ${distanceKm} kilometers.`;
        break;
      case 'ACCIDENT':
        text = `Warning. Accident occurred ${streetPart} ${distanceKm} kilometers ahead.`;
        break;
      case 'POLICE':
        text = `Police check reported ahead in ${distanceKm} kilometers.`;
        break;
      case 'TRAFFIC':
        text = `Heavy traffic ahead in ${distanceKm} kilometers.`;
        break;
      default:
        text = `${evt.eventType} reported ${streetPart} ${distanceKm} kilometers ahead.`;
    }

    this.speak(text);
  }

  async getStreetName(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      return data.address?.road || '';
    } catch (error) {
      return '';
    }
  }

  speak(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  // Haversine formula to calculate distance in meters
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  }

  loadEvents() {
    this.apiService.getEvents().subscribe((data: any) => {
      this.events = data;
      this.plotEvents();
    });
  }

  plotEvents() {
    if (!this.map) return;

    // Clear existing markers if any (optional, but good practice if real-time)
    // this.map.eachLayer((layer) => { ... }) // Need to track markers to remove them properly

    this.events.forEach(evt => {
      const type = evt.eventType?.toUpperCase() || 'UNKNOWN';
      const config = this.getMarkerConfig(type);

      const customIcon = L.divIcon({
        className: 'custom-event-marker-container', // Wrapper class if needed, or empty
        html: `
          <div class="custom-event-marker" style="
            background-color: ${config.color};
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          ">
            ${config.icon}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16], // Center it
        popupAnchor: [0, -16]
      });

      const marker = L.marker([evt.latitude, evt.longitude], { icon: customIcon })
        .bindPopup(`
          <div style="text-align: center;">
            <h3 style="margin: 0; color: ${config.color};">${evt.eventType}</h3>
            <p>Confirmed: ${evt.confirmationsCount}</p>
            <p style="font-size: 0.8em; color: #666;">${new Date(evt.updatedAt).toLocaleString()}</p>
          </div>
        `)
        .addTo(this.map!);

      // Add click listener to speak event details
      marker.on('click', () => {
        // We pass 0 distance to force immediate speech without "in X km" prefix logic if we want,
        // or we calculate actual distance. Let's calculate actual distance.
        if (this.userMarker) {
           const userPos = this.userMarker.getLatLng();
           const dist = this.calculateDistance(userPos.lat, userPos.lng, evt.latitude, evt.longitude);
           this.speakEvent(evt, dist);
        } else {
           // Fallback if user location unknown, just speak generic
           this.speak(`${evt.eventType} selected.`);
        }
      });
    });
  }

  focusOnEvent(evt: any) {
    if (this.map) {
      this.map.flyTo([evt.latitude, evt.longitude], 16);

      // Calculate distance and speak
      if (this.userMarker) {
        const userPos = this.userMarker.getLatLng();
        const dist = this.calculateDistance(userPos.lat, userPos.lng, evt.latitude, evt.longitude);
        this.speakEvent(evt, dist);
      } else {
        this.speak(`${evt.eventType} selected.`);
      }
    }
  }

  async onManualReport() {
    this.setOpen(true);
  }

  getMarkerConfig(type: string) {
    // Return SVG strings directly to avoid Web Component issues in Leaflet
    switch (type) {
      case 'ACCIDENT':
        return {
          color: '#D32F2F',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 32L32 464h448L256 32zm0 80l160 320H96L256 112zm0 88c-13.3 0-24 10.7-24 24v80c0 13.3 10.7 24 24 24s24-10.7 24-24v-80c0-13.3-10.7-24-24-24zm0 160c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24z"/></svg>`
        };
      case 'POTHOLE':
        return {
          color: '#D32F2F',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M469.6 153.9c-15.8-3.4-36.2-7-59.6-10.6l-19.2-85.3c-4.9-21.7-26.6-35.1-48.3-30.2L91.6 83.9C69.9 88.8 56.5 110.5 61.4 132.2l19.2 85.3c-27.1 26.6-43.9 63.8-43.9 104.9 0 81.1 66.2 146.9 148.2 146.9h142.3c81.9 0 148.2-65.8 148.2-146.9 0-59.5-35-110.4-85.8-135.5zM294.5 98.4l19.2 85.3c-48.4-6.4-98.8-6.4-147.2 0l-19.2-85.3 147.2-33.1z"/></svg>`
        };
      case 'POLICE':
        return {
          color: '#1976D2',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 32C174 69.1 96 85.2 32 96c0 128 16 256 224 384 208-128 224-256 224-384-64-10.8-142-26.9-224-64z"/></svg>`
        };
      case 'TRAFFIC':
        return {
          color: '#FBC02D',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M112 48h288L448 464H64L112 48zm64 48H128l-16 128h64V96zm128 0h-48v128h64l-16-128zM128 352l-16 64h288l-16-64H128z"/></svg>`
        };
      case 'PARK':
        return {
          color: '#388E3C',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M416 160c0-70.7-57.3-128-128-128H208C120 32 32 104 32 208c0 78.4 49.3 146.1 118.8 168.4L128 480h48l24-96h88c70.7 0 128-57.3 128-128zM208 288h-48v-96h48c26.5 0 48 21.5 48 48s-21.5 48-48 48z"/></svg>`
        };
      case 'LIFT':
        return {
          color: '#212121',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M128 416H64V128h64v288zm32-288v288h224c17.7 0 32-14.3 32-32 0-3.6-.6-7.1-1.7-10.4l-32-96c-5-15.1-19.2-25.6-35.1-25.6H208c-17.7 0-32 14.3-32 32zm0-64h128c17.7 0 32 14.3 32 32v32h-32V96H160v32zm256 96h32c17.7 0 32 14.3 32 32v160c0 17.7-14.3 32-32 32h-32V160z"/></svg>`
        };
      default:
        return {
          color: '#757575',
          icon: `<svg viewBox="0 0 512 512" style="width: 20px; height: 20px; fill: white;"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm0-336c-26.5 0-48 21.5-48 48h32c0-8.8 7.2-16 16-16s16 7.2 16 16-7.2 16-16 16-16 7.2-16 16v32h32v-20c22-2.2 48-24.3 48-60 0-26.5-21.5-48-48-48zm-16 208h32v32h-32v-32z"/></svg>`
        };
    }
  }
}
