-- Add independent administrator audit references. Keep all legacy user references intact.
BEGIN;
ALTER TABLE ai_directory_tools ADD COLUMN IF NOT EXISTS created_by_admin text REFERENCES admin_user(id) ON DELETE SET NULL;
ALTER TABLE ai_directory_tool_submissions ADD COLUMN IF NOT EXISTS reviewed_by_admin text REFERENCES admin_user(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tools_admin_creator_idx ON ai_directory_tools(created_by_admin);
CREATE INDEX IF NOT EXISTS submissions_admin_reviewer_idx ON ai_directory_tool_submissions(reviewed_by_admin);
COMMENT ON COLUMN ai_directory_tools.created_by_admin IS 'Independent backend administrator who published this tool';
COMMENT ON COLUMN ai_directory_tool_submissions.reviewed_by_admin IS 'Independent backend administrator who reviewed this submission';
COMMIT;
