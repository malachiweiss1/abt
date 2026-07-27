export type GameStatus = 'waiting' | 'question_active' | 'answer_revealed' | 'leaderboard' | 'finished';

export interface Game {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  current_question_id: string | null;
  question_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  game_id: string;
  question_order: number;
  question_text: string;
  question_type: 'multiple_choice' | 'free_text_greeting';
  options: string[];
  correct_answer: string;
  time_limit_seconds: number;
  created_at: string;
}

export interface Player {
  id: string;
  game_id: string;
  display_name: string;
  total_score: number;
  joined_at: string;
  last_seen_at: string;
}

export interface Answer {
  id: string;
  game_id: string;
  question_id: string;
  player_id: string;
  answer_value: string;
  is_correct: boolean;
  response_time_ms: number;
  base_score: number;
  speed_bonus: number;
  total_score: number;
  submitted_at: string;
}
