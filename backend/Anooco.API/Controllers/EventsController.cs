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
                    events.Add(new
                    {
                        Id = reader["Id"],
                        EventType = reader["EventType"],
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
    }
}
