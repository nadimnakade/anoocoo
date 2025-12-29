using Anooco.API.Models;
using Anooco.API.Services;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public UserController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpPost("update")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand("SELECT sp_update_user_profile(@userId, @username, @phone, @avatar)", conn);
                cmd.Parameters.AddWithValue("userId", dto.UserId);
                cmd.Parameters.AddWithValue("username", (object)dto.Username ?? DBNull.Value);
                cmd.Parameters.AddWithValue("phone", (object)dto.PhoneNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("avatar", (object)dto.AvatarUrl ?? DBNull.Value);

                var result = (bool?)await cmd.ExecuteScalarAsync();
                
                if (result == true)
                {
                    return Ok(new { Message = "Profile updated successfully" });
                }
                return NotFound("User not found");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpGet("profile")]
        public async Task<IActionResult> GetProfile([FromQuery] Guid userId)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand("SELECT * FROM sp_get_user_profile(@userId)", conn);
                cmd.Parameters.AddWithValue("userId", userId);

                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    return Ok(new
                    {
                        Username = reader["Username"],
                        Email = reader["Email"],
                        PhoneNumber = reader["PhoneNumber"] != DBNull.Value ? reader["PhoneNumber"] : null,
                        AvatarUrl = reader["AvatarUrl"] != DBNull.Value ? reader["AvatarUrl"] : null,
                        TrustScore = reader["TrustScore"],
                        MemberSince = reader["MemberSince"]
                    });
                }

                return NotFound("User not found");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpGet("activity")]
        public async Task<IActionResult> GetActivity([FromQuery] Guid userId)
        {
            var reports = new List<object>();
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand("SELECT * FROM sp_get_user_activity(@userId)", conn);
                cmd.Parameters.AddWithValue("userId", userId);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    reports.Add(new
                    {
                        Id = reader["Id"],
                        ReportType = reader["ReportType"],
                        Description = reader["Description"],
                        Timestamp = reader["Timestamp"],
                        Status = reader["Status"],
                        ConfidenceScore = reader["ConfidenceScore"]
                    });
                }

                return Ok(reports);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }
}
