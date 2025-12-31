import { Injectable } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class VoiceService {
  isListening = false;

  constructor(private platform: Platform) { }

  async startListening(): Promise<string> {
    this.isListening = true;

    // 1. Web Fallback (for development in browser)
    if (!this.platform.is('hybrid')) {
      return this.listenWeb();
    }

    // 2. Native Mobile Implementation
    try {
      const hasPermission = await SpeechRecognition.checkPermissions();
      if (hasPermission.speechRecognition !== 'granted') {
        await SpeechRecognition.requestPermissions();
      }

      const matches = await SpeechRecognition.start({
        language: "en-US",
        maxResults: 1,
        prompt: "Say 'Report accident' or 'Report traffic'",
        partialResults: false,
        popup: true,
      });

      this.isListening = false;
      if (matches && matches.matches && matches.matches.length > 0) {
        return matches.matches[0];
      }
      return "";

    } catch (e) {
      this.isListening = false;
      console.error("Voice Error:", e);
      throw e;
    }
  }

  // Web Speech API Implementation
  private listenWeb(): Promise<string> {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        this.isListening = false;
        reject("Browser does not support Speech Recognition");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        this.isListening = false;
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };

      recognition.onerror = (event: any) => {
        this.isListening = false;
        reject(event.error);
      };

      recognition.start();
    });
  }

  speak(text: string) {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}
