-- Problem text split in two (02_problems.md): what the system does + what production shows. No "expected behavior".
-- Existing rows keep their old text as context; `npm run seed` refreshes the dev problems.
ALTER TABLE problems ADD COLUMN codebase_context TEXT, ADD COLUMN incident_report TEXT;
UPDATE problems SET codebase_context = description, incident_report = '';
ALTER TABLE problems
  ALTER COLUMN codebase_context SET NOT NULL,
  ALTER COLUMN incident_report SET NOT NULL,
  DROP COLUMN description;
