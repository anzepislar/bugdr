-- A2: the AI analysis' note about the bug (04, Add Problem). Admin only, never sent to users.
ALTER TABLE problems ADD COLUMN bug_summary TEXT NOT NULL DEFAULT '';
