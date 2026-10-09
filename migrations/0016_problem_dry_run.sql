-- A4: the problem version (updated_at) whose checks all failed on the buggy code in the last dry-run (D20).
-- Valid only while it equals updated_at: any save of the draft or its code bumps updated_at and clears it implicitly.
ALTER TABLE problems ADD COLUMN dry_run_passed_for TIMESTAMP;
