import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ExtendedReportsPage } from './extended-reports.page';

const routes: Routes = [
  {
    path: '',
    component: ExtendedReportsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ExtendedReportsPageRoutingModule {}
