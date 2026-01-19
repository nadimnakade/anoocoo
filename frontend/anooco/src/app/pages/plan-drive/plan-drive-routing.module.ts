import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PlanDrivePage } from './plan-drive.page';

const routes: Routes = [
  {
    path: '',
    component: PlanDrivePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PlanDrivePageRoutingModule {}
