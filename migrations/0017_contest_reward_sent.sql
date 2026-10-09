-- A7: the admin marks the winner's reward as sent (04 "Reward flow"). NULL = not sent.
ALTER TABLE contests ADD COLUMN reward_sent_at TIMESTAMP;
