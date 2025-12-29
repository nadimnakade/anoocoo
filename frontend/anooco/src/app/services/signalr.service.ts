import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubConnection: signalR.HubConnection | undefined;
  private hubUrl = environment.apiUrl.replace('/api', '/hubs/alerts');

  public eventCreated$ = new Subject<any>();
  public eventUpdated$ = new Subject<any>();
  public connectionStatus$ = new BehaviorSubject<string>('disconnected');

  constructor() {
    this.startConnection();
  }

  public startConnection = () => {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => {
        console.log('Connection started');
        this.connectionStatus$.next('connected');
        this.addListeners();
      })
      .catch(err => {
        console.log('Error while starting connection: ' + err);
        this.connectionStatus$.next('error');
        // Retry after 5s
        setTimeout(() => this.startConnection(), 5000);
      });
  }

  private addListeners() {
    if (!this.hubConnection) return;

    this.hubConnection.on('EventCreated', (data) => {
      console.log('EventCreated received:', data);
      this.eventCreated$.next(data);
    });

    this.hubConnection.on('EventUpdated', (data) => {
      console.log('EventUpdated received:', data);
      this.eventUpdated$.next(data);
    });
  }
}
