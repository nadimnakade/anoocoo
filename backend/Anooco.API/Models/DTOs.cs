namespace Anooco.API.Models
{
    public class CreateReportDto
    {
        public string RawText { get; set; } = string.Empty; // "Pothole here"
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double? Heading { get; set; }
        public double? Speed { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class EventDto
    {
        public Guid Id { get; set; }
        public string EventType { get; set; } = string.Empty;
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string Status { get; set; } = string.Empty;
        public double ConfidenceScore { get; set; }
        public string? VoiceAnnouncement { get; set; } // "Accident ahead, 500 meters"
    }
}
