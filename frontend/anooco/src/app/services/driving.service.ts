import { Injectable } from '@angular/core';
import { BluetoothSerial } from '@awesome-cordova-plugins/bluetooth-serial/ngx';
import { BehaviorSubject } from 'rxjs';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class DrivingService {
  public isDrivingMode$ = new BehaviorSubject<boolean>(false);
  private targetDeviceName: string | null = null;
  private checkInterval: any;

  constructor(
    private bluetoothSerial: BluetoothSerial,
    private platform: Platform
  ) { 
    this.loadSavedDevice();
  }

  // Load saved car name from storage (mock for now, or use localStorage)
  private loadSavedDevice() {
    const saved = localStorage.getItem('anooco_car_device');
    if (saved) {
      this.targetDeviceName = saved;
      this.startMonitoring();
    }
  }

  saveCarDevice(name: string, address: string) {
    this.targetDeviceName = name;
    localStorage.setItem('anooco_car_device', name);
    localStorage.setItem('anooco_car_address', address);
    this.startMonitoring();
  }

  async getPairedDevices(): Promise<any[]> {
    if (!this.platform.is('cordova') && !this.platform.is('capacitor')) {
      // Mock for browser
      return [
        { name: 'My Car', address: '00:11:22:33:44:55' },
        { name: 'Headphones', address: 'AA:BB:CC:DD:EE:FF' }
      ];
    }
    
    try {
      return await this.bluetoothSerial.list();
    } catch (e) {
      console.error('Error listing devices', e);
      return [];
    }
  }

  startMonitoring() {
    if (this.checkInterval) clearInterval(this.checkInterval);

    // Check every 10 seconds
    this.checkInterval = setInterval(async () => {
      if (!this.targetDeviceName) return;

      const connected = await this.checkIfConnected(this.targetDeviceName);
      if (connected && !this.isDrivingMode$.value) {
        console.log('Car detected! Enabling Driving Mode.');
        this.isDrivingMode$.next(true);
      } else if (!connected && this.isDrivingMode$.value) {
        // Optional: Auto-disable? Maybe not, user might want to keep it.
        // For now, let's not auto-disable to avoid annoyance.
      }
    }, 10000);
  }

  // Strategy: Check Audio Output (A2DP)
  private async checkIfConnected(targetName: string): Promise<boolean> {
    try {
      // 1. Web API Check (Audio Output)
      // Note: Android WebView requires user activation for enumerateDevices sometimes, 
      // but usually works if permission granted.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      
      const match = audioOutputs.find(d => 
        d.label.toLowerCase().includes(targetName.toLowerCase())
      );

      if (match) return true;

      // 2. Fallback: SPP Connect Check (Aggressive)
      // We generally don't want to force connect via SPP as it might interrupt music,
      // but bluetoothSerial.isConnected() checks existing SPP socket.
      // We skip this for now to avoid side effects.
      
      return false;

    } catch (e) {
      console.warn('Error checking connections', e);
      return false;
    }
  }

  stopMonitoring() {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }
}
