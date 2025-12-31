import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Ocr, TextDetections } from '@capacitor-community/image-to-text';

@Injectable({
  providedIn: 'root'
})
export class OcrService {

  constructor() { }

  /**
   * Captures an image from the camera and performs OCR to read street signs
   */
  async captureAndReadSign(): Promise<string[]> {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        promptLabelHeader: 'Scan Street Sign',
        presentationStyle: 'fullscreen'
      });

      if (!photo.path) {
        throw new Error('No photo path returned');
      }

      const data: TextDetections = await Ocr.detectText({ 
        filename: photo.path,
      });

      const lines: string[] = [];
      for (let detection of data.textDetections) {
        if (detection.text && detection.text.trim().length > 0) {
          lines.push(detection.text);
        }
      }

      return lines;

    } catch (error) {
      console.error('OCR Error:', error);
      throw error;
    }
  }
}
