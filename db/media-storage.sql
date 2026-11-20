-- Add URL storage without removing legacy bytes before export/verification.
BEGIN;
ALTER TABLE ai_directory_tools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE ai_directory_tools ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE ai_directory_tool_submissions ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE ai_directory_tool_submissions ADD COLUMN IF NOT EXISTS cover_url text;
CREATE TABLE IF NOT EXISTS ai_directory_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_admin text REFERENCES admin_user(id) ON DELETE SET NULL
);
INSERT INTO ai_directory_settings(key,value) VALUES ('media_base_url','/') ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ai_directory_tools'::regclass AND conname='tools_media_urls') THEN
    ALTER TABLE ai_directory_tools ADD CONSTRAINT tools_media_urls CHECK (
      (logo_url IS NULL OR logo_url ~ '^/media/[a-f0-9]{64}\.webp$') AND
      (cover_url IS NULL OR cover_url ~ '^/media/[a-f0-9]{64}\.webp$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ai_directory_tool_submissions'::regclass AND conname='submissions_media_urls') THEN
    ALTER TABLE ai_directory_tool_submissions ADD CONSTRAINT submissions_media_urls CHECK (
      (logo_url IS NULL OR logo_url ~ '^/private-media/[a-f0-9]{64}\.webp$') AND
      (cover_url IS NULL OR cover_url ~ '^/private-media/[a-f0-9]{64}\.webp$'));
  END IF;
END $$;
COMMIT;
