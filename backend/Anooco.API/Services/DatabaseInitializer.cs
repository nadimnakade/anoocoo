using Npgsql;
using System.IO;

namespace Anooco.API.Services
{
    public class DatabaseInitializer
    {
        private readonly DatabaseService _dbService;
        private readonly ILogger<DatabaseInitializer> _logger;

        public DatabaseInitializer(DatabaseService dbService, ILogger<DatabaseInitializer> logger)
        {
            _dbService = dbService;
            _logger = logger;
        }

        public async Task InitializeAsync()
        {
            try
            {
                _logger.LogInformation("Starting database initialization...");
                await FixSchemaAsync();
                await SetupStoredProceduresAsync();
                _logger.LogInformation("Database initialization completed successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Database initialization failed.");
                // We don't rethrow because we don't want to crash the app on transient DB errors, 
                // but for schema mismatch it might be better to crash. 
                // For now, logging is enough.
            }
        }

        private async Task FixSchemaAsync()
        {
            _logger.LogInformation("Ensuring schema is up to date...");
            using var conn = await _dbService.CreateConnectionAsync();
            using var command = conn.CreateCommand();
            //command.CommandText = @"
            //    -- Users Table Updates
            //    CREATE TABLE IF NOT EXISTS users (
            //        ""Id"" uuid NOT NULL PRIMARY KEY,
            //        ""Username"" text,
            //        ""Email"" text,
            //        ""PhoneNumber"" text,
            //        ""AvatarUrl"" text,
            //        ""PasswordHash"" text,
            //        ""DeviceId"" text,
            //        ""TrustScore"" integer DEFAULT 50,
            //        ""CreatedAt"" timestamp with time zone DEFAULT now(),
            //        ""LastActiveAt"" timestamp with time zone
            //    );
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""Email"" text;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""PhoneNumber"" text;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""AvatarUrl"" text;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""PasswordHash"" text;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""DeviceId"" text;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""TrustScore"" integer DEFAULT 50;
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone DEFAULT now();
            //    ALTER TABLE users ADD COLUMN IF NOT EXISTS ""LastActiveAt"" timestamp with time zone;

            //    -- Reports Table Updates
            //    CREATE TABLE IF NOT EXISTS reports (
            //        ""Id"" uuid NOT NULL PRIMARY KEY,
            //        ""UserId"" uuid,
            //        ""ReportType"" text,
            //        ""Description"" text,
            //        ""Location"" geometry(Point, 4326),
            //        ""Heading"" double precision,
            //        ""Speed"" double precision,
            //        ""ConfidenceScore"" double precision,
            //        ""Processed"" boolean,
            //        ""Source"" text,
            //        ""CreatedAt"" timestamp with time zone
            //    );
            //    ALTER TABLE reports ADD COLUMN IF NOT EXISTS "Source" text DEFAULT 'manual';
            //    ALTER TABLE reports ADD COLUMN IF NOT EXISTS "Image" bytea;

            //    -- Events Table Updates
            //    CREATE TABLE IF NOT EXISTS events (
            //        ""Id"" uuid NOT NULL PRIMARY KEY,
            //        ""EventType"" text,
            //        ""Status"" text,
            //        ""Location"" geometry(Point, 4326),
            //        ""ClusterRadius"" integer,
            //        ""ConfirmationsCount"" integer,
            //        ""CreatedAt"" timestamp with time zone,
            //        ""UpdatedAt"" timestamp with time zone
            //    );
            //    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""ValidUntil"" timestamp with time zone;
            //    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""AggregateConfidence"" double precision;
            //    ALTER TABLE events ADD COLUMN IF NOT EXISTS ""Address"" text;
            //";
            await command.ExecuteNonQueryAsync();
        }

        private async Task SetupStoredProceduresAsync()
        {
            _logger.LogInformation("Updating stored procedures...");
            var sqlPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "StoredProcedures.sql");
            
            if (!File.Exists(sqlPath))
            {
                _logger.LogWarning("StoredProcedures.sql not found at " + sqlPath);
                return;
            }

            var sql = await File.ReadAllTextAsync(sqlPath);

            using var conn = await _dbService.CreateConnectionAsync();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            await cmd.ExecuteNonQueryAsync();
        }
    }
}
