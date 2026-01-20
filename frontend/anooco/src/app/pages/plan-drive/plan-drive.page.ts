import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-plan-drive',
  templateUrl: './plan-drive.page.html',
  styleUrls: ['./plan-drive.page.scss'],
  standalone: false
})
export class PlanDrivePage implements OnInit {

  searchQuery = '';
  searchResults: any[] = [];
  searchTimeout: any;

  constructor(private navCtrl: NavController) { }

  ngOnInit() {
  }

  onSearch(event: any) {
    const query = event.detail.value;
    if (!query || query.length < 3) {
      this.searchResults = [];
      return;
    }

    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 500);
  }

  async performSearch(query: string) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url);
      const data = await res.json();
      this.searchResults = data;
    } catch (e) {
      console.error('Search failed', e);
      this.searchResults = [];
    }
  }

  selectDestination(place: any) {
    this.navCtrl.navigateForward('/navigation', {
      queryParams: {
        destLat: place.lat,
        destLon: place.lon,
        destName: place.display_name.split(',')[0]
      }
    });
  }

}
