import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface MusicTrack {
  title: string;
  artist: string;
  albumArt?: string;
  isPlaying: boolean;
}

export type MusicApp = 'spotify' | 'youtube' | 'audible' | null;

@Injectable({
  providedIn: 'root'
})
export class MusicControllerService {

  private connectedAppSubject = new BehaviorSubject<MusicApp>(null);
  public connectedApp$ = this.connectedAppSubject.asObservable();

  private currentTrackSubject = new BehaviorSubject<MusicTrack | null>(null);
  public currentTrack$ = this.currentTrackSubject.asObservable();

  // Mock playlists
  private mockTracks: Record<string, MusicTrack[]> = {
    'spotify': [
      { title: 'Blinding Lights', artist: 'The Weeknd', isPlaying: true },
      { title: 'As It Was', artist: 'Harry Styles', isPlaying: true },
      { title: 'Levitating', artist: 'Dua Lipa', isPlaying: true }
    ],
    'youtube': [
      { title: 'Lo-Fi Beats to Drive To', artist: 'Lofi Girl', isPlaying: true },
      { title: 'Top Hits 2025', artist: 'Music Channel', isPlaying: true }
    ],
    'audible': [
      { title: 'Atomic Habits', artist: 'James Clear', isPlaying: true },
      { title: 'Project Hail Mary', artist: 'Andy Weir', isPlaying: true }
    ]
  };

  constructor() { }

  connectApp(appName: MusicApp) {
    if (this.connectedAppSubject.value === appName) {
      // Already connected, maybe disconnect?
      this.disconnect();
    } else {
      this.connectedAppSubject.next(appName);
      // Auto-start playing a random track
      if (appName && this.mockTracks[appName]) {
        const tracks = this.mockTracks[appName];
        const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
        this.currentTrackSubject.next({ ...randomTrack });
      }
    }
  }

  disconnect() {
    this.connectedAppSubject.next(null);
    this.currentTrackSubject.next(null);
  }

  togglePlayback() {
    const current = this.currentTrackSubject.value;
    if (current) {
      this.currentTrackSubject.next({ ...current, isPlaying: !current.isPlaying });
    }
  }

  nextTrack() {
    const app = this.connectedAppSubject.value;
    if (app && this.mockTracks[app]) {
       const tracks = this.mockTracks[app];
       const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
       this.currentTrackSubject.next({ ...randomTrack, isPlaying: true });
    }
  }

  prevTrack() {
    this.nextTrack(); // Mock behavior just picks random for now
  }
}
