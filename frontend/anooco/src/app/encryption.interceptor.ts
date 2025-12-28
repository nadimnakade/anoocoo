import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EncryptionService } from './services/encryption.service';
import { environment } from 'src/environments/environment';

@Injectable()
export class EncryptionInterceptor implements HttpInterceptor {

  constructor(private encryptionService: EncryptionService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip if disabled or not API call
    if (!environment.security.enableEncryption || !req.url.includes('/api/')) {
      return next.handle(req);
    }

    // Encrypt Request Body
    let clonedReq = req;
    if (req.body) {
      const encryptedBody = this.encryptionService.encrypt(req.body);
      // Backend expects the raw string in body (with quotes if JSON string)
      // Or just send it as a plain string payload
      clonedReq = req.clone({
        body: JSON.stringify(encryptedBody) // Wrap in quotes to match backend expectation of "string"
      });
    }

    return next.handle(clonedReq).pipe(
      map((event: HttpEvent<any>) => {
        // Decrypt Response Body
        if (event instanceof HttpResponse && event.body) {
          // Backend returns: "EncryptedString" (as JSON string)
          // So event.body might be the string itself
          
          let encryptedText = event.body;
          if (typeof encryptedText === 'string') {
             // If it came as "..." JSON string, Angular might have already parsed it to string
             // Just decrypt
             const decrypted = this.encryptionService.decrypt(encryptedText);
             return event.clone({ body: decrypted });
          }
        }
        return event;
      })
    );
  }
}