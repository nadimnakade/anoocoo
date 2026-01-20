import { Component, OnInit } from '@angular/core';
import { MusicControllerService, MusicApp, MusicTrack } from '../../services/music-controller.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-multimedia',
  templateUrl: './multimedia.page.html',
  styleUrls: ['./multimedia.page.scss'],
  standalone: false
})
export class MultimediaPage implements OnInit {

  connectedApp: MusicApp = null;
  currentTrack: MusicTrack | null = null;

  constructor(
    private musicService: MusicControllerService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.musicService.connectedApp$.subscribe(app => {
      this.connectedApp = app;
    });

    this.musicService.currentTrack$.subscribe(track => {
      this.currentTrack = track;
    });
  }

  async toggleConnection(app: string) {
    const appName = app as MusicApp;
    
    // For this prototype, we treat "Connect" as "Open App"
    if (app === 'youtube') {
      window.open('https://music.youtube.com', '_system');
      this.musicService.connectApp('youtube');
      this.showToast('Opening YouTube Music...');
      return;
    }

    if (app === 'spotify') {
       window.open('https://open.spotify.com', '_system');
       this.musicService.connectApp('spotify');
       this.showToast('Opening Spotify...');
       return;
    }

    if (this.connectedApp === appName) {
      this.musicService.disconnect();
      this.showToast(`Disconnected from ${this.formatName(appName)}`);
    } else {
      this.musicService.connectApp(appName);
      this.showToast(`Connected to ${this.formatName(appName)}`);
    }
  }

  togglePlayback() {
    this.musicService.togglePlayback();
  }

  nextTrack() {
    this.musicService.nextTrack();
  }

  prevTrack() {
    this.musicService.prevTrack();
  }

  formatName(app: string | null): string {
    if (!app) return '';
    return app.charAt(0).toUpperCase() + app.slice(1);
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
