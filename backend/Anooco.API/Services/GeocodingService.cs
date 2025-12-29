using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Anooco.API.Services
{
    public interface IGeocodingService
    {
        Task<string?> GetAddressAsync(double latitude, double longitude);
    }

    public class GeocodingService : IGeocodingService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<GeocodingService> _logger;

        public GeocodingService(HttpClient httpClient, ILogger<GeocodingService> logger)
        {
            _httpClient = httpClient;
            _logger = logger;
            
            // Nominatim requires a User-Agent identifying the application
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("AnoocoApp/1.0");
        }

        public async Task<string?> GetAddressAsync(double latitude, double longitude)
        {
            try
            {
                // Nominatim API: Free usage limits apply (1 req/sec)
                var url = $"https://nominatim.openstreetmap.org/reverse?format=json&lat={latitude}&lon={longitude}&zoom=18&addressdetails=1";
                
                var response = await _httpClient.GetFromJsonAsync<NominatimResponse>(url);
                
                return response?.DisplayName;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Geocoding failed for {lat}, {lon}", latitude, longitude);
                return null;
            }
        }
    }

    public class NominatimResponse
    {
        [JsonPropertyName("display_name")]
        public string? DisplayName { get; set; }
        
        [JsonPropertyName("address")]
        public NominatimAddress? Address { get; set; }
    }

    public class NominatimAddress
    {
        [JsonPropertyName("road")]
        public string? Road { get; set; }
        
        [JsonPropertyName("suburb")]
        public string? Suburb { get; set; }
        
        [JsonPropertyName("city")]
        public string? City { get; set; }
    }
}
