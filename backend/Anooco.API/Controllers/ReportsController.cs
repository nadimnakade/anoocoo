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

        public ReportsController(ILogger<ReportsController> logger, Services.IReportIntakeService intakeService)
        {
            _logger = logger;
            _intakeService = intakeService;
        }

        [HttpPost]
        public async Task<IActionResult> SubmitReport([FromBody] CreateReportDto report)
        {
            _logger.LogInformation($"Received report: {report.RawText} at {report.Latitude}, {report.Longitude}");

            var reportId = await _intakeService.ProcessReportAsync(report);

            return Ok(new { Message = "Report received", ReportId = reportId });
        }
    }
}
