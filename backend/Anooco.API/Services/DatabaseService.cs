using System.Data;
using Npgsql;
using NetTopologySuite.Geometries;

namespace Anooco.API.Services
{
    public class DatabaseService
    {
        private readonly string _connectionString;

        public DatabaseService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection");
        }

        public NpgsqlConnection CreateConnection()
        {
            var dataSourceBuilder = new NpgsqlDataSourceBuilder(_connectionString);
            dataSourceBuilder.UseNetTopologySuite(); // Enable spatial types
            var dataSource = dataSourceBuilder.Build();
            return dataSource.OpenConnection();
        }

        public async Task<NpgsqlConnection> CreateConnectionAsync()
        {
            var dataSourceBuilder = new NpgsqlDataSourceBuilder(_connectionString);
            dataSourceBuilder.UseNetTopologySuite(); // Enable spatial types
            var dataSource = dataSourceBuilder.Build();
            return await dataSource.OpenConnectionAsync();
        }
    }
}
