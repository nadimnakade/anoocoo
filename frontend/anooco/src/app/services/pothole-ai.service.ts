import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Injectable({
  providedIn: 'root'
})
export class PotholeAiService {
  async confirmPotholeFromCamera(): Promise<{ score: number, isPothole: boolean }> {
    const photo = await Camera.getPhoto({
      quality: 60,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera
    });
    if (!photo.base64String) {
      return { score: 0, isPothole: false };
    }
    return await this.analyzeBase64(photo.base64String);
  }

  async analyzeBase64(base64: string): Promise<{ score: number, isPothole: boolean }> {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;
    await new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !img.width || !img.height) {
      return { score: 0, isPothole: false };
    }
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    let darkCount = 0;
    let edgeSum = 0;
    const width = size;
    const height = size;

    const gray = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        gray[y * width + x] = (r * 0.299 + g * 0.587 + b * 0.114) as number;
        if (gray[y * width + x] < 50) darkCount++;
      }
    }

    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0, k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const val = gray[(y + ky) * width + (x + kx)];
            gx += val * sobelX[k];
            gy += val * sobelY[k];
            k++;
          }
        }
        const gmag = Math.sqrt(gx * gx + gy * gy);
        edgeSum += gmag;
      }
    }

    const total = width * height;
    const darkRatio = darkCount / total;
    const edgeAvg = edgeSum / total / 255;
    const score = Math.min(1, darkRatio * 0.7 + edgeAvg * 0.3);
    const isPothole = score > 0.55 && darkRatio > 0.25;
    return { score, isPothole };
  }
}
