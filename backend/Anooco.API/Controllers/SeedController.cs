using Anooco.API.Services;
using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using Npgsql;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SeedController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public SeedController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpPost("reset-db")]
        public async Task<IActionResult> ResetDb()
        {
            try 
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var command = conn.CreateCommand();
                command.CommandText = @"
                    DROP TABLE IF EXISTS events CASCADE;
                    DROP TABLE IF EXISTS reports CASCADE;
                    DROP TABLE IF EXISTS users CASCADE;
                ";
                await command.ExecuteNonQueryAsync();
                return Ok("Tables dropped.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("setup-sp")]
        public async Task<IActionResult> SetupStoredProcedures()
        {
            try
            {
                var sqlPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "StoredProcedures.sql");
                if (!System.IO.File.Exists(sqlPath))
                    return NotFound("StoredProcedures.sql not found.");

                var sql = await System.IO.File.ReadAllTextAsync(sqlPath);

                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = sql;
                await cmd.ExecuteNonQueryAsync();

                return Ok("Stored procedures created successfully.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("fix-schema")]
        public async Task<IActionResult> FixSchema()
        {
            try 
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var command = conn.CreateCommand();
                command.CommandText = @"
                    -- Users Table Updates
                    CREATE TABLE IF NOT EXISTS users (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""Username"" text,
                        ""Email"" text,
                        ""PhoneNumber"" text,
                        ""AvatarUrl"" text,
                        ""PasswordHash"" text,
                        ""DeviceId"" text,
                        ""TrustScore"" integer DEFAULT 50,
                        ""CreatedAt"" timestamp with time zone DEFAULT now(),
                        ""LastActiveAt"" timestamp with time zone
                    );
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""Email"" text;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""PhoneNumber"" text;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""AvatarUrl"" text;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""PasswordHash"" text;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""DeviceId"" text;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""TrustScore"" integer DEFAULT 50;
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone DEFAULT now();
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""LastActiveAt"" timestamp with time zone;

                    -- Reports Table Updates
                    CREATE TABLE IF NOT EXISTS reports (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""UserId"" uuid,
                        ""ReportType"" text,
                        ""Description"" text,
                        ""Location"" geometry(Point, 4326),
                        ""Heading"" double precision,
                        ""Speed"" double precision,
                        ""ConfidenceScore"" double precision,
                        ""Processed"" boolean,
                        ""CreatedAt"" timestamp with time zone
                    );

                    -- Events Table Updates
                    CREATE TABLE IF NOT EXISTS events (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""EventType"" text,
                        ""Status"" text,
                        ""Location"" geometry(Point, 4326),
                        ""ClusterRadius"" integer,
                        ""ConfirmationsCount"" integer,
                        ""CreatedAt"" timestamp with time zone,
                        ""UpdatedAt"" timestamp with time zone
                    );
                    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""ValidUntil"" timestamp with time zone;
                    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""AggregateConfidence"" double precision;
                    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""Address"" text;
                ";
                await command.ExecuteNonQueryAsync();

                return Ok("Schema updated successfully.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> SeedData()
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                
                // Check if events exist
                using (var checkCmd = new NpgsqlCommand("SELECT COUNT(*) FROM events", conn))
                {
                    var count = (long)await checkCmd.ExecuteScalarAsync();
                    if (count > 0) return Ok(new { Message = "Database already has data." });
                }

                // Insert fake events
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO events (""Id"", ""EventType"", ""Status"", ""Location"", ""ClusterRadius"", ""ConfirmationsCount"", ""CreatedAt"", ""UpdatedAt"", ""ValidUntil"", ""AggregateConfidence"")
                    VALUES 
                    (gen_random_uuid(), 'POTHOLE', 'ACTIVE', ST_SetSRID(ST_MakePoint(-73.9851, 40.7589), 4326), 50, 5, NOW(), NOW(), NOW() + INTERVAL '1 hour', 0.8),
                    (gen_random_uuid(), 'ACCIDENT', 'ACTIVE', ST_SetSRID(ST_MakePoint(-73.9822, 40.7549), 4326), 50, 12, NOW(), NOW(), NOW() + INTERVAL '1 hour', 0.9),
                    (gen_random_uuid(), 'POLICE', 'ACTIVE', ST_SetSRID(ST_MakePoint(-73.9772, 40.7527), 4326), 50, 3, NOW(), NOW(), NOW() + INTERVAL '1 hour', 0.6);
                ";
                await cmd.ExecuteNonQueryAsync();

                return Ok(new { Message = "Seeded 3 fake events (NYC coordinates)." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
        [HttpGet("list-sp")]
        public async Task<IActionResult> ListStoredProcedures()
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT routine_name 
                    FROM information_schema.routines 
                    WHERE routine_type = 'FUNCTION' 
                    AND routine_schema = 'public'
                    AND routine_name LIKE 'sp_%';
                ";

                var sps = new List<string>();
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    sps.Add(reader.GetString(0));
                }

                return Ok(sps);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
        [HttpPost("seed-malta")]
        public async Task<IActionResult> SeedMaltaData()
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                
                // 1. Clear existing events for a clean slate (optional)
                using (var clearCmd = new NpgsqlCommand("DELETE FROM events", conn))
                {
                    await clearCmd.ExecuteNonQueryAsync();
                }

                // 2. Insert Malta Events
                var events = new List<(string Type, double Lat, double Lng, string Desc)>
                {
                    ("TRAFFIC", 35.8989, 14.5146, "Heavy traffic near Valletta Gate"),
                    ("ACCIDENT", 35.9080, 14.4920, "Minor collision in Msida"),
                    ("POLICE", 35.9120, 14.4980, "Speed camera check on Regional Road"),
                    ("PARK", 35.9375, 14.3754, "Public Parking in Mosta"),
                    ("POTHOLE", 35.9240, 14.4120, "Large pothole in Attard"),
                    ("LIFT", 35.9000, 14.4000, "Ride offer to Valletta")
                };

                foreach (var evt in events)
                {
                    // Using raw SQL for simplicity since we don't have an SP for direct event insertion yet (usually done via reporting)
                    // We'll simulate it by inserting directly into events table
                    using var cmd = new NpgsqlCommand(@"
                        INSERT INTO events (""Id"", ""EventType"", ""Status"", ""Location"", ""ConfirmationsCount"", ""UpdatedAt"", ""CreatedAt"", ""AggregateConfidence"")
                        VALUES (gen_random_uuid(), @type, 'ACTIVE', ST_SetSRID(ST_MakePoint(@lng, @lat), 4326), 1, NOW(), NOW(), 0.8)
                    ", conn);
                    
                    cmd.Parameters.AddWithValue("type", evt.Type);
                    cmd.Parameters.AddWithValue("lat", evt.Lat);
                    cmd.Parameters.AddWithValue("lng", evt.Lng);
                    
                    await cmd.ExecuteNonQueryAsync();
                }

                return Ok("Malta data seeded successfully.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }
}
