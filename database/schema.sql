-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Users & Trust
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50), -- Optional, anonymous by default
    device_id VARCHAR(255) NOT NULL UNIQUE,
    trust_score INT DEFAULT 50, -- 0 to 100
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE trust_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action_type VARCHAR(50), -- 'REPORT_CONFIRMED', 'REPORT_REJECTED', 'FALSE_ALARM'
    score_change INT,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Reports (Raw Intake)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    report_type VARCHAR(50) NOT NULL, -- 'ACCIDENT', 'POTHOLE', 'POLICE', 'TRAFFIC', 'PARKING', 'LIFT'
    raw_text TEXT, -- "Pothole here"
    location GEOMETRY(Point, 4326) NOT NULL,
    heading FLOAT, -- Direction of travel (0-360)
    speed FLOAT, -- m/s
    confidence_score FLOAT DEFAULT 0.0, -- Calculated based on user trust
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Events (Clustered & Validated Intelligence)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'CLEARED'
    location GEOMETRY(Point, 4326) NOT NULL,
    cluster_radius INT DEFAULT 50, -- meters
    direction_heading FLOAT, -- Relevant for traffic/police
    valid_until TIMESTAMP WITH TIME ZONE,
    confirmations_count INT DEFAULT 1,
    rejections_count INT DEFAULT 0,
    aggregate_confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_location ON events USING GIST (location);
CREATE INDEX idx_events_status ON events (status);

-- 4. Event Confirmations (User Feedback)
CREATE TABLE event_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id),
    user_id UUID REFERENCES users(id),
    is_positive BOOLEAN NOT NULL, -- TRUE = Still there, FALSE = Cleared
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, user_id) -- One vote per event per user
);

-- 5. Parking Exchange
CREATE TABLE parking_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    location GEOMETRY(Point, 4326) NOT NULL,
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'TAKEN', 'EXPIRED'
    size_type VARCHAR(20), -- 'COMPACT', 'NORMAL', 'LARGE'
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_parking_location ON parking_listings USING GIST (location);

-- 6. Carpooling
CREATE TABLE carpool_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES users(id),
    origin GEOMETRY(Point, 4326) NOT NULL,
    destination GEOMETRY(Point, 4326) NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    seats_available INT DEFAULT 3,
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_carpool_origin ON carpool_trips USING GIST (origin);
CREATE INDEX idx_carpool_dest ON carpool_trips USING GIST (destination);

-- Function to cleanup expired events (soft expire)
CREATE OR REPLACE FUNCTION expire_stale_events() RETURNS void AS $$
BEGIN
    UPDATE events 
    SET status = 'EXPIRED' 
    WHERE status = 'ACTIVE' AND valid_until < NOW();
END;
$$ LANGUAGE plpgsql;
