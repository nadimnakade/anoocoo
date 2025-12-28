-- PostgreSQL Functions (Stored Procedures)

-- 1. Create User (Signup)
CREATE OR REPLACE FUNCTION sp_create_user(
    p_username text,
    p_email text,
    p_password_hash text,
    p_device_id text,
    p_trust_score integer
)
RETURNS TABLE (
    "Id" uuid,
    "Username" text,
    "Email" text
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    INSERT INTO users ("Id", "Username", "Email", "PasswordHash", "DeviceId", "TrustScore", "CreatedAt")
    VALUES (gen_random_uuid(), p_username, p_email, p_password_hash, p_device_id, p_trust_score, NOW())
    RETURNING users."Id" INTO v_user_id;

    RETURN QUERY SELECT u."Id", u."Username", u."Email" FROM users u WHERE u."Id" = v_user_id;
END;
$$;

-- 2. Get User by Email (Login)
CREATE OR REPLACE FUNCTION sp_get_user_by_email(p_email text)
RETURNS TABLE (
    "Id" uuid,
    "Username" text,
    "Email" text,
    "PasswordHash" text,
    "TrustScore" integer
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT u."Id", u."Username", u."Email", u."PasswordHash", u."TrustScore"
    FROM users u 
    WHERE u."Email" = p_email;
END;
$$;

-- 3. Get User Profile
CREATE OR REPLACE FUNCTION sp_get_user_profile(p_user_id uuid)
RETURNS TABLE (
    "Username" text,
    "Email" text,
    "PhoneNumber" text,
    "AvatarUrl" text,
    "TrustScore" integer,
    "MemberSince" timestamp with time zone
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT u."Username", u."Email", u."PhoneNumber", u."AvatarUrl", u."TrustScore", u."CreatedAt"
    FROM users u 
    WHERE u."Id" = p_user_id;
END;
$$;

-- 4. Create Report
CREATE OR REPLACE FUNCTION sp_create_report(
    p_user_id uuid,
    p_report_type text,
    p_description text,
    p_location geometry,
    p_heading double precision,
    p_speed double precision,
    p_confidence_score double precision
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_report_id uuid;
BEGIN
    INSERT INTO reports (
        "Id", "UserId", "ReportType", "Description", "Location", 
        "Heading", "Speed", "ConfidenceScore", "Processed", "CreatedAt"
    )
    VALUES (
        gen_random_uuid(), p_user_id, p_report_type, p_description, p_location, 
        p_heading, p_speed, p_confidence_score, false, NOW()
    )
    RETURNING reports."Id" INTO v_report_id;
    
    RETURN v_report_id;
END;
$$;

-- 5. Get Active Events
CREATE OR REPLACE FUNCTION sp_get_active_events()
RETURNS TABLE (
    "Id" uuid,
    "EventType" text,
    "Location" geometry,
    "ConfirmationsCount" integer,
    "UpdatedAt" timestamp with time zone
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT e."Id", e."EventType", e."Location", e."ConfirmationsCount", e."UpdatedAt"
    FROM events e 
    WHERE e."Status" = 'ACTIVE';
END;
$$;

-- 6. Get User Activity
CREATE OR REPLACE FUNCTION sp_get_user_activity(p_user_id uuid)
RETURNS TABLE (
    "Id" uuid,
    "ReportType" text,
    "Description" text,
    "Timestamp" timestamp with time zone,
    "Status" text,
    "ConfidenceScore" double precision
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        r."Id", 
        r."ReportType", 
        r."Description", 
        r."CreatedAt", 
        CASE WHEN r."Processed" THEN 'Verified' ELSE 'Pending' END,
        r."ConfidenceScore"
    FROM reports r
    WHERE r."UserId" = p_user_id
    ORDER BY r."CreatedAt" DESC;
END;
$$;

-- 7. Process Report Intelligence
CREATE OR REPLACE FUNCTION sp_process_report_intelligence(p_report_id uuid)
RETURNS TABLE (
    "Action" text,
    "Id" uuid,
    "EventType" text,
    "Location" geometry,
    "ConfirmationsCount" integer,
    "UpdatedAt" timestamp with time zone
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_report RECORD;
    v_event_id uuid;
    v_cluster_radius float := 50.0;
BEGIN
    SELECT * INTO v_report FROM reports r WHERE r."Id" = p_report_id;
    
    -- Find nearby active event
    SELECT e."Id" INTO v_event_id
    FROM events e
    WHERE e."Status" = 'ACTIVE'
    AND e."EventType" = v_report."ReportType"
    AND ST_DWithin(e."Location"::geography, v_report."Location"::geography, v_cluster_radius)
    ORDER BY ST_Distance(e."Location"::geography, v_report."Location"::geography) ASC
    LIMIT 1;

    IF v_event_id IS NOT NULL THEN
        -- Update existing
        UPDATE events e
        SET "ConfirmationsCount" = e."ConfirmationsCount" + 1,
            "UpdatedAt" = NOW(),
            "ValidUntil" = NOW() + INTERVAL '30 minutes'
        WHERE e."Id" = v_event_id;
        
        RETURN QUERY SELECT 'UPDATED'::text, e."Id", e."EventType", e."Location", e."ConfirmationsCount", e."UpdatedAt" FROM events e WHERE e."Id" = v_event_id;
    ELSE
        -- Create new
        INSERT INTO events (
            "Id", "EventType", "Status", "Location", "ClusterRadius", 
            "ConfirmationsCount", "AggregateConfidence", "CreatedAt", "UpdatedAt", "ValidUntil"
        )
        VALUES (
            gen_random_uuid(), v_report."ReportType", 'ACTIVE', v_report."Location", 50,
            1, 0.5, NOW(), NOW(), NOW() + INTERVAL '30 minutes'
        )
        RETURNING events."Id" INTO v_event_id;
        
        RETURN QUERY SELECT 'CREATED'::text, e."Id", e."EventType", e."Location", e."ConfirmationsCount", e."UpdatedAt" FROM events e WHERE e."Id" = v_event_id;
    END IF;
END;
$$;
