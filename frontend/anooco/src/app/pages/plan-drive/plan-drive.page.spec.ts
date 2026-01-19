import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlanDrivePage } from './plan-drive.page';

describe('PlanDrivePage', () => {
  let component: PlanDrivePage;
  let fixture: ComponentFixture<PlanDrivePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PlanDrivePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
