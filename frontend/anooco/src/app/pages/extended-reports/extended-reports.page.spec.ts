import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExtendedReportsPage } from './extended-reports.page';

describe('ExtendedReportsPage', () => {
  let component: ExtendedReportsPage;
  let fixture: ComponentFixture<ExtendedReportsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ExtendedReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
