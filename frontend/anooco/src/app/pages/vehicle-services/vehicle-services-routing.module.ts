import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VehicleServicesPage } from './vehicle-services.page';

const routes: Routes = [
  {
    path: '',
    component: VehicleServicesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VehicleServicesPageRoutingModule {}
