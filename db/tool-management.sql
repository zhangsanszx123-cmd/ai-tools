-- Non-destructive tool deletion; keep original submissions and their foreign keys intact.
BEGIN;
ALTER TABLE ai_directory_tools ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN ai_directory_tools.deleted_at IS 'Soft deletion timestamp; exclude from public and management lists, preserve audit history and slug uniqueness';
COMMIT;
