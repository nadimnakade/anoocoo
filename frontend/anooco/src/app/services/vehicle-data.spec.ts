import { TestBed } from '@angular/core/testing';

import { VehicleData } from './vehicle-data';

describe('VehicleData', () => {
  let service: VehicleData;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VehicleData);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
