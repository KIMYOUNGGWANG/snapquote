-- Fix feedback.metadata to allow NULL values
-- This allows the column to be optional while still supporting JSONB when provided

alter table feedback
  alter column metadata drop not null;

-- Update existing constraint to handle NULL gracefully
alter table feedback
  drop constraint if exists feedback_metadata_size_check;

alter table feedback
  add constraint feedback_metadata_size_check
  check (metadata is null or pg_column_size(metadata) <= 8192);
