-- Bulk import (X9): a confirmed problem is saved as a draft, its checks run in Docker in the background and it is
-- published on a pass. NULL = not a bulk import; import_check_error says why a failed run did not publish.
ALTER TABLE problems
  ADD COLUMN import_check_status TEXT CHECK (import_check_status IN ('pending', 'passed', 'failed')),
  ADD COLUMN import_check_error TEXT;
