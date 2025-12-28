import { Component } from '@angular/core';
import { VoiceService } from '../services/voice.service';
import { LocationService } from '../services/location.service';
import { ApiService } from '../services/api.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage {
  lastReport: string = "Ready";
  isListening: boolean = false;

  constructor(
    private voiceService: VoiceService,
    private locationService: LocationService,
    private apiService: ApiService,
    private alertController: AlertController
  ) {}

  async onTap() {
    try {
      this.isListening = true;
      this.lastReport = "Listening...";

      // 1. Get Location
      const position = await this.locationService.getCurrentLocation();

      // 2. Capture Voice
      const text = await this.voiceService.startListening();
      this.isListening = false;

      if (!text) {
        this.lastReport = "Didn't catch that.";
        return;
      }

      this.lastReport = `Heard: "${text}"`;

      // 3. Send to API
      this.apiService.sendReport(text, position).subscribe({
        next: (res: any) => {
          this.lastReport = `Report Sent! ID: ${res.reportId}`;
          this.voiceService.speak("Report received.");
        },
        error: (err) => {
          console.error(err);
          this.lastReport = "Error sending report.";
        }
      });

    } catch (e) {
      this.isListening = false;
      this.lastReport = "Error: " + JSON.stringify(e);
    }
  }
}
