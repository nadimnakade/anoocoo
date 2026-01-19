import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VehicleServicesPage } from './vehicle-services.page';

describe('VehicleServicesPage', () => {
  let component: VehicleServicesPage;
  let fixture: ComponentFixture<VehicleServicesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(VehicleServicesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
