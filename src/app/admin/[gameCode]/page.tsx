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
  const [drawingScore, setDrawingScore] = useState<number | null>(null);

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
        .eq('question_id', gameData.current_question_id)
        .order('submitted_at');
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

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword,
        },
        body: JSON.stringify({ action, gameCode, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'שגיאה');
      } else {
        setMessage('');
        await loadData();
      }
    } catch {
      setMessage('שגיאת רשת — נסה שוב');
    } finally {
      setLoading(false);
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
      body: JSON.stringify({ action: 'ping', gameCode }),
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
  const isGreetingQuestion = currentQuestion?.question_type === 'free_text_greeting';
  const isDrawingQuestion = currentQuestion?.question_type === 'drawing_contest';
  const greetingIndex = game?.greeting_index ?? -1;

  // Parse greeting answers for the controller list
  const greetingAnswers = isGreetingQuestion
    ? answers.map(a => {
        let text = a.answer_value;
        const playerName = players.find(p => p.id === a.player_id)?.display_name ?? '?';
        try {
          const parsed = JSON.parse(a.answer_value);
          if (parsed?.text) text = parsed.text;
        } catch { /* plain text */ }
        return { id: a.id, playerName, text };
      })
    : [];

  // Drawing contest computed vars
  const drawingAnswers = isDrawingQuestion
    ? answers.map(a => ({
        id: a.id,
        playerId: a.player_id,
        playerName: players.find(p => p.id === a.player_id)?.display_name ?? '?',
        imageUrl: a.answer_value,
        scored: (a.base_score ?? 0) > 0,
        scoreValue: Math.round((a.base_score ?? 0) / 100),
      }))
    : [];

  const currentDrawing = greetingIndex >= 0 ? (drawingAnswers[greetingIndex] ?? null) : null;
  const allDrawingsScored = drawingAnswers.length > 0 && drawingAnswers.every(d => d.scored);

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

          {game?.status === 'answer_revealed' && !isGreetingQuestion && !isDrawingQuestion && (
            <button onClick={() => doAction('show_leaderboard')} disabled={loading}
              className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              הצג דירוג
            </button>
          )}

          {game?.status === 'answer_revealed' && isGreetingQuestion && (
            <button onClick={() => doAction('show_leaderboard')} disabled={loading}
              className="w-full bg-purple-500/60 hover:bg-purple-600/60 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
              סיים ברכות → הצג דירוג
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

        {/* Drawing Controller */}
        {isDrawingQuestion && game?.status === 'answer_revealed' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">🎨 ניקוד ציורים</h2>
              <span className="text-yellow-300 font-bold text-lg">
                {greetingIndex < 0 ? 'טרם התחיל' : `${greetingIndex + 1} / ${drawingAnswers.length}`}
              </span>
            </div>

            {greetingIndex < 0 ? (
              <button
                onClick={() => doAction('greeting_start')}
                disabled={loading || drawingAnswers.length === 0}
                className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
              >
                ▶ התחל סיור ציורים
              </button>
            ) : allDrawingsScored && greetingIndex >= drawingAnswers.length ? (
              <div className="space-y-3">
                <div className="text-center text-white text-xl">✅ כל הציורים נוקדו!</div>
                <button
                  onClick={() => doAction('show_leaderboard')}
                  disabled={loading}
                  className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
                >
                  הצג דירוג
                </button>
              </div>
            ) : currentDrawing ? (
              <div className="space-y-3">
                <p className="text-white text-lg font-bold text-center">{currentDrawing.playerName}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentDrawing.imageUrl}
                  alt="ציור"
                  className="w-full rounded-xl max-h-48 object-contain bg-white"
                />

                {currentDrawing.scored ? (
                  <div className="space-y-3">
                    <p className="text-yellow-300 text-center text-lg font-bold">ניקוד: {currentDrawing.scoreValue}/10</p>
                    <button
                      onClick={() => doAction('greeting_next')}
                      disabled={loading}
                      className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                    >
                      הבא ←
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-white text-center">בחרו ניקוד:</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <button
                          key={n}
                          onClick={() => setDrawingScore(n)}
                          className={`py-2 rounded-lg font-bold text-lg transition-colors ${
                            drawingScore === n
                              ? 'bg-yellow-400 text-black'
                              : 'bg-white/20 text-white hover:bg-white/30'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        if (drawingScore === null) return;
                        await doAction('score_drawing', { answerId: currentDrawing.id, score: drawingScore });
                        setDrawingScore(null);
                      }}
                      disabled={drawingScore === null || loading}
                      className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
                    >
                      שלח ניקוד ✓
                    </button>
                  </div>
                )}

                {/* Also show all scored drawings scored state and allow showing leaderboard */}
                {allDrawingsScored && (
                  <button
                    onClick={() => doAction('show_leaderboard')}
                    disabled={loading}
                    className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                  >
                    ✅ כל הציורים נוקדו — הצג דירוג
                  </button>
                )}
              </div>
            ) : (
              <p className="text-white/60 text-center">אין ציורים להצגה</p>
            )}
          </div>
        )}

        {/* Greeting Controller */}
        {isGreetingQuestion && game?.status === 'answer_revealed' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">🎬 שליטת ברכות</h2>
              <span className="text-yellow-300 font-bold text-lg">
                {greetingIndex < 0 ? 'ממתין' : `${greetingIndex + 1} / ${greetingAnswers.length}`}
              </span>
            </div>

            {/* Main controls row */}
            <div className="grid grid-cols-5 gap-2">
              <button
                onClick={() => doAction('greeting_prev')}
                disabled={loading || greetingIndex <= 0}
                className="bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xl"
                title="הקודם"
              >⏮</button>
              <button
                onClick={() => doAction(greetingIndex < 0 ? 'greeting_start' : 'greeting_next')}
                disabled={loading || greetingAnswers.length === 0}
                className="col-span-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
              >
                {greetingIndex < 0 ? '▶ התחל' : greetingIndex >= greetingAnswers.length - 1 ? '✓ סוף' : '▶ הבא'}
              </button>
              <button
                onClick={() => doAction('greeting_restart')}
                disabled={loading}
                className="bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xl"
                title="מהתחלה"
              >🔄</button>
              <button
                onClick={() => doAction('greeting_stop')}
                disabled={loading}
                className="bg-red-500/60 hover:bg-red-600/60 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xl"
                title="עצור"
              >🛑</button>
            </div>

            {/* Greeting list — click to jump */}
            {greetingAnswers.length > 0 && (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {greetingAnswers.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => doAction('greeting_goto', { index: i })}
                    disabled={loading}
                    className={`w-full text-right rounded-lg px-3 py-2 transition-colors ${
                      i === greetingIndex
                        ? 'bg-yellow-400/40 border border-yellow-400 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white/80'
                    }`}
                  >
                    <span className="font-bold text-sm">{i + 1}. {g.playerName}</span>
                    <span className="text-xs text-white/60 mr-2">— {g.text.slice(0, 40)}{g.text.length > 40 ? '...' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Question */}
        {currentQuestion && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <h2 className="text-white font-bold text-lg mb-2">שאלה נוכחית ({currentQuestion.question_order}/{allQuestions.length})</h2>
            <p className="text-white text-xl" dir="rtl">
              {currentQuestion.question_type === 'free_text_greeting'
                ? 'כתבו ברכה לאביה!'
                : currentQuestion.question_type === 'drawing_contest'
                ? "Draw Aviya's father!"
                : currentQuestion.question_text}
            </p>
            <p className="text-green-300 mt-2">תשובה נכונה: {currentQuestion.correct_answer}</p>
            <p className="text-pink-200 mt-2">{answers.length}/{players.length} ענו</p>
          </div>
        )}

        {/* Answers */}
        {answers.length > 0 && !isGreetingQuestion && !isDrawingQuestion && (
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
