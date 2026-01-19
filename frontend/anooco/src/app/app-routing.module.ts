import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'signup',
    loadChildren: () => import('./pages/signup/signup.module').then(m => m.SignupPageModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then(m => m.DashboardPageModule)
  },
  {
    path: 'report',
    loadChildren: () => import('./pages/report/report.module').then(m => m.ReportPageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('./pages/profile/profile.module').then(m => m.ProfilePageModule)
  },
  {
    path: 'activity',
    loadChildren: () => import('./pages/activity/activity.module').then(m => m.ActivityPageModule)
  },
  {
    path: 'alerts',
    loadChildren: () => import('./pages/alerts/alerts.module').then(m => m.AlertsPageModule)
  },
  {
    path: 'settings',
    loadChildren: () => import('./pages/settings/settings.module').then(m => m.SettingsPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'tools',
    loadChildren: () => import('./pages/tools/tools.module').then(m => m.ToolsPageModule)
  },
  {
    path: 'guide',
    loadChildren: () => import('./pages/guide/guide.module').then(m => m.GuidePageModule)
  },
  {
    path: 'navigation',
    loadChildren: () => import('./pages/navigation/navigation.module').then(m => m.NavigationPageModule)
  },
  {
    path: 'plan-drive',
    loadChildren: () => import('./pages/plan-drive/plan-drive.module').then( m => m.PlanDrivePageModule)
  },
  {
    path: 'vehicle-services',
    loadChildren: () => import('./pages/vehicle-services/vehicle-services.module').then( m => m.VehicleServicesPageModule)
  },
  {
    path: 'multimedia',
    loadChildren: () => import('./pages/multimedia/multimedia.module').then( m => m.MultimediaPageModule)
  },
  {
    path: 'social',
    loadChildren: () => import('./pages/social/social.module').then( m => m.SocialPageModule)
  },
  {
    path: 'customization',
    loadChildren: () => import('./pages/customization/customization.module').then( m => m.CustomizationPageModule)
  },
  {
    path: 'extended-reports',
    loadChildren: () => import('./pages/extended-reports/extended-reports.module').then( m => m.ExtendedReportsPageModule)
  },
  {
    path: 'dashboard-v2',
    loadChildren: () => import('./pages/dashboard-v2/dashboard-v2.module').then( m => m.DashboardV2PageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
