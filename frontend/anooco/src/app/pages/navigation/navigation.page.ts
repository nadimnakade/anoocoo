import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';
import { LocationService } from 'src/app/services/location.service';
import { RoadFeatureService } from 'src/app/services/road-feature.service';
import { LoadingController, ToastController } from '@ionic/angular';
import * as L from 'leaflet';
import 'leaflet-routing-machine';

// Fix for Leaflet icons
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.page.html',
  styleUrls: ['./navigation.page.scss'],
  standalone: false
})
export class NavigationPage implements OnInit, OnDestroy {
  map: L.Map | undefined;
  startLocation = '';
  endLocation = '';
  alertRadius = 2.0;
  isLoading = false;

  routeStats: { duration: string, distance: string } | null = null;
  routeEvents: any[] = [];

  startSuggestions: any[] = [];
  endSuggestions: any[] = [];
  private searchTimeout: any;

  private routingControl: any;
  private eventMarkers: (L.Marker | L.CircleMarker)[] = [];
  private currentLat = 0;
  private currentLng = 0;
  private spokenEvents = new Set<string>();
  private trackingInterval: any;

  private currentRoutePath: number[][] | null = null;
  private lastEventsRefresh = 0;

  constructor(
    private api: ApiService,
    private locationService: LocationService,
    private roadFeatureService: RoadFeatureService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.alertRadius = this.roadFeatureService.alertRadiusKm;
  }

  ionViewDidEnter() {
    this.initMap();
    this.startTracking();
  }

  ionViewWillLeave() {
    this.stopTracking();
  }

  ngOnDestroy() {
    this.stopTracking();
    if (this.map) {
      this.map.remove();
    }
  }

  startTracking() {
    // Initial fetch
    this.getCurrentLocation();

    // Poll for updates (real-time simulation)
    this.trackingInterval = setInterval(async () => {
      try {
        const pos = await this.locationService.getCurrentLocation();
        if (pos && pos.coords) {
          this.currentLat = pos.coords.latitude;
          this.currentLng = pos.coords.longitude;

          // Update marker
          if (this.map) {
             // Ideally update a specific user marker, but for now we rely on getCurrentLocation updating the view/marker if called manually.
             // Let's ensure we have a marker for the user that moves.
             this.updateUserMarker();
          }

          // Check proximity
          this.checkProximityToEvents();

          // Check route deviation
          this.checkRouteDeviation();

          // Periodic refresh of events (every 60s)
          const now = Date.now();
          if (this.currentRoutePath && (now - this.lastEventsRefresh > 60000)) {
            this.fetchEventsAlongRoute(this.currentRoutePath, true); // silent refresh
            this.lastEventsRefresh = now;
          }
        }
      } catch (e) {
        console.warn('Tracking error', e);
      }
    }, 5000); // Check every 5s
  }

  private userMarker: L.Marker | null = null;
  updateUserMarker() {
    if (!this.map) return;
    if (this.userMarker) {
      this.userMarker.setLatLng([this.currentLat, this.currentLng]);
    } else {
      this.userMarker = L.marker([this.currentLat, this.currentLng])
        .bindPopup('You are here')
        .addTo(this.map);
    }
  }

  stopTracking() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  checkProximityToEvents() {
    if (this.routeEvents.length === 0) return;

    this.routeEvents.forEach(evt => {
      const distKm = this.calculateDistance(this.currentLat, this.currentLng, evt.latitude, evt.longitude);

      // Update UI distance
      evt.distanceFromUser = distKm.toFixed(1);

      // Trigger Voice Alert if < 1km and not spoken
      if (distKm < 1.0 && !this.spokenEvents.has(evt.id)) {
        this.speakEvent(evt, distKm);
        this.spokenEvents.add(evt.id);
      }
    });
  }

  speakEvent(evt: any, distKm: number) {
    const text = `Caution. ${evt.eventType} reported ${distKm.toFixed(1)} kilometers ahead.`;

    // Use Web Speech API or Capacitor TTS
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }

