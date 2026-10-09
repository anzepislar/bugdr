-- D48: the admin is not a user account; admin login lives in backend/.env (A1).
ALTER TABLE users DROP COLUMN is_admin;
