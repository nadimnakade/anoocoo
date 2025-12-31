import { Injectable } from '@angular/core';
import { WifiWizard2 } from '@awesome-cordova-plugins/wifi-wizard-2/ngx';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashcamService {

  // Typical dashcam IP (often 192.168.1.254 or similar)
  private readonly DASHCAM_IP = 'http://192.168.1.254';

  public isConnected$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient, private wifiWizard2: WifiWizard2) { }

  /**
   * Connects to the Dashcam's WiFi Hotspot
   */
  async connectToDashcam(ssid: string, password?: string): Promise<boolean> {
    try {
      console.log(`Attempting to connect to Dashcam WiFi: ${ssid}`);
      // connect(ssid, bindAll, password, algorithm, isHiddenSsid)
      await this.wifiWizard2.connect(ssid, true, password);

      // Verify connection by checking SSID
      const current = await this.wifiWizard2.getConnectedSSID();
      if (current === ssid || current === `"${ssid}"`) {
        this.isConnected$.next(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to dashcam WiFi', error);
      return false;
    }
  }

  /**
   * Disconnects from the Dashcam WiFi
   */
  async disconnect() {
    try {
      const current = await this.wifiWizard2.getConnectedSSID();
      if (current) {
        await this.wifiWizard2.disconnect(current);
      }
      this.isConnected$.next(false);
    } catch (error) {
      console.error('Failed to disconnect', error);
    }
  }

  /**
   * Fetches the list of video files from the Dashcam
   * (This is a generic implementation, actual API depends on Dashcam model)
   */
  async listRecordings() {
    // In a real scenario, we would hit the Dashcam's API
    // return this.http.get(`${this.DASHCAM_IP}/cgi-bin/list_files`);

    // MOCK DATA for demonstration
    return [
      { name: '20250520_120000_F.MP4', size: '120MB', date: '2025-05-20 12:00' },
      { name: '20250520_120500_F.MP4', size: '125MB', date: '2025-05-20 12:05' },
      { name: '20250520_121000_F.MP4', size: '110MB', date: '2025-05-20 12:10' },
    ];
  }

  async getDashcamIP(): Promise<string> {
    try {
        const ip = await this.wifiWizard2.getWifiIP();
        return ip || '';
    } catch (e) {
        return '';
    }
  }
}
