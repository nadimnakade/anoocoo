using Anooco.API.Services;
using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using Npgsql;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventsController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public EventsController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpGet]
        public async Task<IActionResult> GetActiveEvents()
        {
            var events = new List<object>();
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand("SELECT * FROM sp_get_active_events()", conn);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var location = reader["Location"] as Point;
                    
                    // Log if location is missing (debugging "blank data")
                    if (location == null)
                    {
                        Console.WriteLine($"[Warning] Event {reader["Id"]} has null location.");
                    }

                    events.Add(new
                    {
                        Id = reader["Id"],
                        EventType = reader["EventType"]?.ToString(),
                        Latitude = location?.Y ?? 0,
                        Longitude = location?.X ?? 0,
                        ConfirmationsCount = reader["ConfirmationsCount"],
                        UpdatedAt = reader["UpdatedAt"],
                        Address = reader["Address"] as string
                    });
                }

                return Ok(events);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("route")]
        public async Task<IActionResult> GetEventsAlongRoute([FromBody] RouteSearchRequest request)
        {
            if (request.Route == null || request.Route.Length < 2)
                return BadRequest("Invalid route.");

            var events = new List<object>();
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                
                // Construct LineString WKT
                // NetTopologySuite uses Longitude first (X), Latitude second (Y)
                // Leaflet usually gives [Lat, Lng], so we swap if needed.
                // Assuming request is [Lat, Lng] from Leaflet
                var points = request.Route.Select(p => $"{p[1]} {p[0]}"); // Lng Lat
                var linestringWkt = $"LINESTRING({string.Join(", ", points)})";

                using var cmd = new NpgsqlCommand(@"
                    SELECT ""Id"", ""EventType"", ""Location"", ""ConfirmationsCount"", ""UpdatedAt"", ""Address""
                    FROM events
                    WHERE ""Status"" = 'ACTIVE'
                    AND ST_DWithin(""Location""::geography, ST_GeomFromText(@wkt, 4326)::geography, @radius)
                ", conn);
                
                cmd.Parameters.AddWithValue("wkt", linestringWkt);
                cmd.Parameters.AddWithValue("radius", (double)request.RadiusKm * 1000); // meters

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var location = reader["Location"] as Point;
                    events.Add(new
                    {
                        Id = reader["Id"],
                        EventType = reader["EventType"]?.ToString(),
                        Latitude = location?.Y ?? 0,
                        Longitude = location?.X ?? 0,
                        ConfirmationsCount = reader["ConfirmationsCount"],
                        UpdatedAt = reader["UpdatedAt"],
                        Address = reader["Address"] as string
                    });
                }

                return Ok(events);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("{id}/confirm")]
        public async Task<IActionResult> ConfirmEvent(Guid id)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand(@"
                    UPDATE events 
                    SET ""ConfirmationsCount"" = ""ConfirmationsCount"" + 1,
                        ""UpdatedAt"" = NOW()
                    WHERE ""Id"" = @id
                ", conn);
                cmd.Parameters.AddWithValue("id", id);
                await cmd.ExecuteNonQueryAsync();
                return Ok(new { message = "Confirmed" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("{id}/clear")]
        public async Task<IActionResult> ClearEvent(Guid id)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                // Increment Cleared count. If > 2, mark as CLEARED
                using var cmd = new NpgsqlCommand(@"
                    UPDATE events 
                    SET ""ClearedReportsCount"" = ""ClearedReportsCount"" + 1,
                        ""UpdatedAt"" = NOW(),
                        ""Status"" = CASE WHEN ""ClearedReportsCount"" >= 2 THEN 'CLEARED' ELSE ""Status"" END
                    WHERE ""Id"" = @id
                ", conn);
                cmd.Parameters.AddWithValue("id", id);
                await cmd.ExecuteNonQueryAsync();
                return Ok(new { message = "Reported as cleared" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("{id}/false")]
        public async Task<IActionResult> ReportFalseEvent(Guid id)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                // Increment False count. If > 2, mark as FALSE_POSITIVE
                using var cmd = new NpgsqlCommand(@"
                    UPDATE events 
                    SET ""FalseReportsCount"" = ""FalseReportsCount"" + 1,
                        ""UpdatedAt"" = NOW(),
                        ""Status"" = CASE WHEN ""FalseReportsCount"" >= 2 THEN 'FALSE_POSITIVE' ELSE ""Status"" END
                    WHERE ""Id"" = @id
                ", conn);
                cmd.Parameters.AddWithValue("id", id);
                await cmd.ExecuteNonQueryAsync();
                return Ok(new { message = "Reported as false" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }

    public class RouteSearchRequest
    {
        public double[][] Route { get; set; }
        public double RadiusKm { get; set; }
    }
}
