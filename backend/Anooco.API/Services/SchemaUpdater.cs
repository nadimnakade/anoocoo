using Npgsql;
using Anooco.API.Services;

namespace Anooco.API.Services
{
    public class SchemaUpdater
    {
        private readonly DatabaseService _db;

        public SchemaUpdater(DatabaseService db)
        {
            _db = db;
        }

        public async Task UpdateSchemaAsync()
        {
            using var conn = await _db.CreateConnectionAsync();
            
            // Add FalseReportsCount
            var cmd1 = new NpgsqlCommand(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='FalseReportsCount') THEN
                        ALTER TABLE events ADD COLUMN ""FalseReportsCount"" INT DEFAULT 0;
                    END IF;
                END
                $$;", conn);
            await cmd1.ExecuteNonQueryAsync();

            // Add ClearedReportsCount
            var cmd2 = new NpgsqlCommand(@"
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='ClearedReportsCount') THEN
                        ALTER TABLE events ADD COLUMN ""ClearedReportsCount"" INT DEFAULT 0;
                    END IF;
                END
                $$;", conn);
            await cmd2.ExecuteNonQueryAsync();
        }
    }
}
