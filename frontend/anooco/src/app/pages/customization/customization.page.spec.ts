import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomizationPage } from './customization.page';

describe('CustomizationPage', () => {
  let component: CustomizationPage;
  let fixture: ComponentFixture<CustomizationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CustomizationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
