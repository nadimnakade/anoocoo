using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text.Json.Serialization;
using Anooco.API.Services;
using Anooco.API.Middleware;
using Anooco.API.Hubs;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// --------------------
// Services
// --------------------

// Controllers + JSON
builder.Services.AddControllers()
    .AddJsonOptions(x =>
        x.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Anooco API",
        Version = "v1"
    });
});

// SignalR
builder.Services.AddSignalR();

// Database (ADO.NET)
builder.Services.AddSingleton<DatabaseService>();

// Domain Services
builder.Services.AddScoped<IReportIntakeService, ReportIntakeService>();
builder.Services.AddSingleton<IEncryptionService, EncryptionService>();
builder.Services.AddHttpClient<IGeocodingService, GeocodingService>();
builder.Services.AddHostedService<EventExpiryWorker>();

// --------------------
// CORS (All environments)
// --------------------
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetIsOriginAllowed(_ => true)
            .AllowCredentials());
});

var app = builder.Build();

// --------------------
// Middleware Pipeline
// --------------------

// Optional PathBase support for IIS virtual directories
var pathBase = builder.Configuration["PathBase"];
if (!string.IsNullOrEmpty(pathBase))
{
    app.UsePathBase(pathBase);
}

// Swagger enabled for all environments (production included)
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    // Use relative endpoint so Swagger works under IIS virtual directories
    c.SwaggerEndpoint("v1/swagger.json", "Anooco API v1");
    c.RoutePrefix = "swagger";
});

// Global CORS fallback for all responses and preflight
app.Use(async (ctx, next) =>
{
    var origin = ctx.Request.Headers["Origin"].ToString();
    if (!string.IsNullOrEmpty(origin))
    {
        ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
        ctx.Response.Headers["Access-Control-Allow-Credentials"] = "true";
        ctx.Response.Headers["Vary"] = "Origin";
        ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With";
        ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    }
    if (ctx.Request.Method == "OPTIONS")
    {
        ctx.Response.StatusCode = 204;
        return;
    }
    await next();
});

// Enable CORS for all environments
app.UseCors("AllowAll");

// Custom Encryption Middleware
app.UseMiddleware<EncryptionMiddleware>();

// app.UseHttpsRedirection(); // Enable when SSL is configured

app.UseAuthorization();

// --------------------builde
// Endpoints
// --------------------
app.MapControllers().RequireCors("AllowAll");
app.MapHub<AlertHub>("/hubs/alerts").RequireCors("AllowAll");



// Health Check
app.MapGet("/", () => "Anooco API is running!");

app.Run();
