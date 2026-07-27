-- Seed data for Birthday Quiz MVP
-- Run this after the schema migration

-- Insert the game
INSERT INTO games (id, code, title, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'AVIYA28',
  'כמה אתם מכירים את אביה?',
  'waiting'
)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  status = 'waiting',
  current_question_id = NULL,
  question_started_at = NULL,
  updated_at = NOW();

-- Insert Question 1
INSERT INTO questions (id, game_id, question_order, question_text, question_type, options, correct_answer, time_limit_seconds)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  1,
  'בת כמה אביה?',
  'multiple_choice',
  '["26", "27", "28", "29"]',
  '28',
  15
)
ON CONFLICT DO NOTHING;

-- Insert Question 2
INSERT INTO questions (id, game_id, question_order, question_text, question_type, options, correct_answer, time_limit_seconds)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  2,
  'איפה אביה גרה?',
  'multiple_choice',
  '["תל אביב", "ירושלים", "באר שבע", "חיפה"]',
  'באר שבע',
  15
)
ON CONFLICT DO NOTHING;
