import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface VehicleServiceLocation {
  id: number;
  lat: number;
  lon: number;
  name: string;
  type: 'gas' | 'parking' | 'ev';
  details?: string;
  distance?: number; // Calculated client-side
}

@Injectable({
  providedIn: 'root',
})
export class VehicleDataService {

  // Overpass API endpoint (public OSM data)
  private readonly OVERPASS_API = 'https://overpass-api.de/api/interpreter';

  constructor(private http: HttpClient) { }

  /**
   * Fetches nearby services using OpenStreetMap Overpass API.
   * @param lat Latitude
   * @param lon Longitude
   * @param radius Radius in meters (default 5000m = 5km)
   * @param type 'gas' | 'parking' | 'ev'
   */
  getNearbyServices(lat: number, lon: number, radius: number = 5000, type: 'gas' | 'parking' | 'ev'): Observable<VehicleServiceLocation[]> {
    const query = this.buildOverpassQuery(lat, lon, radius, type);
    
    // We use a POST request to handle larger queries if needed
    return this.http.post(this.OVERPASS_API, `data=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).pipe(
      map((response: any) => this.parseOverpassResponse(response, type)),
      catchError(err => {
        console.error('Overpass API Error:', err);
        return of([]);
      })
    );
  }

  private buildOverpassQuery(lat: number, lon: number, radius: number, type: string): string {
    let filter = '';
    
    switch (type) {
      case 'gas':
        filter = `
          node["amenity"="fuel"](around:${radius},${lat},${lon});
          way["amenity"="fuel"](around:${radius},${lat},${lon});
        `;
        break;
      case 'parking':
        filter = `
          node["amenity"="parking"](around:${radius},${lat},${lon});
          way["amenity"="parking"](around:${radius},${lat},${lon});
        `;
        break;
      case 'ev':
        filter = `
          node["amenity"="charging_station"](around:${radius},${lat},${lon});
          way["amenity"="charging_station"](around:${radius},${lat},${lon});
        `;
        break;
    }

    return `[out:json][timeout:25];
      (
        ${filter}
      );
      out center;
      >;
      out skel qt;`;
  }

  private parseOverpassResponse(data: any, type: 'gas' | 'parking' | 'ev'): VehicleServiceLocation[] {
    if (!data || !data.elements) return [];

    return data.elements
      .filter((el: any) => (el.type === 'node' || el.type === 'way') && el.tags)
      .map((el: any) => {
        const lat = el.lat || (el.center ? el.center.lat : 0);
        const lon = el.lon || (el.center ? el.center.lon : 0);
        
        return {
          id: el.id,
          lat: lat,
          lon: lon,
          name: el.tags.name || el.tags.operator || `Unknown ${type === 'gas' ? 'Station' : type === 'parking' ? 'Parking' : 'Charger'}`,
          type: type,
          details: this.getDetails(el.tags, type)
        };
      })
      .filter((el: any) => el.lat !== 0 && el.lon !== 0); // Filter out invalid locations
  }

  private getDetails(tags: any, type: string): string {
    if (type === 'gas') {
      // Check for fuel types? OSM data varies.
      return tags.brand ? tags.brand : '';
    }
    if (type === 'parking') {
      const access = tags.access ? `Access: ${tags.access}` : '';
      const fee = tags.fee === 'yes' ? 'Paid' : (tags.fee === 'no' ? 'Free' : '');
      return [access, fee].filter(s => s).join(' • ');
    }
    if (type === 'ev') {
      const capacity = tags.capacity ? `${tags.capacity} spots` : '';
      const output = tags.socket_type2_output ? `${tags.socket_type2_output}` : '';
      return [capacity, output].filter(s => s).join(' • ');
    }
    return '';
  }
}
