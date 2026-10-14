-- Waitlist: emails from the early access modal on /waitlist.
CREATE TABLE waitlist (
  id SERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
