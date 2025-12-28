using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers().AddJsonOptions(x =>
   x.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

// Database (ADO.NET)
builder.Services.AddSingleton<Anooco.API.Services.DatabaseService>();

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        builder => builder
            .AllowAnyMethod()
            .AllowAnyHeader()
            .SetIsOriginAllowed((host) => true)
            .AllowCredentials());
});

// Domain Services
builder.Services.AddScoped<Anooco.API.Services.IReportIntakeService, Anooco.API.Services.ReportIntakeService>();
builder.Services.AddSingleton<Anooco.API.Services.IEncryptionService, Anooco.API.Services.EncryptionService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
// Enable Swagger for ALL environments
app.UseSwagger();
app.UseSwaggerUI();

// CORS - Must be before UseAuthorization and UseHttpsRedirection (if used)
app.UseCors("AllowAll");

// Encryption Middleware (after CORS, before Controllers)
app.UseMiddleware<Anooco.API.Middleware.EncryptionMiddleware>();

// app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.MapHub<Anooco.API.Hubs.AlertHub>("/hubs/alerts");

// Health check
app.MapGet("/", () => "Anooco API is running!");

app.Run();
