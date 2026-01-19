import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DashboardV2PageRoutingModule } from './dashboard-v2-routing.module';

import { DashboardV2Page } from './dashboard-v2.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DashboardV2PageRoutingModule
  ],
  declarations: [DashboardV2Page]
})
export class DashboardV2PageModule {}
