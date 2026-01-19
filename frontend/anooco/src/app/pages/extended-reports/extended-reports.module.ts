import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ExtendedReportsPageRoutingModule } from './extended-reports-routing.module';

import { ExtendedReportsPage } from './extended-reports.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ExtendedReportsPageRoutingModule
  ],
  declarations: [ExtendedReportsPage]
})
export class ExtendedReportsPageModule {}
