'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Game, Question, Player } from '@/types';

const STORAGE_KEY = 'birthday_quiz_player';

interface PageProps {
  params: Promise<{ gameCode: string }>;
}

export default function PlayerScreen({ params }: PageProps) {
  const { gameCode } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myAnswer, setMyAnswer] = useState<{ isCorrect: boolean; answerValue: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [greetingText, setGreetingText] = useState('');
  const [voiceType, setVoiceType] = useState('woman');
  const playerRef = useRef<Player | null>(null);
  const currentQuestionRef = useRef<Question | null>(null);

  const supabase = createClient();

  const loadGame = useCallback(async (playerId?: string) => {
    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('code', gameCode)
      .single();

    if (!gameData) {
      setError('קוד משחק לא תקין');
      return;
    }
    setGame(gameData);

    if (gameData.current_question_id) {
      const { data: q } = await supabase
        .from('questions')
        .select('*')
        .eq('id', gameData.current_question_id)
        .single();

      if (q && q.id !== currentQuestionRef.current?.id) {
        setCurrentQuestion(q);
        currentQuestionRef.current = q;
        setSelectedAnswer(null);
        setSubmitted(false);
        setMyAnswer(null);
        setGreetingText('');
      }

      // Check if this player already answered
      const pid = playerId || playerRef.current?.id;
      if (pid && q) {
        const { data: existingAnswer } = await supabase
          .from('answers')
          .select('answer_value, is_correct')
          .eq('question_id', q.id)
          .eq('player_id', pid)
          .single();

        if (existingAnswer) {
          setSubmitted(true);
          setMyAnswer({ isCorrect: existingAnswer.is_correct, answerValue: existingAnswer.answer_value });
        }
      }
    } else {
      setCurrentQuestion(null);
      currentQuestionRef.current = null;
      setSubmitted(false);
      setMyAnswer(null);
    }
  }, [gameCode, supabase]);

  useEffect(() => {
    // Try to restore player from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { playerId, playerGameCode } = JSON.parse(stored);
        if (playerGameCode === gameCode) {
          supabase
            .from('players')
            .select('*')
            .eq('id', playerId)
            .single()
            .then(({ data }) => {
              if (data) {
                setPlayer(data);
                playerRef.current = data;
                loadGame(data.id);
              }
            });
        }
      } catch {
        // ignore parse errors
      }
    }

    loadGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`player-screen-${gameCode}-${player?.id || 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${gameCode}` }, () => {
        loadGame();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameCode, player?.id, loadGame, supabase]);

  const handleJoin = async () => {
    if (!nameInput.trim()) {
      setError('נא להזין שם');
      return;
    }
    setJoining(true);
    setError(null);

    const stored = localStorage.getItem(STORAGE_KEY);
    let existingPlayerId: string | undefined;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.playerGameCode === gameCode) existingPlayerId = parsed.playerId;
      } catch {
        // ignore
      }
    }

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode, displayName: nameInput, playerId: existingPlayerId }),
    });

    const data = await res.json();
    setJoining(false);

    if (!res.ok) {
      setError(data.error || 'שגיאה בהצטרפות');
      return;
    }

    setPlayer(data.player);
    playerRef.current = data.player;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId: data.player.id, playerGameCode: gameCode }));
    loadGame(data.player.id);
  };

  const handleSubmit = async (overrideValue?: string) => {
    const value = overrideValue ?? selectedAnswer;
    if (!value || !player || !currentQuestion || submitted || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode,
        questionId: currentQuestion.id,
        playerId: player.id,
        answerValue: value,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      if (res.status === 409) {
        setSubmitted(true);
        setError('כבר הגשת תשובה');
      } else {
        setError(data.error || 'שגיאה בשליחת תשובה');
      }
      return;
    }

    setSubmitted(true);
    setMyAnswer({ isCorrect: data.isCorrect, answerValue: value! });
  };

  function parseGreetingText(value: string): string {
    try { const p = JSON.parse(value); return p?.text || value; } catch { return value; }
  }

  // JOIN SCREEN
  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 w-full max-w-sm text-center space-y-6">
          <div className="text-5xl">🎂</div>
          <h1 className="text-2xl font-bold text-white">כמה אתם מכירים את אביה?</h1>
          <p className="text-pink-200">משחק קוד: {gameCode}</p>
          {error && <p className="text-red-300 bg-red-900/30 rounded-xl p-3">{error}</p>}
          <input
            type="text"
            placeholder="הכנס את שמך"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg text-center border border-white/30 focus:outline-none focus:border-white"
            maxLength={20}
            disabled={joining}
          />
          <button
            onClick={handleJoin}
            disabled={joining || !nameInput.trim()}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors"
          >
            {joining ? 'מצטרף...' : 'הצטרף למשחק'}
          </button>
        </div>
      </div>
    );
  }

  // WAITING
  if (!game || game.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-6">
          <div className="text-6xl animate-bounce">🎉</div>
          <h2 className="text-3xl font-bold text-white">שלום, {player.display_name}!</h2>
          <p className="text-pink-200 text-xl">מחכים שהמשחק יתחיל...</p>
          <div className="flex gap-2 justify-center">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // QUESTION ACTIVE
  if (game.status === 'question_active' && currentQuestion) {
    const isGreeting = currentQuestion.question_type === 'free_text_greeting';

    return (
      <div className="min-h-screen p-4 flex flex-col" dir="rtl">
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 mb-6 text-center">
          <p className="text-pink-200 text-sm mb-1">שאלה {currentQuestion.question_order}</p>
          <h2 className="text-2xl font-bold text-white">
            {isGreeting ? 'כתבו ברכה לאביה!' : currentQuestion.question_text}
          </h2>
        </div>

        {submitted ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-5xl">{isGreeting ? '💌' : myAnswer?.isCorrect ? '✅' : '❌'}</div>
              <p className="text-white text-2xl font-bold">
                {isGreeting ? 'הברכה נשלחה!' : myAnswer?.isCorrect ? 'כל הכבוד!' : 'אוי לא...'}
              </p>
              {isGreeting && myAnswer && (
                <p className="text-pink-200 text-lg italic">"{parseGreetingText(myAnswer.answerValue)}"</p>
              )}
              <p className="text-pink-200">ממתין לשאר השחקנים...</p>
            </div>
          </div>
        ) : isGreeting ? (
          // FREE TEXT GREETING INPUT
          <div className="flex-1 flex flex-col gap-4">
            <textarea
              placeholder="כתבו ברכה לאביה..."
              value={greetingText}
              onChange={e => setGreetingText(e.target.value)}
              rows={4}
              className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg border border-white/30 focus:outline-none focus:border-white resize-none"
              maxLength={300}
            />
            <p className="text-pink-200 text-sm text-left">{greetingText.length}/300</p>

            {/* Voice selector */}
            <div className="space-y-2">
              <p className="text-pink-200 text-sm text-center">בחרו קול לברכה:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'woman', emoji: '👩', label: 'אישה' },
                  { key: 'man',   emoji: '👨', label: 'גבר' },
                  { key: 'child', emoji: '👦', label: 'ילד' },
                  { key: 'uncle', emoji: '👴', label: 'דוד' },
                ].map(v => (
                  <button
                    key={v.key}
                    onClick={() => setVoiceType(v.key)}
                    className={`py-3 rounded-xl font-bold text-lg transition-all flex flex-col items-center gap-1 ${
                      voiceType === v.key
                        ? 'bg-pink-500 text-white scale-105 shadow-lg'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    <span className="text-2xl">{v.emoji}</span>
                    <span className="text-sm">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleSubmit(JSON.stringify({ text: greetingText, voice: voiceType }))}
              disabled={!greetingText.trim() || submitting}
              className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors"
            >
              {submitting ? 'שולח...' : '💌 שלח ברכה'}
            </button>
            {error && <p className="text-red-300 text-center">{error}</p>}
          </div>
        ) : (
          // MULTIPLE CHOICE
          <div className="flex-1 flex flex-col gap-3">
            {(currentQuestion.options as string[]).map((option) => (
              <button
                key={option}
                onClick={() => { setSelectedAnswer(option); handleSubmit(option); }}
                disabled={submitting}
                className={`w-full py-5 rounded-2xl text-xl font-bold transition-all ${
                  selectedAnswer === option
                    ? 'bg-pink-500 text-white scale-105 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30'
                } disabled:opacity-60 cursor-pointer`}
              >
                {submitting && selectedAnswer === option ? 'שולח...' : option}
              </button>
            ))}
            {error && <p className="text-red-300 text-center">{error}</p>}
          </div>
        )}
      </div>
    );
  }

  // ANSWER REVEALED
  if (game.status === 'answer_revealed' && currentQuestion) {
    const isGreeting = currentQuestion.question_type === 'free_text_greeting';
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-6 max-w-sm w-full">
          {isGreeting ? (
            <>
              <div className="text-6xl">💌</div>
              <h2 className="text-3xl font-bold text-white">הברכות מושמעות!</h2>
              {myAnswer && (
                <div className="bg-pink-500/30 rounded-2xl p-4 border border-pink-400">
                  <p className="text-pink-200 text-sm mb-1">הברכה שלך:</p>
                  <p className="text-white text-lg italic">"{parseGreetingText(myAnswer.answerValue)}"</p>
                </div>
              )}
              <p className="text-pink-200">הקשיבו למסך הגדול 🎂</p>
            </>
          ) : myAnswer ? (
            <>
              <div className="text-6xl">{myAnswer.isCorrect ? '🎉' : '😔'}</div>
              <h2 className="text-3xl font-bold text-white">
                {myAnswer.isCorrect ? 'ענית נכון!' : 'ענית לא נכון'}
              </h2>
              <div className="bg-green-500/30 rounded-2xl p-4 border border-green-400">
                <p className="text-green-200 text-sm">התשובה הנכונה:</p>
                <p className="text-white text-3xl font-bold">{currentQuestion.correct_answer}</p>
              </div>
              {!myAnswer.isCorrect && (
                <p className="text-pink-200">ענית: {myAnswer.answerValue}</p>
              )}
            </>
          ) : (
            <>
              <div className="text-6xl">⏰</div>
              <h2 className="text-2xl font-bold text-white">לא הגשת תשובה</h2>
              <div className="bg-green-500/30 rounded-2xl p-4 border border-green-400">
                <p className="text-green-200 text-sm">התשובה הנכונה:</p>
                <p className="text-white text-3xl font-bold">{currentQuestion.correct_answer}</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if (game.status === 'leaderboard') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-4">
          <div className="text-5xl">📊</div>
          <h2 className="text-2xl font-bold text-white">טבלת מובילים</h2>
          <p className="text-pink-200">ממתין לשאלה הבאה...</p>
        </div>
      </div>
    );
  }

  // FINISHED
  if (game.status === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-6">
          <div className="text-6xl">🎂</div>
          <h2 className="text-3xl font-bold text-white">המשחק הסתיים!</h2>
          <p className="text-2xl text-white">הניקוד שלך: {player.total_score} נקודות</p>
          <p className="text-pink-200 text-xl">מזל טוב אביה! 🎉</p>
        </div>
      </div>
    );
  }

  return null;
}
