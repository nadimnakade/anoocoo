using Anooco.API.Models;
using Microsoft.AspNetCore.Mvc;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        private readonly ILogger<ReportsController> _logger;
        private readonly Services.IReportIntakeService _intakeService;
        private readonly Services.DatabaseService _dbService;

        public ReportsController(ILogger<ReportsController> logger, Services.IReportIntakeService intakeService, Services.DatabaseService dbService)
        {
            _logger = logger;
            _intakeService = intakeService;
            _dbService = dbService;
        }

        [HttpPost]
        public async Task<IActionResult> SubmitReport([FromBody] CreateReportDto report)
        {
            _logger.LogInformation($"Received report: {report.RawText} at {report.Latitude}, {report.Longitude}");

            var reportId = await _intakeService.ProcessReportAsync(report);

            if (reportId == Guid.Empty)
            {
                _logger.LogError("Report processing failed for payload with text: {RawText}", report.RawText);
                return StatusCode(500, "Failed to process report");
            }

            return Ok(new { Message = "Report received", ReportId = reportId });
        }

        [HttpGet("recent")]
        public async Task<IActionResult> GetRecentReports()
        {
            using var conn = await _dbService.CreateConnectionAsync();
            using var cmd = new Npgsql.NpgsqlCommand(@"
                SELECT ""Id"", ""ReportType"", ""Description"", ""Location"", ""CreatedAt"", ""Image"" IS NOT NULL as HasImage
                FROM reports 
                ORDER BY ""CreatedAt"" DESC 
                LIMIT 20", conn);
            
            var reports = new List<ReportDto>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var loc = reader["Location"] as NetTopologySuite.Geometries.Point;
                reports.Add(new ReportDto
                {
                    Id = reader.GetGuid(0),
                    ReportType = reader.GetString(1),
                    RawText = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Latitude = loc?.Y ?? 0,
                    Longitude = loc?.X ?? 0,
                    CreatedAt = reader.GetDateTime(4),
                    HasImage = reader.GetBoolean(5)
                });
            }
            return Ok(reports);
        }

        [HttpGet("{id}/image")]
        public async Task<IActionResult> GetReportImage(Guid id)
        {
            using var conn = await _dbService.CreateConnectionAsync();
            using var cmd = new Npgsql.NpgsqlCommand(@"SELECT ""Image"" FROM reports WHERE ""Id"" = @id", conn);
            cmd.Parameters.AddWithValue("id", id);
            
            var result = await cmd.ExecuteScalarAsync();
            if (result == null || result == DBNull.Value)
            {
                return NotFound();
            }

            return File((byte[])result, "image/jpeg");
        }
    }
}
