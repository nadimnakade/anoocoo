import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ToolsPage } from './tools.page';

const routes: Routes = [
  {
    path: '',
    component: ToolsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ToolsPageRoutingModule {}
