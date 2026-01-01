using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;
using Npgsql;

namespace Anooco.API.Services
{
    public class EventExpiryWorker : BackgroundService
    {
        private readonly DatabaseService _dbService;
        private readonly ILogger<EventExpiryWorker> _logger;
        private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(1);

        public EventExpiryWorker(DatabaseService dbService, ILogger<EventExpiryWorker> logger)
        {
            _dbService = dbService;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Event Expiry Worker running.");

            // Initial delay to let the app start up completely
            await Task.Delay(5000, stoppingToken);

            using var timer = new PeriodicTimer(_checkInterval);

            // Execute immediately (after initial delay) then on timer
            try
            {
                await CheckAndExpireEvents(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during initial event expiry check.");
            }

            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await CheckAndExpireEvents(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred while expiring events.");
                }
            }
        }

        private async Task CheckAndExpireEvents(CancellationToken stoppingToken)
        {
            // using var conn = await _dbService.CreateConnectionAsync();
            // using var cmd = new NpgsqlCommand("SELECT sp_expire_events()", conn);
            
            // var result = await cmd.ExecuteScalarAsync(stoppingToken);
            // int expiredCount = result != null ? (int)result : 0;

            // if (expiredCount > 0)
            // {
            //     _logger.LogInformation($"Expired {expiredCount} events.");
            // }
        }
    }
}
