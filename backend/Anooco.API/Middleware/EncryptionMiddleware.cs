using System.Text;

namespace Anooco.API.Middleware
{
    public class EncryptionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly Services.IEncryptionService _encryptionService;
        private readonly bool _isEnabled;
        private readonly ILogger<EncryptionMiddleware> _logger;

        public EncryptionMiddleware(
            RequestDelegate next,
            Services.IEncryptionService encryptionService,
            IConfiguration config,
            ILogger<EncryptionMiddleware> logger)
        {
            _next = next;
            _encryptionService = encryptionService;
            _isEnabled = config.GetValue<bool>("Security:EnableEncryption");
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // ✅ 1. Allow CORS preflight
            if (context.Request.Method == HttpMethods.Options)
            {
                await _next(context);
                return;
            }

            // ✅ 2. Skip encryption if disabled or ignored path
            if (!_isEnabled || IsIgnoredPath(context.Request.Path))
            {
                await _next(context);
                return;
            }

            // ------------------------
            // Decrypt Request
            // ------------------------
            if (context.Request.ContentLength > 0 &&
                (context.Request.Method == HttpMethods.Post ||
                 context.Request.Method == HttpMethods.Put))
            {
                context.Request.EnableBuffering();

                using var reader = new StreamReader(
                    context.Request.Body,
                    Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: false,
                    leaveOpen: true);

                var encryptedBody = await reader.ReadToEndAsync();
                context.Request.Body.Position = 0;

                if (!string.IsNullOrWhiteSpace(encryptedBody))
                {
                    try
                    {
                        var decryptedBody = _encryptionService.Decrypt(encryptedBody.Trim('"'));
                        var bytes = Encoding.UTF8.GetBytes(decryptedBody);
                        context.Request.Body = new MemoryStream(bytes);
                        context.Request.ContentLength = bytes.Length;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Decryption failed");
                        context.Response.StatusCode = StatusCodes.Status400BadRequest;
                        return;
                    }
                }
            }

            // ------------------------
            // Capture & Encrypt Response
            // ------------------------
            var originalBody = context.Response.Body;

            using var responseBody = new MemoryStream();
            context.Response.Body = responseBody;

            await _next(context);

            // Only encrypt successful API responses
            if (context.Response.StatusCode >= 200 &&
                context.Response.StatusCode < 300)
            {
                context.Response.Body.Seek(0, SeekOrigin.Begin);
                var plainText = await new StreamReader(context.Response.Body).ReadToEndAsync();

                var encryptedText = _encryptionService.Encrypt(plainText);
                var payload = $"\"{encryptedText}\"";

                context.Response.Body = originalBody;
                context.Response.ContentType = "application/json";
                context.Response.ContentLength = Encoding.UTF8.GetByteCount(payload);

                await context.Response.WriteAsync(payload);
            }
            else
            {
                context.Response.Body.Seek(0, SeekOrigin.Begin);
                await responseBody.CopyToAsync(originalBody);
            }
        }

        private bool IsIgnoredPath(PathString path)
        {
            var p = path.Value?.ToLower() ?? "";

            return p.Contains("/swagger") ||
                   p.Contains("/hubs") ||
                   p == "/" ||
                   p.Contains("/health");
        }
    }
}
