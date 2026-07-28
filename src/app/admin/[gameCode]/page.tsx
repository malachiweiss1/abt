'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Game, Question, Player, Answer } from '@/types';

interface PageProps {
  params: Promise<{ gameCode: string }>;
}

export default function AdminScreen({ params }: PageProps) {
  const { gameCode } = use(params);
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('code', gameCode)
      .single();

    if (!gameData) return;
    setGame(gameData);

    const { data: questionsData } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameData.id)
      .order('question_order');
    setAllQuestions(questionsData || []);

    if (gameData.current_question_id) {
      const q = questionsData?.find(q => q.id === gameData.current_question_id);
      setCurrentQuestion(q || null);

      const { data: answersData } = await supabase
        .from('answers')
        .select('*')
        .eq('question_id', gameData.current_question_id);
      setAnswers(answersData || []);
    } else {
      setCurrentQuestion(null);
      setAnswers([]);
    }

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameData.id)
      .order('total_score', { ascending: false });
    setPlayers(playersData || []);
  }, [gameCode, supabase]);

  useEffect(() => {
    if (!authenticated) return;
    loadData();

    const channel = supabase
      .channel(`admin-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${gameCode}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, loadData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authenticated, gameCode, loadData, supabase]);

  const doAction = async (action: string) => {
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword,
      },
      body: JSON.stringify({ action, gameCode }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || 'שגיאה');
    } else {
      setMessage('');
    }
  };

  const handleLogin = async () => {
    setAuthError('');
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': passwordInput,
      },
      body: JSON.stringify({ action: 'start_game', gameCode }),
    });
    if (res.status === 401) {
      setAuthError('סיסמה שגויה');
      return;
    }
    setAdminPassword(passwordInput);
    setAuthenticated(true);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 w-full max-w-sm text-center space-y-6">
          <div className="text-4xl">🔐</div>
          <h1 className="text-2xl font-bold text-white">כניסת מנחה</h1>
          {authError && <p className="text-red-300">{authError}</p>}
          <input
            type="password"
            placeholder="סיסמת מנחה"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg text-center border border-white/30 focus:outline-none focus:border-white"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl text-xl"
          >
            כניסה
          </button>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    waiting: 'ממתין',
    question_active: 'שאלה פעילה',
    answer_revealed: 'תשובה נחשפה',
    leaderboard: 'טבלת מובילים',
    finished: 'הסתיים',
  };

  const currentQuestionIndex = allQuestions.findIndex(q => q.id === game?.current_question_id);
  const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;

  return (
    <div className="min-h-screen p-4" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">🎛️ לוח בקרה - {gameCode}</h1>
          <p className="text-pink-200">
            סטטוס: <span className="font-bold text-yellow-300">{statusLabels[game?.status || 'waiting']}</span>
          </p>
        </div>

        {message && (
          <div className="bg-red-500/30 text-red-200 rounded-xl p-3 text-center">{message}</div>
        )}

        {/* Control Buttons */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-3">
          <h2 className="text-white font-bold text-lg">פקדי משחק</h2>

          {game?.status === 'waiting' && (
            <button onClick={() => doAction('start_question')} disabled={loading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              הצג שאלה
            </button>
          )}

          {game?.status === 'question_active' && (
            <button onClick={() => doAction('reveal_answer')} disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              חשוף תשובה
            </button>
          )}

          {game?.status === 'answer_revealed' && (
            <button onClick={() => doAction('show_leaderboard')} disabled={loading}
              className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              הצג דירוג
            </button>
          )}

          {game?.status === 'leaderboard' && (
            <button
              onClick={() => doAction(isLastQuestion ? 'finish_game' : 'next_question')}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
            >
              {isLastQuestion ? 'סיים משחק' : 'לשאלה הבאה'}
            </button>
          )}

          <button onClick={() => doAction('reset_game')} disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
            אפס משחק
          </button>

          <button
            onClick={() => {
              if (confirm('למחוק את כל השחקנים? כולם יצטרכו להירשם מחדש.')) {
                doAction('reset_players');
              }
            }}
            disabled={loading}
            className="w-full bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
          >
            אפס שחקנים (כניסה מחדש)
          </button>
        </div>

        {/* Current Question */}
        {currentQuestion && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <h2 className="text-white font-bold text-lg mb-2">שאלה נוכחית ({currentQuestion.question_order}/{allQuestions.length})</h2>
            <p className="text-white text-xl" dir="rtl">
              {currentQuestion.question_type === 'free_text_greeting' ? 'כתבו ברכה לאביה!' : currentQuestion.question_text}
            </p>
            <p className="text-green-300 mt-2">תשובה נכונה: {currentQuestion.correct_answer}</p>
            <p className="text-pink-200 mt-2">{answers.length}/{players.length} ענו</p>
          </div>
        )}

        {/* Answers */}
        {answers.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <h2 className="text-white font-bold text-lg mb-2">תשובות שחקנים</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {answers.map(a => {
                const playerName = players.find(p => p.id === a.player_id)?.display_name || '?';
                return (
                  <div key={a.id} className={`flex justify-between rounded-lg px-3 py-2 ${a.is_correct ? 'bg-green-500/30' : 'bg-red-500/30'}`}>
                    <span className="text-white">{playerName}</span>
                    <span className={a.is_correct ? 'text-green-300' : 'text-red-300'}>{a.answer_value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Players / Scores */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
          <h2 className="text-white font-bold text-lg mb-2">שחקנים ({players.length})</h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {players.map((p, i) => (
              <div key={p.id} className="flex justify-between text-white bg-white/10 rounded-lg px-3 py-2">
                <span>{i + 1}. {p.display_name}</span>
                <span className="font-bold text-yellow-300">{p.total_score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
