-- Enable PostGIS extension for spatial support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users Table
CREATE TABLE IF NOT EXISTS "Users" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Username" TEXT NOT NULL,
    "Email" TEXT NOT NULL UNIQUE,
    "PasswordHash" TEXT NOT NULL,
    "PhoneNumber" TEXT,
    "AvatarUrl" TEXT,
    "TrustScore" INTEGER DEFAULT 100,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reports Table (Raw input from users)
CREATE TABLE IF NOT EXISTS "Reports" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "UserId" UUID REFERENCES "Users"("Id"),
    "RawText" TEXT NOT NULL,
    "ReportType" TEXT NOT NULL, -- 'HAZARD', 'ACCIDENT', 'TRAFFIC', etc.
    "Location" geometry(Point, 4326) NOT NULL, -- Spatial Column
    "Heading" DOUBLE PRECISION,
    "Speed" DOUBLE PRECISION,
    "Processed" BOOLEAN DEFAULT FALSE,
    "ConfidenceScore" DOUBLE PRECISION DEFAULT 0.0,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Events Table (Confirmed/Clustered incidents)
CREATE TABLE IF NOT EXISTS "Events" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EventType" TEXT NOT NULL,
    "Status" TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'RESOLVED', 'EXPIRED'
    "Location" geometry(Point, 4326) NOT NULL,
    "ClusterRadius" DOUBLE PRECISION DEFAULT 50.0,
    "DirectionHeading" DOUBLE PRECISION,
    "ValidUntil" TIMESTAMP WITH TIME ZONE,
    "ConfirmationsCount" INTEGER DEFAULT 1,
    "AggregateConfidence" DOUBLE PRECISION DEFAULT 0.5,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "IX_Reports_Location" ON "Reports" USING GIST ("Location");
CREATE INDEX IF NOT EXISTS "IX_Events_Location" ON "Events" USING GIST ("Location");
