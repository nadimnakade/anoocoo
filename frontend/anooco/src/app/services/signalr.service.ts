import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { environment } from 'src/environments/environment';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubConnection: HubConnection | undefined;

  // Observables for components to subscribe to
  public eventCreated$ = new BehaviorSubject<any>(null);
  public eventUpdated$ = new BehaviorSubject<any>(null);

  constructor() { }

  public startConnection = () => {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(`${environment.apiUrl.replace('/api', '')}/hubs/alerts`) // e.g. http://localhost:5000/hubs/alerts
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('SignalR Connection started'))
      .catch(err => console.log('Error while starting connection: ' + err));

    this.registerListeners();
  }

  private registerListeners() {
    if (!this.hubConnection) return;

    this.hubConnection.on('EventCreated', (data) => {
      console.log('SignalR: EventCreated', data);
      this.eventCreated$.next(data);
    });

    this.hubConnection.on('EventUpdated', (data) => {
      console.log('SignalR: EventUpdated', data);
      this.eventUpdated$.next(data);
    });
  }
}
