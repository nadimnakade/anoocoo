import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PlanDrivePageRoutingModule } from './plan-drive-routing.module';

import { PlanDrivePage } from './plan-drive.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PlanDrivePageRoutingModule
  ],
  declarations: [PlanDrivePage]
})
export class PlanDrivePageModule {}
