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

        public HealthController(DatabaseService dbService, ILogger<HealthController> logger)
        {
            _dbService = dbService;
            _logger = logger;
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