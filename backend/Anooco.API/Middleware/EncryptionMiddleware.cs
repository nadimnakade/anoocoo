using System.Text;

namespace Anooco.API.Middleware
{
    public class EncryptionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly Services.IEncryptionService _encryptionService;
        private readonly bool _isEnabled;
        private readonly ILogger<EncryptionMiddleware> _logger;

        public EncryptionMiddleware(RequestDelegate next, Services.IEncryptionService encryptionService, IConfiguration config, ILogger<EncryptionMiddleware> logger)
        {
            _next = next;
            _encryptionService = encryptionService;
            _isEnabled = config.GetValue<bool>("Security:EnableEncryption");
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (!_isEnabled || IsIgnoredPath(context.Request.Path))
            {
                await _next(context);
                return;
            }

            // 1. Decrypt Request
            if (context.Request.ContentLength > 0 && (context.Request.Method == "POST" || context.Request.Method == "PUT"))
            {
                context.Request.EnableBuffering();
                using (var reader = new StreamReader(context.Request.Body, Encoding.UTF8, true, 1024, true))
                {
                    var encryptedBody = await reader.ReadToEndAsync();
                    if (!string.IsNullOrWhiteSpace(encryptedBody))
                    {
                        try 
                        {
                            // Assume body is just the Base64 string if encrypted
                            // Or it might be JSON: { "data": "..." } -> simpler to just send raw string for now
                            var decryptedBody = _encryptionService.Decrypt(encryptedBody.Trim('"')); // Handle JSON string if needed
                            
                            // Replace stream
                            var bytes = Encoding.UTF8.GetBytes(decryptedBody);
                            var stream = new MemoryStream(bytes);
                            context.Request.Body = stream;
                            context.Request.ContentLength = stream.Length;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Decryption failed");
                            context.Response.StatusCode = 400;
                            return;
                        }
                    }
                }
            }

            // 2. Capture Response
            var originalBodyStream = context.Response.Body;
            using (var responseBody = new MemoryStream())
            {
                context.Response.Body = responseBody;

                await _next(context);

                // 3. Encrypt Response
                if (context.Response.StatusCode >= 200 && context.Response.StatusCode < 300)
                {
                    context.Response.Body.Seek(0, SeekOrigin.Begin);
                    var plainText = await new StreamReader(context.Response.Body).ReadToEndAsync();
                    
                    var encryptedText = _encryptionService.Encrypt(plainText);
                    
                    // Wrap in quotes to be valid JSON string? Or object?
                    // Let's return raw string for simplicity or { "data": "..." }
                    // For now: Raw string wrapped in quotes to be valid JSON
                    var finalPayload = $"\"{encryptedText}\"";
                    
                    context.Response.Body = originalBodyStream;
                    context.Response.ContentLength = finalPayload.Length;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync(finalPayload);
                }
                else
                {
                    // Copy error responses as-is
                    context.Response.Body.Seek(0, SeekOrigin.Begin);
                    await responseBody.CopyToAsync(originalBodyStream);
                }
            }
        }

        private bool IsIgnoredPath(PathString path)
        {
            // Don't encrypt SignalR, Swagger, or health checks
            return path.StartsWithSegments("/hubs") || 
                   path.StartsWithSegments("/swagger") ||
                   path.Value == "/";
        }
    }
}