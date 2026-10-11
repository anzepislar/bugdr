-- Inactivity reminder: when the "no activity on this path for 30 days" email went out. Sent again only after new
-- activity on the path, so one email per inactive stretch.
ALTER TABLE career_path_progress ADD COLUMN reminder_sent_at TIMESTAMP;
