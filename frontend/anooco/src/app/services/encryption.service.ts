import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private key: any;
  private ivLength = 16; // 128-bit IV

  constructor() {
    // Key must be parsed as WordArray
    // We assume the key string is utf8
    this.key = CryptoJS.enc.Utf8.parse(environment.security.encryptionKey.substring(0, 32));
  }

  encrypt(plainText: any): string {
    if (!plainText) return plainText;
    
    // Convert object to string if needed
    const text = typeof plainText === 'object' ? JSON.stringify(plainText) : String(plainText);

    // Generate random IV
    const iv = CryptoJS.lib.WordArray.random(this.ivLength);

    const encrypted = CryptoJS.AES.encrypt(text, this.key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    // Combine IV + Ciphertext (mimic backend: Prepend IV)
    // Backend expects IV (16 bytes) + Ciphertext
    // CryptoJS "encrypted.ciphertext" is just the body.
    
    // We need to concat IV and Ciphertext manually
    const ivHex = CryptoJS.enc.Hex.stringify(iv);
    const cipherHex = CryptoJS.enc.Hex.stringify(encrypted.ciphertext);
    
    // Convert combined hex to Base64
    const combined = CryptoJS.enc.Hex.parse(ivHex + cipherHex);
    return CryptoJS.enc.Base64.stringify(combined);
  }

  decrypt(cipherText: string): any {
    if (!cipherText) return cipherText;

    try {
      // Decode Base64 to WordArray
      const combined = CryptoJS.enc.Base64.parse(cipherText);
      
      // Extract IV (first 16 bytes = 32 hex chars)
      // Create new WordArray for IV
      const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), 16); // 4 words = 16 bytes
      
      // Extract Ciphertext (remaining)
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - 16)
      });

      const decrypted = CryptoJS.AES.decrypt(cipherParams, this.key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const str = decrypted.toString(CryptoJS.enc.Utf8);
      
      // Try parsing JSON
      try {
        return JSON.parse(str);
      } catch {
        return str;
      }
    } catch (e) {
      console.error('Decryption failed', e);
      return cipherText;
    }
  }
}