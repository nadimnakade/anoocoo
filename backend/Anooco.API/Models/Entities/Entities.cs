using System.ComponentModel.DataAnnotations.Schema;
using NetTopologySuite.Geometries;

namespace Anooco.API.Models.Entities
{
    [Table("users")]
    public class User
    {
        public Guid Id { get; set; }
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? PhoneNumber { get; set; }
        public string? AvatarUrl { get; set; }
        public string? PasswordHash { get; set; }
        public string DeviceId { get; set; } = string.Empty;
        public int TrustScore { get; set; } = 50;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastActiveAt { get; set; }
    }

    [Table("reports")]
    public class Report
    {
        public Guid Id { get; set; }
        public Guid? UserId { get; set; }
        public string ReportType { get; set; } = string.Empty; // ACCIDENT, POTHOLE, etc.
        public string? RawText { get; set; }
        
        [Column(TypeName = "geometry(Point, 4326)")]
        public Point Location { get; set; } = null!;
        
        public double? Heading { get; set; }
        public double? Speed { get; set; }
        public double ConfidenceScore { get; set; }
        public bool Processed { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    [Table("events")]
    public class Event
    {
        public Guid Id { get; set; }
        public string EventType { get; set; } = string.Empty;
        public string Status { get; set; } = "ACTIVE";
        public string? Address { get; set; }
        
        [Column(TypeName = "geometry(Point, 4326)")]
        public Point Location { get; set; } = null!;
        
        public int ClusterRadius { get; set; } = 50;
        public double? DirectionHeading { get; set; }
        public DateTime? ValidUntil { get; set; }
        public int ConfirmationsCount { get; set; } = 1;
        public int RejectionsCount { get; set; }
        public double AggregateConfidence { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
