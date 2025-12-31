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
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        promptLabelHeader: 'Scan Street Sign'
      });

      if (!photo.base64String) {
        throw new Error('No image data returned');
      }

      const data: TextDetections = await Ocr.detectText({
        base64: photo.base64String
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
