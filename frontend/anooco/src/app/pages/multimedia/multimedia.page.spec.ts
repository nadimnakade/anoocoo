import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultimediaPage } from './multimedia.page';

describe('MultimediaPage', () => {
  let component: MultimediaPage;
  let fixture: ComponentFixture<MultimediaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MultimediaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
