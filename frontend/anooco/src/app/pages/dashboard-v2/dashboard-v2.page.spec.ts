import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardV2Page } from './dashboard-v2.page';

describe('DashboardV2Page', () => {
  let component: DashboardV2Page;
  let fixture: ComponentFixture<DashboardV2Page>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DashboardV2Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
