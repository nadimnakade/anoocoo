using Microsoft.AspNetCore.SignalR;

namespace Anooco.API.Hubs
{
    public class AlertHub : Hub
    {
        public async Task SendLocationUpdate(double lat, double lon, double heading)
        {
            // Client sends location updates here
            // Server checks for nearby alerts and pushes them back
            // await Clients.Caller.SendAsync("ReceiveAlert", alertPayload);
            await Task.CompletedTask;
        }
    }
}
