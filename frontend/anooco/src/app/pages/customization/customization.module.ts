import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomizationPageRoutingModule } from './customization-routing.module';

import { CustomizationPage } from './customization.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CustomizationPageRoutingModule
  ],
  declarations: [CustomizationPage]
})
export class CustomizationPageModule {}
