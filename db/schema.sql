-- Run against the database selected by DATABASE_URL before starting the app.
-- This creates a new directory table; it does not migrate an existing table.
CREATE TABLE IF NOT EXISTS ai_directory_tools (
  slug text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  website text NOT NULL,
  summary text NOT NULL,
  content text NOT NULL,
  logo_key text,
  logo_data bytea,
  logo_type text,
  cover_data bytea,
  cover_type text,
  featured_order integer,
  status text NOT NULL DEFAULT 'pending',
  "userId" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
