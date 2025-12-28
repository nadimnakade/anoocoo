-- Update Users table to support new profile features
ALTER TABLE "Users" ADD COLUMN "PhoneNumber" text;
ALTER TABLE "Users" ADD COLUMN "AvatarUrl" text;

-- Optional: Create some dummy history if needed for testing
-- INSERT INTO "Reports" ...