    this.showToast(`Voice Alert: ${text}`);
  }

  async initMap() {
    if (this.map) return;

    this.map = L.map('nav-map').setView([35.9375, 14.3754], 11); // Default Malta

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  async getCurrentLocation() {
    try {
      const pos = await this.locationService.getCurrentLocation();
      if (pos && pos.coords) {
        this.currentLat = pos.coords.latitude;
        this.currentLng = pos.coords.longitude;

        if (this.map) {
          this.map.setView([this.currentLat, this.currentLng], 13);
          L.marker([this.currentLat, this.currentLng])
            .bindPopup('You are here')
            .addTo(this.map);
        }
      }
    } catch (e) {
      console.error('Loc error', e);
    }
  }

  useCurrentLocation() {
    this.startLocation = 'Current Location';
    // Logic to use actual coords handled in findRoute
  }

  updateRadius() {
    this.roadFeatureService.updateAlertRadius(this.alertRadius);

    // Real-time update: Refresh events if route is active
    if (this.currentRoutePath) {
      this.fetchEventsAlongRoute(this.currentRoutePath);
    }
  }

  onSearchInput(event: any, type: 'start' | 'end') {
    const query = event.detail.value;

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (!query || query.length < 3) {
      if (type === 'start') this.startSuggestions = [];
      else this.endSuggestions = [];
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      const results = await this.searchAddress(query);
      if (type === 'start') this.startSuggestions = results;
      else this.endSuggestions = results;
    }, 500); // 500ms debounce
  }

  selectAddress(item: any, type: 'start' | 'end') {
    if (type === 'start') {
      this.startLocation = item.display_name;
      this.startSuggestions = [];
    } else {
      this.endLocation = item.display_name;
      this.endSuggestions = [];
    }
  }

  async searchAddress(query: string) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=mt&limit=5`;
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async findRoute() {
    if (!this.map || !this.endLocation) return;

    this.isLoading = true;
    this.routeEvents = [];
    this.routeStats = null;

    // Clear old route
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }

    // Clear old markers
    this.eventMarkers.forEach(m => m.remove());
    this.eventMarkers = [];

    // Geocode Start (if not current)
    let startCoords = L.latLng(this.currentLat, this.currentLng);

    // Note: For a real app, you'd use a Geocoding service here to convert text address to lat/lng.
    // For this demo, we'll assume start is current location if text is "Current Location"
    // And end location needs geocoding.
    // Since we don't have a geocoding API set up in frontend yet (only backend),
    // we will simulate geocoding for a few Malta locations for demo purposes or use a simple nominatim call.

    let endCoords: L.LatLng | null = null;

    try {
      if (this.startLocation !== 'Current Location' && this.startLocation.trim() !== '') {
        const res = await this.geocode(this.startLocation);
        if (res) startCoords = res;
      }

      const endRes = await this.geocode(this.endLocation);
      if (endRes) {
        endCoords = endRes;
      } else {
        this.showToast('Destination not found.');
        this.isLoading = false;
        return;
      }

      // Calculate Route using OSRM (via Leaflet Routing Machine)
      // Note: L.Routing.control usually adds itself to map. We need to hook into it to get the path.

      this.routingControl = (L as any).Routing.control({
        waypoints: [
          startCoords,
          endCoords
        ],
        routeWhileDragging: false,
        show: false, // Hide the default instructions panel for cleaner UI
        addWaypoints: false
      }).on('routesfound', (e: any) => {
        const routes = e.routes;
        const route = routes[0];

        this.routeStats = {
          distance: (route.summary.totalDistance / 1000).toFixed(1) + ' km',
          duration: Math.round(route.summary.totalTime / 60) + ' min'
        };

        // Extract coordinates for backend search
        // OSRM returns array of {lat, lng}
        const path = route.coordinates.map((c: any) => [c.lat, c.lng]);

        this.currentRoutePath = path; // Store for deviation checks and refresh
        this.lastEventsRefresh = Date.now();

        this.fetchEventsAlongRoute(path);

      }).addTo(this.map);

    } catch (e) {
      console.error(e);
      this.showToast('Error calculating route.');
      this.isLoading = false;
    }
  }

  async fetchEventsAlongRoute(path: number[][], silent = false) {
    this.api.getEventsAlongRoute(path, this.alertRadius).subscribe({
      next: (events: any) => {
        this.routeEvents = events.map((e: any) => ({
          ...e,
          distanceFromUser: this.calculateDistance(this.currentLat, this.currentLng, e.latitude, e.longitude).toFixed(1)
        }));
        this.plotEvents(this.routeEvents);
        this.isLoading = false;

        if (!silent) {
          if (this.routeEvents.length > 0) {
            this.showToast(`Found ${this.routeEvents.length} alerts along your route.`);
          } else {
            this.showToast('No alerts found on this route. Safe travels!');
          }
        }
      },
      error: (err: any) => {
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  checkRouteDeviation() {
    if (!this.currentRoutePath || !this.routingControl) return;

    // Skip check if we just started or path is empty
    if (this.currentRoutePath.length < 2) return;

    const deviationThresholdKm = 0.2; // 200 meters deviation triggers reroute
    let minDist = Infinity;

    // Check distance to all segments of the route
    // (Optimization: In a real app, track the current segment index and only check neighbors)
    for (let i = 0; i < this.currentRoutePath.length - 1; i++) {
      const p1 = this.currentRoutePath[i];
      const p2 = this.currentRoutePath[i + 1];
      const d = this.distanceToSegment(
        this.currentLat, this.currentLng,
        p1[0], p1[1],
        p2[0], p2[1]
      );
      if (d < minDist) minDist = d;
    }

    // If we are significantly off-route
    if (minDist > deviationThresholdKm) {
      console.log('User deviated from route. Recalculating...', minDist);
      this.showToast('Recalculating route...');

      // Update start point to current location, keep destination
      const waypoints = this.routingControl.getWaypoints();
      // Ensure we have a destination
      if (waypoints && waypoints.length > 1) {
        const destination = waypoints[waypoints.length - 1];

        // This triggers 'routesfound' which updates currentRoutePath and fetches events
        this.routingControl.setWaypoints([
          L.latLng(this.currentLat, this.currentLng),
          destination.latLng
        ]);

        // Clear path temporarily to prevent multiple triggers
        this.currentRoutePath = null;
      }
    }
  }

  distanceToSegment(lat: number, lon: number, lat1: number, lon1: number, lat2: number, lon2: number) {
    // Project point P onto segment AB
    const x = lat, y = lon;
    const x1 = lat1, y1 = lon1;
    const x2 = lat2, y2 = lon2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;

    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    }
    else if (param > 1) {
      xx = x2;
      yy = y2;
    }
    else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return this.calculateDistance(lat, lon, xx, yy);
  }

  plotEvents(events: any[]) {
    if (!this.map) return;

    events.forEach(evt => {
      const color = this.getColor(evt.eventType);
      const marker = L.circleMarker([evt.latitude, evt.longitude], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).bindPopup(`
        <b>${evt.eventType}</b><br>
        ${evt.address || ''}
      `).addTo(this.map!);

      this.eventMarkers.push(marker);
    });
  }

  // Simple client-side geocoding shim (Nominatim)
  async geocode(query: string): Promise<L.LatLng | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Malta')}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.length > 0) {
      return L.latLng(parseFloat(data[0].lat), parseFloat(data[0].lon));
    }
    return null;
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
      case 'POTHOLE': return '#ffc409'; // Warning
      case 'ACCIDENT': return '#eb445a'; // Danger
      case 'POLICE': return '#3880ff'; // Primary
      case 'TRAFFIC': return '#ffc409';
      default: return '#medium';
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  focusEvent(evt: any) {
    if (this.map) {
      this.map.setView([evt.latitude, evt.longitude], 15);
    }
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}
