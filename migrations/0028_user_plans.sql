-- X2: subscription plans (backend/src/modules/plans/plans.js). Set by the admin until payments exist.
ALTER TABLE users ADD COLUMN plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'own_key', 'max'));
