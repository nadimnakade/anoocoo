using Anooco.API.Hubs;
using Anooco.API.Models;
using Microsoft.AspNetCore.SignalR;
using NetTopologySuite.Geometries;
using Npgsql;

namespace Anooco.API.Services
{
    public interface IReportIntakeService
    {
        Task<Guid> ProcessReportAsync(CreateReportDto report);
    }

    public class ReportIntakeService : IReportIntakeService
    {
        private readonly ILogger<ReportIntakeService> _logger;
        private readonly DatabaseService _dbService;
        private readonly IHubContext<AlertHub> _hubContext;
        private readonly IGeocodingService _geocodingService;

        public ReportIntakeService(ILogger<ReportIntakeService> logger, DatabaseService dbService, IHubContext<AlertHub> hubContext, IGeocodingService geocodingService)
        {
            _logger = logger;
            _dbService = dbService;
            _hubContext = hubContext;
            _geocodingService = geocodingService;
        }

        public async Task<Guid> ProcessReportAsync(CreateReportDto reportDto)
        {
            _logger.LogInformation($"Processing report: {reportDto.RawText}");
            var reportType = DetermineIntent(reportDto.RawText);
            var location = new Point(reportDto.Longitude, reportDto.Latitude) { SRID = 4326 };

            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                
                // 1. Save Report
                using var cmd = new NpgsqlCommand("SELECT * FROM sp_create_report(@userId, @type, @desc, @loc, @heading, @speed, @conf)", conn);
                cmd.Parameters.AddWithValue("userId", DBNull.Value);
                cmd.Parameters.AddWithValue("type", reportType);
                cmd.Parameters.AddWithValue("desc", reportDto.RawText ?? "");
                cmd.Parameters.AddWithValue("loc", location);
                cmd.Parameters.AddWithValue("heading", reportDto.Heading ?? 0);
                cmd.Parameters.AddWithValue("speed", reportDto.Speed ?? 0);
                cmd.Parameters.AddWithValue("conf", 0.0);

                var result = await cmd.ExecuteScalarAsync();
                if (result == null) throw new Exception("Failed to create report");
                var reportId = (Guid)result;
                
                _logger.LogInformation($"Report saved with ID: {reportId}");

                // 2. Process Intelligence (in DB)
                using var intCmd = new NpgsqlCommand("SELECT * FROM sp_process_report_intelligence(@reportId)", conn);
                intCmd.Parameters.AddWithValue("reportId", reportId);

                using var reader = await intCmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    var action = reader.GetString(0);
                    var eventId = reader.GetGuid(1);
                    var eventType = reader.GetString(2);
                    var eventLoc = reader["Location"] as Point;
                    var confirmations = reader.GetInt32(4);
                    var updatedAt = reader.GetDateTime(5);

                    // Close reader so we can execute new commands on the same connection
                    await reader.CloseAsync();

                    // 3. Geocode (Reverse Geocoding)
                    string? address = null;
                    if (eventLoc != null)
                    {
                        try
                        {
                            address = await _geocodingService.GetAddressAsync(eventLoc.Y, eventLoc.X);
                            if (!string.IsNullOrEmpty(address))
                            {
                                using var updateCmd = new NpgsqlCommand("UPDATE events SET \"Address\" = @addr WHERE \"Id\" = @id", conn);
                                updateCmd.Parameters.AddWithValue("addr", address);
                                updateCmd.Parameters.AddWithValue("id", eventId);
                                await updateCmd.ExecuteNonQueryAsync();
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to geocode event");
                        }
                    }

                    var payload = new 
                    {
                        Id = eventId,
                        EventType = eventType,
                        Latitude = eventLoc?.Y ?? 0,
                        Longitude = eventLoc?.X ?? 0,
                        ConfirmationsCount = confirmations,
                        UpdatedAt = updatedAt,
                        Address = address
                    };

                    if (action == "CREATED")
                    {
                        await _hubContext.Clients.All.SendAsync("EventCreated", payload);
                    }
                    else
                    {
                        await _hubContext.Clients.All.SendAsync("EventUpdated", payload);
                    }
                }

                return reportId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save/process report");
                return Guid.Empty;
            }
        }

        private string DetermineIntent(string? text)
        {
            if (string.IsNullOrEmpty(text)) return "UNKNOWN";
            text = text.ToLower();
            
            if (text.Contains("pothole") || text.Contains("bump")) return "POTHOLE";
            if (text.Contains("accident") || text.Contains("crash")) return "ACCIDENT";
            if (text.Contains("police") || text.Contains("cop")) return "POLICE";
            if (text.Contains("traffic") || text.Contains("stuck")) return "TRAFFIC";
            if (text.Contains("park") || text.Contains("parking")) return "PARK";
            if (text.Contains("lift") || text.Contains("ride")) return "LIFT";
            
            return "GENERAL";
        }
    }
}
