import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VehicleServicesPageRoutingModule } from './vehicle-services-routing.module';

import { VehicleServicesPage } from './vehicle-services.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VehicleServicesPageRoutingModule
  ],
  declarations: [VehicleServicesPage]
})
export class VehicleServicesPageModule {}
