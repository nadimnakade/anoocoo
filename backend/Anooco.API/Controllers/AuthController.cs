using Anooco.API.Services;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Anooco.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly DatabaseService _dbService;

        public AuthController(DatabaseService dbService)
        {
            _dbService = dbService;
        }

        [HttpPost("signup")]
        public async Task<IActionResult> Signup([FromBody] SignupDto dto)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();

                // 1. Check if email exists
                using (var checkCmd = new NpgsqlCommand("SELECT * FROM sp_get_user_by_email(@email)", conn))
                {
                    checkCmd.Parameters.AddWithValue("email", dto.Email);
                    using var reader = await checkCmd.ExecuteReaderAsync();
                    if (reader.HasRows) return BadRequest("Email already in use.");
                }

                // 2. Create User
                using (var cmd = new NpgsqlCommand("SELECT * FROM sp_create_user(@username, @email, @hash, @device, @trust)", conn))
                {
                    cmd.Parameters.AddWithValue("username", dto.Username);
                    cmd.Parameters.AddWithValue("email", dto.Email);
                    cmd.Parameters.AddWithValue("hash", dto.Password);
                    cmd.Parameters.AddWithValue("device", "WEB-CLIENT");
                    cmd.Parameters.AddWithValue("trust", 50);

                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        var id = reader.GetGuid(0);
                        var username = reader.GetString(1);
                        return Ok(new { Token = "dummy-jwt-token", UserId = id, Username = username });
                    }
                }
                
                return StatusCode(500, "Failed to create user");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            try
            {
                using var conn = await _dbService.CreateConnectionAsync();
                using var cmd = new NpgsqlCommand("SELECT * FROM sp_get_user_by_email(@email)", conn);
                cmd.Parameters.AddWithValue("email", dto.Email);

                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    // "Id", "Username", "Email", "PasswordHash", "TrustScore"
                    var id = reader.GetGuid(0);
                    var username = reader.GetString(1);
                    var hash = reader.GetString(3);
                    var trust = reader.GetInt32(5);

                    if (hash != dto.Password) return Unauthorized("Invalid credentials.");

                    return Ok(new { Token = "dummy-jwt-token", UserId = id, Username = username, TrustScore = trust });
                }

                return Unauthorized("Invalid credentials.");
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }

    public class SignupDto
    {
        public string Username { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }
    }

    public class LoginDto
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }
}
