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
                
                var points = request.Route.Select(p => $"{p[1]} {p[0]}");
                var linestringWkt = $"LINESTRING({string.Join(", ", points)})";

                using var cmd = new NpgsqlCommand(@"
                    SELECT ""Id"", ""EventType"", ""Location"", ""ConfirmationsCount"", ""UpdatedAt"", ""Address""
                    FROM events
                    WHERE ""Status"" = 'ACTIVE'
                    AND ST_DWithin(""Location""::geography, ST_GeomFromText(@wkt, 4326)::geography, @radius)
                ", conn);
                
                cmd.Parameters.AddWithValue("wkt", linestringWkt);
                cmd.Parameters.AddWithValue("radius", (double)request.RadiusKm * 1000);

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

        [HttpPost("route/smoothness")]
        public async Task<IActionResult> GetRouteSmoothness([FromBody] RouteSearchRequest request)
        {
            if (request.Route == null || request.Route.Length < 2)
                return BadRequest("Invalid route.");

            var routeLengthKm = RouteMetrics.ComputeRouteLengthKm(request.Route);

            var totalEvents = 0;
            var potholeCount = 0;
            var potholesLast24h = 0;
            var weightedSeverity = 0.0;

            try
            {
                using var conn = await _dbService.CreateConnectionAsync();

                var points = request.Route.Select(p => $"{p[1]} {p[0]}");
                var linestringWkt = $"LINESTRING({string.Join(", ", points)})";

                using var cmd = new NpgsqlCommand(@"
                    SELECT ""EventType"", ""ConfirmationsCount"", ""UpdatedAt""
                    FROM events
                    WHERE ""Status"" = 'ACTIVE'
                    AND ST_DWithin(""Location""::geography, ST_GeomFromText(@wkt, 4326)::geography, @radius)
                ", conn);

                cmd.Parameters.AddWithValue("wkt", linestringWkt);
                cmd.Parameters.AddWithValue("radius", (double)request.RadiusKm * 1000);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    totalEvents++;

                    var eventType = reader["EventType"]?.ToString();
                    if (!string.Equals(eventType, "POTHOLE", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    potholeCount++;

                    var confirmations = 1;
                    if (reader["ConfirmationsCount"] != DBNull.Value)
                    {
                        confirmations = Convert.ToInt32(reader["ConfirmationsCount"]);
                    }

                    if (reader["UpdatedAt"] != DBNull.Value)
                    {
                        var updatedAt = (DateTime)reader["UpdatedAt"];
                        var hours = (DateTime.UtcNow - updatedAt.ToUniversalTime()).TotalHours;
                        if (hours <= 24)
                        {
                            potholesLast24h++;
                        }

                        var weight = Math.Exp(-Math.Max(0, hours) / 24.0);
                        weightedSeverity += confirmations * weight;
                    }
                    else
                    {
                        weightedSeverity += confirmations;
                    }
                }

                var roughnessIndex = 0.0;

                if (routeLengthKm > 0 && potholeCount > 0)
                {
                    var density = weightedSeverity / routeLengthKm;
                    var scale = 5.0;
                    roughnessIndex = Math.Min(1.0, density / scale);
                }

                return Ok(new
                {
                    RouteLengthKm = routeLengthKm,
                    TotalEvents = totalEvents,
                    PotholeCount = potholeCount,
                    PotholesLast24h = potholesLast24h,
                    RoughnessIndex = roughnessIndex
                });
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

        [HttpPost("enforcement-hotspots")]
        public async Task<IActionResult> GetEnforcementHotspots([FromBody] RouteSearchRequest request)
        {
            if (request.Route == null || request.Route.Length < 2)
                return BadRequest("Invalid route.");

            var hotspots = new Dictionary<string, EnforcementCell>();
            var totalEvents = 0;

            try
            {
                using var conn = await _dbService.CreateConnectionAsync();

                var points = request.Route.Select(p => $"{p[1]} {p[0]}");
                var linestringWkt = $"LINESTRING({string.Join(", ", points)})";

                using var cmd = new NpgsqlCommand(@"
                    SELECT ""EventType"", ""Location"", ""CreatedAt""
                    FROM events
                    WHERE ""EventType"" = 'POLICE'
                    AND ST_DWithin(""Location""::geography, ST_GeomFromText(@wkt, 4326)::geography, @radius)
                ", conn);

                cmd.Parameters.AddWithValue("wkt", linestringWkt);
                cmd.Parameters.AddWithValue("radius", (double)request.RadiusKm * 1000);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var location = reader["Location"] as Point;
                    if (location == null)
                    {
                        continue;
                    }

                    var createdAt = reader["CreatedAt"] != DBNull.Value
                        ? (DateTime)reader["CreatedAt"]
                        : DateTime.UtcNow;

                    totalEvents++;

                    var lat = location.Y;
                    var lng = location.X;

                    var gridSize = 0.01;
                    var latIndex = Math.Round(lat / gridSize);
                    var lngIndex = Math.Round(lng / gridSize);
                    var key = $"{latIndex}:{lngIndex}";

                    if (!hotspots.TryGetValue(key, out var cell))
                    {
                        cell = new EnforcementCell();
                        hotspots[key] = cell;
                    }

                    cell.Count++;
                    cell.SumLat += lat;
                    cell.SumLng += lng;

                    var dayOfWeek = (int)createdAt.DayOfWeek;
                    var hourOfDay = createdAt.Hour;
                    var hourOfWeek = dayOfWeek * 24 + hourOfDay;
                    if (hourOfWeek >= 0 && hourOfWeek < cell.HourCounts.Length)
                    {
                        cell.HourCounts[hourOfWeek]++;
                    }
                }

                var result = hotspots.Values
                    .Select(cell =>
                    {
                        var bestHourIndex = 0;
                        var bestHourCount = 0;

                        for (var i = 0; i < cell.HourCounts.Length; i++)
                        {
                            if (cell.HourCounts[i] > bestHourCount)
                            {
                                bestHourCount = cell.HourCounts[i];
                                bestHourIndex = i;
                            }
                        }

                        var dayOfWeek = bestHourIndex / 24;
                        var hourOfDay = bestHourIndex % 24;

                        var lat = cell.SumLat / Math.Max(1, cell.Count);
                        var lng = cell.SumLng / Math.Max(1, cell.Count);

                        var probability = totalEvents > 0
                            ? (double)cell.Count / totalEvents
                            : 0.0;

                        return new
                        {
                            Latitude = lat,
                            Longitude = lng,
                            Count = cell.Count,
                            Probability = probability,
                            TypicalDayOfWeek = dayOfWeek,
                            TypicalHourOfDay = hourOfDay
                        };
                    })
                    .OrderByDescending(h => h.Count)
                    .Take(50)
                    .ToList();

                return Ok(new
                {
                    TotalEvents = totalEvents,
                    Hotspots = result
                });
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

    internal sealed class EnforcementCell
    {
        public int Count { get; set; }
        public double SumLat { get; set; }
        public double SumLng { get; set; }
        public int[] HourCounts { get; } = new int[168];
    }

    internal static class RouteMetrics
    {
        public static double ComputeRouteLengthKm(double[][] route)
        {
            if (route == null || route.Length < 2)
            {
                return 0;
            }

            var length = 0.0;

            for (var i = 0; i < route.Length - 1; i++)
            {
                var a = route[i];
                var b = route[i + 1];

                length += HaversineKm(a[0], a[1], b[0], b[1]);
            }

            return length;
        }

        private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double r = 6371.0;

            var dLat = (lat2 - lat1) * Math.PI / 180.0;
            var dLon = (lon2 - lon1) * Math.PI / 180.0;

            var a = Math.Sin(dLat / 2.0) * Math.Sin(dLat / 2.0) +
                    Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                    Math.Sin(dLon / 2.0) * Math.Sin(dLon / 2.0);

            var c = 2.0 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1.0 - a));

            return r * c;
        }
    }
}
