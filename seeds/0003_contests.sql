-- Dev contests (T1) until admins create them (A6): two live, one upcoming, two ended. Fixed ids, so a re-run only moves
-- the dates relative to now. The live weekly uses payment-retries-disappear, the only runnable problem, so "Enter contest"
-- works end to end - while it runs, the problem is off /problems (D17).
INSERT INTO contests (id, type, title, description, starts_at, ends_at, reward_type, reward_description)
SELECT v.id::uuid, v.type, v.title, v.description, h.now + v.starts::interval, h.now + v.ends::interval, v.reward_type, v.reward
FROM (SELECT date_trunc('hour', now()::timestamp) AS now) h, (VALUES
  ('c0000000-0000-4000-8000-000000000001', 'weekly', 'The checkout breakdown', 'Payments succeed. Orders never arrive.',
    '-2 days', '5 days', 'merch', 'Bugdr hoodie for the winner'),
  ('c0000000-0000-4000-8000-000000000002', 'monthly', 'The midnight incident', 'Revoked sessions keep running jobs against production.',
    '-4 days', '26 days', 'subscription', '1 year free subscription for the winner'),
  ('c0000000-0000-4000-8000-000000000003', 'daily', 'Tomorrow''s incident', 'A new production bug, revealed when the contest starts.',
    '1 day', '2 days', NULL, NULL),
  ('c0000000-0000-4000-8000-000000000004', 'weekly', 'The query that keeps growing', 'A healthy endpoint gets slower every week.',
    '-15 days', '-8 days', NULL, NULL),
  ('c0000000-0000-4000-8000-000000000005', 'daily', 'Frozen prices', 'Traders stare at a chart that stopped moving.',
    '-10 days', '-9 days', NULL, NULL)
) AS v(id, type, title, description, starts, ends, reward_type, reward)
ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at;

INSERT INTO contest_problems (contest_id, problem_id)
SELECT v.contest_id::uuid, p.id
FROM (VALUES
  ('c0000000-0000-4000-8000-000000000001', 'payment-retries-disappear'),
  ('c0000000-0000-4000-8000-000000000002', 'session-refuses-to-expire'),
  ('c0000000-0000-4000-8000-000000000003', 'stale-search-results'),
  ('c0000000-0000-4000-8000-000000000004', 'query-slower-every-day'),
  ('c0000000-0000-4000-8000-000000000005', 'chart-frozen-in-time')
) AS v(contest_id, slug)
JOIN problems p ON p.slug = v.slug
ON CONFLICT (contest_id, problem_id) DO NOTHING;
