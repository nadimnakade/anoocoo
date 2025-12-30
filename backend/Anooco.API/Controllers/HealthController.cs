using Anooco.API.Services;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        private readonly DatabaseService _dbService;
        private readonly ILogger<HealthController> _logger;
        private readonly IConfiguration _configuration;

        public HealthController(DatabaseService dbService, ILogger<HealthController> logger, IConfiguration configuration)
        {
            _dbService = dbService;
            _logger = logger;
            _configuration = configuration;
        }

        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok(new
            {
                Status = "OK",
                Time = DateTimeOffset.UtcNow
            });
        }

        [HttpGet("info")]
        public IActionResult Info()
        {
            var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
            var encryptionEnabled = _configuration.GetValue<bool>("Security:EnableEncryption");
            var pathBase = _configuration["PathBase"];
            return Ok(new
            {
                Environment = env,
                Encryption = encryptionEnabled,
                PathBase = pathBase
            });
        }

        [HttpGet("db")]
        public async Task<IActionResult> CheckDatabaseConnection()
        {
            try
            {
                _logger.LogInformation("Checking database connection...");
                
                using var conn = await _dbService.CreateConnectionAsync();
                
                // 1. Check connection and stats
                using var cmd = new NpgsqlCommand("SELECT (SELECT COUNT(*) FROM users), (SELECT COUNT(*) FROM events)", conn);
                using var reader = await cmd.ExecuteReaderAsync();
                
                if (await reader.ReadAsync())
                {
                    var userCount = reader.GetInt64(0);
                    var eventCount = reader.GetInt64(1);
                    
                    return Ok(new 
                    { 
                        Status = "Healthy", 
                        Message = "Successfully connected to PostgreSQL.",
                        DatabaseName = conn.Database,
                        Stats = new 
                        {
                            Users = userCount,
                            Events = eventCount
                        }
                    });
                }
                
                return StatusCode(500, "Failed to retrieve stats.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Database connection check failed.");
                return StatusCode(500, new 
                { 
                    Status = "Critical Failure", 
                    Message = ex.Message, 
                    Details = ex.InnerException?.Message 
                });
            }
        }
    }
}
