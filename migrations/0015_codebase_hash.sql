-- A10: duplicate check - SHA-256 of an uploaded codebase's unpacked files (path + content). NULL for seeded problems.
ALTER TABLE problem_codebase ADD COLUMN content_hash CHAR(64) UNIQUE;
