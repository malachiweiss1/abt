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
  const [greetingScore, setGreetingScore] = useState<number | null>(null);
  const [memeScore, setMemeScore] = useState<number | null>(null);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('code', gameCode)
      .single();

    if (!gameData) return;
    // Read greeting_index via RPC — PostgREST schema cache doesn't know this column
    const { data: greetingIdx } = await supabase.rpc('get_greeting_index', { p_game_id: gameData.id });
    setGame({ ...gameData, greeting_index: (greetingIdx as number) ?? -1 });

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
    video_revealed: 'שאלה על הסרטון',
    answer_revealed: 'תשובה נחשפה',
    leaderboard: 'טבלת מובילים',
    finished: 'הסתיים',
  };

  const currentQuestionIndex = allQuestions.findIndex(q => q.id === game?.current_question_id);
  const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;
  const isGreetingQuestion = currentQuestion?.question_type === 'free_text_greeting';
  const isDrawingQuestion = currentQuestion?.question_type === 'drawing_contest';
  const isImageContestQuestion = currentQuestion?.question_type === 'ai_image_contest';
  const isTrueFalseQuestion = currentQuestion?.question_type === 'true_false_rapid';
  const isMemeQuestion = currentQuestion?.question_type === 'meme_contest';
  const isVideoQuestion = currentQuestion?.question_type === 'video_question';
  const isImageQuestion = isDrawingQuestion || isImageContestQuestion || isMemeQuestion;
  const videoQuestions = allQuestions.filter(q => q.question_type === 'video_question').sort((a, b) => a.question_order - b.question_order);
  const videoIndex = isVideoQuestion ? (videoQuestions.findIndex(q => q.id === currentQuestion?.id) + 1) : 0;
  const greetingIndex = game?.greeting_index ?? -1;

  // Parse greeting answers for the controller list (skip blank submissions)
  const greetingAnswers = isGreetingQuestion
    ? answers
        .filter(a => a.answer_value !== '__skip__')
        .map(a => {
          let text = a.answer_value;
          const playerName = players.find(p => p.id === a.player_id)?.display_name ?? '?';
          try {
            const parsed = JSON.parse(a.answer_value);
            if (parsed?.text) text = parsed.text;
          } catch { /* plain text */ }
          return { id: a.id, playerName, text };
        })
    : [];

  // Drawing / AI image / meme contest computed vars (skip blank submissions)
  const drawingAnswers = isImageQuestion
    ? answers
        .filter(a => a.answer_value !== '__skip__')
        .map(a => {
          // For meme, preview = first image; for drawing/AI = the URL directly
          let previewUrl = a.answer_value;
          if (isMemeQuestion) {
            try {
              const memes = JSON.parse(a.answer_value);
              previewUrl = memes[0]?.imageUrl ?? '';
            } catch { /* ignore */ }
          }
          return {
            id: a.id,
            playerId: a.player_id,
            playerName: players.find(p => p.id === a.player_id)?.display_name ?? '?',
            imageUrl: previewUrl,
            scored: (a.base_score ?? 0) > 0,
            scoreValue: Math.round((a.base_score ?? 0) / 100),
          };
        })
    : [];

  const currentDrawing = greetingIndex >= 0 ? (drawingAnswers[greetingIndex] ?? null) : null;

  // Flat list of individual memes across all players (for meme_contest)
  interface FlatMeme {
    answerId: string;
    playerId: string;
    playerName: string;
    imageUrl: string;
    caption: string;
    score?: number;
    answerMemeIndex: number;
  }
  const flatMemes: FlatMeme[] = isMemeQuestion
    ? answers
        .filter(a => a.answer_value !== '__skip__')
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
        .flatMap(a => {
          try {
            const memes: Array<{ imageUrl: string; caption: string; score?: number }> = JSON.parse(a.answer_value);
            return memes.map((m, idx) => ({
              answerId: a.id,
              playerId: a.player_id,
              playerName: players.find(p => p.id === a.player_id)?.display_name ?? '?',
              imageUrl: m.imageUrl,
              caption: m.caption,
              score: m.score,
              answerMemeIndex: idx,
            }));
          } catch { return []; }
        })
    : [];

  const carouselLength = isMemeQuestion ? flatMemes.length : drawingAnswers.length;
  const allItemsScored = isMemeQuestion
    ? flatMemes.length > 0 && flatMemes.every(m => m.score !== undefined)
    : drawingAnswers.length > 0 && drawingAnswers.every(d => d.scored);
  const activeMemeItem = isMemeQuestion && greetingIndex >= 0 ? (flatMemes[greetingIndex] ?? null) : null;

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

          {game?.status === 'question_active' && isVideoQuestion && (
            <button onClick={() => doAction('reveal_video_question')} disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              ▶ הצג שאלה (הסרטון נגמר)
            </button>
          )}
          {game?.status === 'question_active' && !isVideoQuestion && (
            <button onClick={() => doAction('reveal_answer')} disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              חשוף תשובה
            </button>
          )}
          {game?.status === 'video_revealed' && (
            <button onClick={() => doAction('reveal_answer')} disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg">
              חשוף תשובה
            </button>
          )}

          {game?.status === 'answer_revealed' && !isGreetingQuestion && !isImageQuestion && (
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

        {/* Drawing / AI Image / Meme Controller */}
        {isImageQuestion && game?.status === 'answer_revealed' && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">
                {isDrawingQuestion ? '🎨 ניקוד ציורים' : isMemeQuestion ? '😂 ניקוד ממים' : '🤖 ניקוד תמונות AI'}
              </h2>
              <span className="text-yellow-300 font-bold text-lg">
                {greetingIndex < 0 ? 'טרם התחיל' : greetingIndex >= carouselLength ? 'סיום' : `${greetingIndex + 1} / ${carouselLength}`}
              </span>
            </div>

            {carouselLength === 0 ? (
              <div className="space-y-3">
                <p className="text-white/60 text-center">אין הגשות להצגה</p>
                <button
                  onClick={() => doAction('show_leaderboard')}
                  disabled={loading}
                  className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
                >
                  הצג דירוג
                </button>
              </div>
            ) : greetingIndex < 0 ? (
              <button
                onClick={() => doAction('greeting_start')}
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
              >
                ▶ {isMemeQuestion ? 'התחל סיור ממים' : 'התחל סיור ציורים'}
              </button>
            ) : greetingIndex >= carouselLength ? (
              <div className="space-y-3">
                <div className="text-center text-white text-xl">✅ {isMemeQuestion ? 'כל הממים הוצגו!' : 'כל הציורים הוצגו!'}</div>
                <button
                  onClick={() => doAction('show_leaderboard')}
                  disabled={loading}
                  className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg"
                >
                  הצג דירוג
                </button>
                <button
                  onClick={() => doAction('greeting_restart')}
                  disabled={loading}
                  className="w-full bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-2 rounded-xl"
                >
                  🔄 חזור להתחלה
                </button>
              </div>
            ) : isMemeQuestion && activeMemeItem ? (
              <div className="space-y-3">
                <p className="text-white text-lg font-bold text-center">{activeMemeItem.playerName}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="relative rounded-xl overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeMemeItem.imageUrl}
                    alt="מם"
                    className="w-full rounded-xl max-h-56 object-contain bg-white"
                  />
                  {activeMemeItem.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-center font-bold text-lg p-2">
                      {activeMemeItem.caption}
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => doAction('greeting_prev')}
                    disabled={loading || greetingIndex <= 0}
                    className="bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-lg"
                  >
                    ⏮ הקודם
                  </button>
                  <button
                    onClick={() => doAction('greeting_next')}
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
                  >
                    {greetingIndex >= carouselLength - 1 ? '✓ סיום' : 'הבא ⏭'}
                  </button>
                </div>

                {/* Per-meme scoring */}
                {activeMemeItem.score !== undefined ? (
                  <p className="text-yellow-300 text-center text-lg font-bold">ניקוד: {activeMemeItem.score}/10</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-white text-center">בחרו ניקוד למם:</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <button
                          key={n}
                          onClick={() => setMemeScore(n)}
                          className={`py-2 rounded-lg font-bold text-lg transition-colors ${
                            memeScore === n ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white hover:bg-white/30'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        if (memeScore === null) return;
                        await doAction('score_meme', {
                          answerId: activeMemeItem.answerId,
                          memeIndex: activeMemeItem.answerMemeIndex,
                          score: memeScore,
                        });
                        setMemeScore(null);
                      }}
                      disabled={memeScore === null || loading}
                      className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
                    >
                      שלח ניקוד ✓
                    </button>
                  </div>
                )}

                {allItemsScored && (
                  <button
                    onClick={() => doAction('show_leaderboard')}
                    disabled={loading}
                    className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
                  >
                    ✅ כל הממים נוקדו — הצג דירוג
                  </button>
                )}
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

                {/* Navigation row — always visible */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => doAction('greeting_prev')}
                    disabled={loading || greetingIndex <= 0}
                    className="bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-lg"
                  >
                    ⏮ הקודם
                  </button>
                  <button
                    onClick={() => doAction('greeting_next')}
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
                  >
                    {greetingIndex >= carouselLength - 1 ? '✓ סיום' : 'הבא ⏭'}
                  </button>
                </div>

                {currentDrawing.scored ? (
                  <p className="text-yellow-300 text-center text-lg font-bold">ניקוד: {currentDrawing.scoreValue}/10</p>
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

                {allItemsScored && (
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
              <h2 className="text-white font-bold text-lg">🎬 שליטת סרטונים</h2>
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
                disabled={loading || greetingAnswers.length === 0 || greetingIndex >= greetingAnswers.length - 1}
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

            {/* Scoring for current video */}
            {greetingIndex >= 0 && greetingAnswers[greetingIndex] && (() => {
              const currentGreetingAnswer = answers[greetingIndex];
              const alreadyScored = currentGreetingAnswer && (currentGreetingAnswer.base_score ?? 0) > 0;
              const scoredValue = alreadyScored ? Math.round((currentGreetingAnswer.base_score ?? 0) / 100) : null;
              return (
                <div className="bg-white/10 rounded-xl p-3 space-y-2">
                  <p className="text-white font-bold text-center">
                    ניקוד סרטון — {greetingAnswers[greetingIndex].playerName}
                  </p>
                  {alreadyScored ? (
                    <p className="text-yellow-300 text-center text-lg font-bold">ניקוד: {scoredValue}/10</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <button
                            key={n}
                            onClick={() => setGreetingScore(n)}
                            className={`py-2 rounded-lg font-bold text-lg transition-colors ${
                              greetingScore === n
                                ? 'bg-yellow-400 text-black'
                                : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                          >{n}</button>
                        ))}
                      </div>
                      <button
                        onClick={async () => {
                          if (greetingScore === null || !currentGreetingAnswer) return;
                          await doAction('score_drawing', { answerId: currentGreetingAnswer.id, score: greetingScore });
                          setGreetingScore(null);
                        }}
                        disabled={greetingScore === null || loading || !currentGreetingAnswer}
                        className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl"
                      >
                        שלח ניקוד ✓
                      </button>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Greeting list — click to jump */}
            {greetingAnswers.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {greetingAnswers.map((g, i) => {
                  const ans = answers[i];
                  const scored = ans && (ans.base_score ?? 0) > 0;
                  return (
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
                      {scored && <span className="text-yellow-300 text-xs mr-2">★{Math.round((ans.base_score ?? 0) / 100)}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Show leaderboard when all greetings are done */}
            <button onClick={() => doAction('show_leaderboard')} disabled={loading}
              className="w-full bg-purple-500/60 hover:bg-purple-600/60 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
              סיים סרטונים → הצג דירוג
            </button>
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
                ? '🎨 ציור חופשי'
                : currentQuestion.question_type === 'ai_image_contest'
                ? '🤖 תמונת AI של אביה'
                : currentQuestion.question_type === 'true_false_rapid'
                ? '✅ נכון / לא נכון — 60 שניות'
                : currentQuestion.question_type === 'meme_contest'
                ? '😂 יצירת ממים'
                : currentQuestion.question_type === 'video_question'
                ? `🎬 סרטון ${videoIndex || currentQuestion.question_order}`
                : currentQuestion.question_text}
            </p>
            <p className="text-green-300 mt-2">תשובה נכונה: {currentQuestion.correct_answer}</p>
            <p className="text-pink-200 mt-2">{answers.length}/{players.length} ענו</p>
          </div>
        )}

        {/* Answers */}
        {answers.length > 0 && !isGreetingQuestion && !isImageQuestion && (
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
