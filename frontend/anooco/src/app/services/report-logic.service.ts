import { Injectable } from '@angular/core';

export interface ReportIntent {
  type: string; // e.g., 'REPORT_ACCIDENT', 'REPORT_HAZARD'
  category: 'Critical' | 'Warning' | 'Info' | 'Utility';
  confidence: number;
  originalText: string;
  metadata?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ReportLogicService {

  constructor() { }

  parseVoiceCommand(text: string): ReportIntent | null {
    const lowerText = text.toLowerCase();

    // 1. Critical: Accidents
    if (/(accident|crash|collision)/.test(lowerText)) {
      return {
        type: 'REPORT_ACCIDENT',
        category: 'Critical',
        confidence: 0.9,
        originalText: text
      };
    }

    // 2. Warning: Hazards (Potholes, etc)
    if (/(pothole|bad road|bump|hole)/.test(lowerText)) {
      return {
        type: 'REPORT_HAZARD',
        category: 'Warning',
        confidence: 0.8,
        originalText: text
      };
    }

    // 3. Info: Enforcement
    if (/(police|camera|trap|cop)/.test(lowerText)) {
      let direction = 'Unknown';
      if (lowerText.includes('ahead')) direction = 'Forward';

      return {
        type: 'REPORT_ENFORCEMENT',
        category: 'Info',
        confidence: 0.8,
        originalText: text,
        metadata: { direction }
      };
    }

    // 4. Info: Traffic
    if (/(traffic|stuck|jam|slow)/.test(lowerText)) {
      return {
        type: 'REPORT_TRAFFIC',
        category: 'Info',
        confidence: 0.8,
        originalText: text
      };
    }

    return null;
  }
}
