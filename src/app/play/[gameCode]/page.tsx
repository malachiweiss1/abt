'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import DrawingCanvas from '@/components/DrawingCanvas';
import type { Game, Question, Player } from '@/types';

const STORAGE_KEY = 'birthday_quiz_player';

const TRUE_FALSE_QUESTIONS = [
  { q: 'אביה למדה במדרשת נשמת ב2017?', a: 'כן' },
  { q: 'אביה גרה בבאר שבע יותר מ5 שנים?', a: 'לא' },
  { q: 'רוב המלוות של אביה נשואות?', a: 'כן' },
  { q: 'אביה תסיים התמחות לפני הבר מצווה של צור?', a: 'כן' },
  { q: 'אביה במחזור מ״ח היום בלימודים?', a: 'לא' },
  { q: 'אביה היא האמא הראשונה במחזור לימודים שלה?', a: 'כן' },
  { q: 'אביה הולכת לאימוני כושר 3 פעמים בשבוע?', a: 'לא' },
  { q: 'התאריך לידה העברי של אביה זה כ״ז אב תשנ״ח?', a: 'כן' },
  { q: 'אביה היום בסבב כירורגיה?', a: 'כן' },
  { q: 'אביה עדיין עובדת במכון ריאות בסורוקה?', a: 'כן' },
  { q: 'אביה חברה בוועדת קליטה של הקהילה?', a: 'לא' },
  { q: 'התאריך לידה הלועזי של אביה הוא 18.9.98?', a: 'לא' },
  { q: 'גימטריה של אביה = 18?', a: 'כן' },
];

const MEME_IMAGES = [
  '/images/02BAA7A5-0278-4FE3-A803-AEDD96291CFC.png',
  '/images/095035FE-105D-4C70-8636-0DD142BD74E6.png',
  '/images/12AFE045-3C02-4CC6-8AC3-C32E87F46358.png',
  '/images/28A6E576-E4AE-4F4B-A8E7-6EDA40E9AEA4.png',
  '/images/28E4E017-6A93-47F6-928C-1EDAD8901DE3.png',
  '/images/5BA5B3E5-F294-46FE-B763-EAEF39D5B5CF.png',
  '/images/7767C9A6-CF4A-4ED9-8D3F-8BC0B4F32828.png',
  '/images/7C7AB27B-0273-45DB-8DCF-5EE8BE78DEB5.png',
  '/images/C7B0AF51-9D92-41F2-A82A-ADD79F1A804D.png',
  '/images/CE6EC624-7F9D-4902-9852-0AB721C15A93.png',
  '/images/DE65CCC8-D12D-4D98-AC8E-C9FB4F657527.png',
  '/images/FD0670B9-1E59-4E59-B34B-E2000A7F4728.png',
];

const TF_TIME_LIMIT = 60; // seconds

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
  const [drawingSubmitted, setDrawingSubmitted] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'starting' | 'generating' | 'done' | 'error'>('idle');

  // AI image contest state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageApproved, setImageApproved] = useState(false);
  const MAX_REFINEMENTS = 5;
  const generatedImageUrl = imageHistory[imageHistory.length - 1] ?? null;

  // True/False rapid state
  const [tfAnswers, setTfAnswers] = useState<string[]>([]);
  const [tfCurrentIdx, setTfCurrentIdx] = useState(0);
  const [tfTimeLeft, setTfTimeLeft] = useState(TF_TIME_LIMIT);
  const tfSubmittedRef = useRef(false);

  // Meme contest state
  const [memeCaptions, setMemeCaptions] = useState<Record<string, string>>({});
  const [memeImageIdx, setMemeImageIdx] = useState(0);
  const [memeSubmitted, setMemeSubmitted] = useState(false);

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
        setDrawingSubmitted(false);
        setImagePrompt('');
        setImageHistory([]);
        setSelectedImageUrl(null);
        setImageApproved(false);
        setImageGenerating(false);
        setTfAnswers([]);
        setTfCurrentIdx(0);
        setTfTimeLeft(TF_TIME_LIMIT);
        tfSubmittedRef.current = false;
        setMemeCaptions({});
        setMemeImageIdx(0);
        setMemeSubmitted(false);
      }

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
          tfSubmittedRef.current = true;
          setMemeSubmitted(true);
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
      } catch { /* ignore */ }
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

  // True/false countdown timer
  useEffect(() => {
    if (currentQuestion?.question_type !== 'true_false_rapid') return;
    if (submitted || tfSubmittedRef.current) return;
    if (!game?.question_started_at) return;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(game.question_started_at!).getTime()) / 1000);
      const remaining = Math.max(0, TF_TIME_LIMIT - elapsed);
      setTfTimeLeft(remaining);
      if (remaining === 0 && !tfSubmittedRef.current) {
        autoSubmitTrueFalse();
      }
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.question_type, submitted, game?.question_started_at]);

  const autoSubmitTrueFalse = useCallback(() => {
    if (tfSubmittedRef.current || !playerRef.current || !currentQuestionRef.current) return;
    tfSubmittedRef.current = true;
    const answers = tfAnswers;
    const correctCount = answers.filter((a, i) => a === TRUE_FALSE_QUESTIONS[i]?.a).length;
    const value = JSON.stringify({ answers, correctCount });
    handleSubmitDirect(value, currentQuestionRef.current.id, playerRef.current.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tfAnswers]);

  const handleJoin = async () => {
    if (!nameInput.trim()) { setError('נא להזין שם'); return; }
    setJoining(true);
    setError(null);

    const stored = localStorage.getItem(STORAGE_KEY);
    let existingPlayerId: string | undefined;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.playerGameCode === gameCode) existingPlayerId = parsed.playerId;
      } catch { /* ignore */ }
    }

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode, displayName: nameInput, playerId: existingPlayerId }),
    });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) { setError(data.error || 'שגיאה בהצטרפות'); return; }
    setPlayer(data.player);
    playerRef.current = data.player;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId: data.player.id, playerGameCode: gameCode }));
    loadGame(data.player.id);
  };

  const handleSubmitDirect = async (value: string, questionId: string, playerId: string) => {
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode, questionId, playerId, answerValue: value }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok && res.status !== 409) {
      setError(data.error || 'שגיאה בשליחת תשובה');
      return;
    }
    setSubmitted(true);
    setMyAnswer({ isCorrect: data.isCorrect ?? false, answerValue: value });
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

    // Start video generation immediately after greeting submit
    if (currentQuestion.question_type === 'free_text_greeting' && photoFile && data.answer?.id) {
      setVideoStatus('starting');
      try {
        const fd = new FormData();
        fd.append('image', photoFile);
        fd.append('answerId', data.answer.id);
        fd.append('text', greetingText);
        fd.append('voice', voiceType);
        const vRes = await fetch('/api/start-video', { method: 'POST', body: fd });
        setVideoStatus(vRes.ok ? 'generating' : 'error');
      } catch {
        setVideoStatus('error');
      }
    }
  };

  const handleGenerateImage = async (refinementPrompt?: string) => {
    setImageGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: refinementPrompt || imagePrompt,
          currentImageUrl: refinementPrompt ? (selectedImageUrl ?? generatedImageUrl) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setError(data.error || 'שגיאה ביצירת תמונה');
      } else {
        setImageHistory(prev => [...prev, data.imageUrl]);
        setSelectedImageUrl(data.imageUrl);
      }
    } catch {
      setError('שגיאת רשת — נסה שוב');
    } finally {
      setImageGenerating(false);
    }
  };

  const handleTfAnswer = (answer: string) => {
    if (submitted || tfSubmittedRef.current || tfTimeLeft === 0) return;
    const newAnswers = [...tfAnswers, answer];
    setTfAnswers(newAnswers);
    const nextIdx = tfCurrentIdx + 1;

    if (nextIdx >= TRUE_FALSE_QUESTIONS.length) {
      // All answered — submit
      tfSubmittedRef.current = true;
      const correctCount = newAnswers.filter((a, i) => a === TRUE_FALSE_QUESTIONS[i]?.a).length;
      const value = JSON.stringify({ answers: newAnswers, correctCount });
      handleSubmitDirect(value, currentQuestion!.id, player!.id);
    } else {
      setTfCurrentIdx(nextIdx);
    }
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
    const isDrawing = currentQuestion.question_type === 'drawing_contest';
    const isImageContest = currentQuestion.question_type === 'ai_image_contest';
    const isTrueFalse = currentQuestion.question_type === 'true_false_rapid';
    const isMeme = currentQuestion.question_type === 'meme_contest';
    const isVideo = currentQuestion.question_type === 'video_question';

    const questionLabel = isGreeting ? 'כתבו ברכה לאביה!'
      : isDrawing ? '🎨 ציירו!'
      : isImageContest ? '🤖 צרו תמונת AI של אביה'
      : isTrueFalse ? '✅ נכון / לא נכון'
      : isMeme ? '😂 צרו ממים!'
      : currentQuestion.question_text;

    // TRUE/FALSE RAPID
    if (isTrueFalse) {
      const tfQ = TRUE_FALSE_QUESTIONS[tfCurrentIdx];
      const isDone = submitted || tfSubmittedRef.current || tfAnswers.length >= TRUE_FALSE_QUESTIONS.length;
      const timerColor = tfTimeLeft > 20 ? 'text-green-300' : tfTimeLeft > 10 ? 'text-yellow-300' : 'text-red-400';

      return (
        <div className="min-h-screen p-4 flex flex-col" dir="rtl">
          {/* Timer bar */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-4xl font-bold tabular-nums ${timerColor}`}>{tfTimeLeft}s</span>
            <span className="text-white/70">{tfCurrentIdx}/{TRUE_FALSE_QUESTIONS.length}</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 mb-6">
            <div
              className={`h-2 rounded-full transition-all ${tfTimeLeft > 20 ? 'bg-green-400' : tfTimeLeft > 10 ? 'bg-yellow-400' : 'bg-red-400'}`}
              style={{ width: `${(tfTimeLeft / TF_TIME_LIMIT) * 100}%` }}
            />
          </div>

          {isDone ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-5xl">✅</div>
                <p className="text-white text-2xl font-bold">סיימת!</p>
                <p className="text-pink-200">ממתין לתוצאות...</p>
              </div>
            </div>
          ) : tfTimeLeft === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-5xl">⏰</div>
                <p className="text-white text-2xl font-bold">הזמן נגמר!</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 justify-center">
              <div className="bg-white/20 backdrop-blur-sm rounded-3xl p-6 text-center">
                <p className="text-white text-2xl font-bold leading-relaxed">{tfQ?.q}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleTfAnswer('כן')}
                  className="bg-green-500 hover:bg-green-400 active:scale-95 text-white font-bold py-8 rounded-3xl text-3xl transition-all shadow-lg"
                >
                  ✓ כן
                </button>
                <button
                  onClick={() => handleTfAnswer('לא')}
                  className="bg-red-500 hover:bg-red-400 active:scale-95 text-white font-bold py-8 rounded-3xl text-3xl transition-all shadow-lg"
                >
                  ✗ לא
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // MEME CONTEST
    if (isMeme) {
      const currentImg = MEME_IMAGES[memeImageIdx];
      const captionCount = Object.values(memeCaptions).filter(c => c.trim()).length;

      if (memeSubmitted || submitted) {
        return (
          <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
            <div className="text-center space-y-4">
              <div className="text-5xl">😂</div>
              <p className="text-white text-2xl font-bold">הממים נשלחו!</p>
              <p className="text-pink-200">שלחת {captionCount} ממים</p>
              <p className="text-pink-200">ממתין לשאר השחקנים...</p>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen p-4 flex flex-col" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-lg">😂 צרו ממים</h2>
            <span className="text-pink-200 text-sm">{memeImageIdx + 1} / {MEME_IMAGES.length}</span>
          </div>

          {/* Image with caption preview */}
          <div className="relative rounded-2xl overflow-hidden bg-black mb-3 flex-shrink-0" style={{ maxHeight: '45vh' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImg} alt="מם" className="w-full object-contain" style={{ maxHeight: '45vh' }} />
            {memeCaptions[currentImg] && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-center font-bold text-xl p-3">
                {memeCaptions[currentImg]}
              </div>
            )}
          </div>

          {/* Caption input */}
          <input
            type="text"
            placeholder="כתבו כיתוב מצחיק..."
            value={memeCaptions[currentImg] ?? ''}
            onChange={e => setMemeCaptions(prev => ({ ...prev, [currentImg]: e.target.value }))}
            className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg border border-white/30 focus:outline-none focus:border-white mb-3"
            maxLength={80}
          />

          {/* Navigation */}
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setMemeImageIdx(i => Math.max(0, i - 1))}
              disabled={memeImageIdx === 0}
              className="flex-1 bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xl"
            >⏮ הקודם</button>
            <button
              onClick={() => setMemeImageIdx(i => Math.min(MEME_IMAGES.length - 1, i + 1))}
              disabled={memeImageIdx === MEME_IMAGES.length - 1}
              className="flex-1 bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xl"
            >הבא ⏭</button>
          </div>

          {/* Dot indicators */}
          <div className="flex gap-1 justify-center mb-4">
            {MEME_IMAGES.map((img, i) => (
              <button
                key={img}
                onClick={() => setMemeImageIdx(i)}
                className={`rounded-full transition-all ${
                  i === memeImageIdx ? 'w-4 h-4 bg-white' : memeCaptions[img]?.trim() ? 'w-3 h-3 bg-green-400' : 'w-3 h-3 bg-white/30'
                }`}
              />
            ))}
          </div>

          {/* Submit */}
          <button
            onClick={async () => {
              const memes = MEME_IMAGES
                .filter(img => memeCaptions[img]?.trim())
                .map(img => ({ imageUrl: img, caption: memeCaptions[img].trim() }));
              if (memes.length === 0) { setError('כתבו לפחות כיתוב אחד'); return; }
              setMemeSubmitted(true);
              await handleSubmit(JSON.stringify(memes));
            }}
            disabled={submitting || Object.values(memeCaptions).filter(c => c.trim()).length === 0}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl"
          >
            {submitting ? 'שולח...' : `שלח ממים (${captionCount})`}
          </button>
          {error && <p className="text-red-300 text-center mt-2">{error}</p>}
        </div>
      );
    }

    return (
      <div className="min-h-screen p-4 flex flex-col" dir="rtl">
        <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 mb-6 text-center">
          <p className="text-pink-200 text-sm mb-1">שאלה {currentQuestion.question_order}</p>
          <h2 className="text-2xl font-bold text-white">{questionLabel}</h2>
        </div>

        {isDrawing ? (
          submitted || drawingSubmitted ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-5xl">🎨</div>
                <p className="text-white text-2xl font-bold">הציור נשלח!</p>
                <p className="text-pink-200">ממתין לשאר השחקנים...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <DrawingCanvas
                onSubmit={async (dataUrl) => {
                  if (!player || !currentQuestion) return;
                  const uploadRes = await fetch('/api/upload-drawing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl, answerId: `${player.id}-${currentQuestion.id}` }),
                  });
                  const uploadData = await uploadRes.json();
                  if (!uploadData.url) throw new Error('Upload failed');
                  await handleSubmit(uploadData.url);
                  setDrawingSubmitted(true);
                }}
              />
            </div>
          )
        ) : isImageContest ? (
          submitted || imageApproved ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-5xl">🤖</div>
                <p className="text-white text-2xl font-bold">התמונה אושרה!</p>
                {selectedImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedImageUrl} alt="תמונה שנוצרה" className="w-48 h-48 object-cover rounded-2xl mx-auto border-2 border-pink-400" />
                )}
                <p className="text-pink-200">ממתין לשאר השחקנים...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
              {imageHistory.length === 0 ? (
                <>
                  <p className="text-pink-200 text-sm text-center">תארו את אביה — לדוגמה: אביה, מלכה עם כתר ופרחים</p>
                  <textarea
                    placeholder="הזן תיאור..."
                    value={imagePrompt}
                    onChange={e => setImagePrompt(e.target.value)}
                    rows={3}
                    className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg border border-white/30 focus:outline-none focus:border-white resize-none"
                    maxLength={200}
                    disabled={imageGenerating}
                  />
                  <button
                    onClick={() => handleGenerateImage()}
                    disabled={!imagePrompt.trim() || imageGenerating}
                    className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl"
                  >
                    {imageGenerating ? <span className="flex items-center justify-center gap-2"><span className="animate-spin">⚙️</span> יוצר תמונה...</span> : '✨ צור תמונה'}
                  </button>
                  {error && <p className="text-red-300 text-center">{error}</p>}
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedImageUrl ?? generatedImageUrl ?? ''} alt="תמונה נבחרת" className="w-full rounded-2xl object-contain max-h-56 bg-white/10" />
                  {imageHistory.length > 1 && (
                    <div className="space-y-1">
                      <p className="text-pink-200 text-xs text-center">בחרו תמונה לשליחה:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {imageHistory.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt={`תמונה ${i + 1}`}
                            onClick={() => setSelectedImageUrl(url)}
                            className={`h-16 w-16 flex-shrink-0 rounded-xl object-cover cursor-pointer border-2 transition-all ${selectedImageUrl === url ? 'border-yellow-400 scale-110' : 'border-white/30 opacity-70'}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-pink-200 text-xs text-center">
                    תמונה {imageHistory.indexOf(selectedImageUrl ?? '') + 1} מתוך {imageHistory.length}
                    {imageHistory.length <= MAX_REFINEMENTS && ` · נותרו ${MAX_REFINEMENTS + 1 - imageHistory.length} תיקונים`}
                  </p>
                  <button
                    onClick={async () => {
                      const toSubmit = selectedImageUrl ?? generatedImageUrl;
                      if (!toSubmit) return;
                      setImageApproved(true);
                      await handleSubmit(toSubmit);
                    }}
                    disabled={submitting || imageGenerating}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl"
                  >
                    {submitting ? 'שולח...' : '✓ אשר תמונה'}
                  </button>
                  {imageHistory.length <= MAX_REFINEMENTS && !imageGenerating && (
                    <RefinementInput disabled={imageGenerating || submitting} onRefine={(t) => handleGenerateImage(t)} />
                  )}
                  {imageGenerating && <div className="text-center text-yellow-300 animate-pulse text-lg">⚙️ מתקן תמונה...</div>}
                  {error && <p className="text-red-300 text-center">{error}</p>}
                </>
              )}
            </div>
          )
        ) : submitted ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-5xl">{isGreeting ? '💌' : isVideo ? '🎬' : myAnswer?.isCorrect ? '✅' : '❌'}</div>
              <p className="text-white text-2xl font-bold">
                {isGreeting ? 'הברכה נשלחה!' : isVideo ? 'ענית!' : myAnswer?.isCorrect ? 'כל הכבוד!' : 'אוי לא...'}
              </p>
              {isGreeting && myAnswer && (
                <p className="text-pink-200 text-lg italic">&ldquo;{parseGreetingText(myAnswer.answerValue)}&rdquo;</p>
              )}
              {videoStatus === 'starting' && <p className="text-yellow-300 text-sm animate-pulse">מכין את הוידאו שלך...</p>}
              {videoStatus === 'generating' && <p className="text-green-300 text-sm animate-pulse">✨ הוידאו שלך בדרך!</p>}
              <p className="text-pink-200">ממתין לשאר השחקנים...</p>
            </div>
          </div>
        ) : isGreeting ? (
          <div className="flex-1 flex flex-col gap-4">
            <textarea
              placeholder="כתבו ברכה לאביה..."
              value={greetingText}
              onChange={e => setGreetingText(e.target.value)}
              rows={3}
              className="w-full bg-white/20 text-white placeholder-white/60 rounded-2xl p-4 text-lg border border-white/30 focus:outline-none focus:border-white resize-none"
              maxLength={300}
            />
            <p className="text-pink-200 text-sm text-left">{greetingText.length}/300</p>
            <div className="space-y-2">
              <p className="text-pink-200 text-sm text-center">בחרו קול לברכה:</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: 'woman', emoji: '👩', label: 'אישה' }, { key: 'man', emoji: '👨', label: 'גבר' }].map(v => (
                  <button key={v.key} onClick={() => setVoiceType(v.key)}
                    className={`py-3 rounded-xl font-bold text-lg transition-all flex flex-col items-center gap-1 ${voiceType === v.key ? 'bg-pink-500 text-white scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                    <span className="text-2xl">{v.emoji}</span>
                    <span className="text-sm">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-pink-200 text-sm text-center">📸 העלו תמונת פנים (אופציונלי — ליצירת וידאו)</p>
              {photoPreview ? (
                <div className="relative flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="תצוגה מקדימה" className="h-32 w-32 object-cover rounded-2xl border-2 border-pink-400" />
                  <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center">✕</button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 bg-white/10 border border-dashed border-white/40 rounded-2xl p-4 cursor-pointer hover:bg-white/20 transition-colors">
                  <span className="text-3xl">📷</span>
                  <span className="text-white/70 text-sm">לחצו לצילום או העלאת תמונה</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
                    }}
                  />
                </label>
              )}
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
          // MULTIPLE CHOICE (also used for video_question)
          <div className="flex-1 flex flex-col gap-3">
            {(currentQuestion.options as string[]).map((option) => (
              <button
                key={option}
                onClick={() => { setSelectedAnswer(option); handleSubmit(option); }}
                disabled={submitting}
                className={`w-full py-5 rounded-2xl text-xl font-bold transition-all ${
                  selectedAnswer === option ? 'bg-pink-500 text-white scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'
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
    const isDrawing = currentQuestion.question_type === 'drawing_contest';
    const isImageContest = currentQuestion.question_type === 'ai_image_contest';
    const isTrueFalse = currentQuestion.question_type === 'true_false_rapid';
    const isMeme = currentQuestion.question_type === 'meme_contest';

    let tfCorrectCount = 0;
    let tfTotal = 0;
    if (isTrueFalse && myAnswer) {
      try {
        const parsed = JSON.parse(myAnswer.answerValue);
        tfCorrectCount = parsed.correctCount ?? 0;
        tfTotal = parsed.answers?.length ?? 0;
      } catch { /* ignore */ }
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-6 max-w-sm w-full">
          {isTrueFalse ? (
            <>
              <div className="text-6xl">✅</div>
              <h2 className="text-3xl font-bold text-white">סיום!</h2>
              {myAnswer ? (
                <div className="bg-white/20 rounded-2xl p-4 space-y-2">
                  <p className="text-white text-xl">ענית על <span className="text-yellow-300 font-bold">{tfTotal}</span> שאלות</p>
                  <p className="text-white text-xl">צדקת ב<span className="text-green-300 font-bold">{tfCorrectCount}</span> מתוכן</p>
                  <p className="text-yellow-300 text-2xl font-bold">{tfCorrectCount * 100} נקודות</p>
                </div>
              ) : (
                <p className="text-pink-200">לא הגשת תשובה</p>
              )}
            </>
          ) : isDrawing || isImageContest ? (
            <>
              <div className="text-6xl">{isDrawing ? '🎨' : '🤖'}</div>
              <h2 className="text-3xl font-bold text-white">{isDrawing ? 'הציורים מוצגים!' : 'התמונות מוצגות!'}</h2>
              <p className="text-pink-200">הסתכלו על המסך הגדול</p>
            </>
          ) : isMeme ? (
            <>
              <div className="text-6xl">😂</div>
              <h2 className="text-3xl font-bold text-white">הממים מוצגים!</h2>
              <p className="text-pink-200">הסתכלו על המסך הגדול</p>
            </>
          ) : isGreeting ? (
            <>
              <div className="text-6xl">🎬</div>
              <h2 className="text-3xl font-bold text-white">הסרטונים מוצגים!</h2>
              <p className="text-pink-200">הסתכלו על המסך הגדול 🎂</p>
            </>
          ) : myAnswer ? (
            <>
              <div className="text-6xl">{myAnswer.isCorrect ? '🎉' : '😔'}</div>
              <h2 className="text-3xl font-bold text-white">{myAnswer.isCorrect ? 'ענית נכון!' : 'ענית לא נכון'}</h2>
              <div className="bg-green-500/30 rounded-2xl p-4 border border-green-400">
                <p className="text-green-200 text-sm">התשובה הנכונה:</p>
                <p className="text-white text-3xl font-bold">{currentQuestion.correct_answer}</p>
              </div>
              {!myAnswer.isCorrect && <p className="text-pink-200">ענית: {myAnswer.answerValue}</p>}
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

function RefinementInput({ disabled, onRefine }: { disabled: boolean; onRefine: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-2">
      <p className="text-pink-200 text-sm text-center">לא מרוצה? תארו שינוי:</p>
      <input type="text" placeholder="למשל: תוסיף כוכבים ברקע"
        value={text} onChange={e => setText(e.target.value)} disabled={disabled}
        className="w-full bg-white/20 text-white placeholder-white/60 rounded-xl p-3 text-base border border-white/30 focus:outline-none focus:border-white"
        maxLength={150}
      />
      <button onClick={() => { onRefine(text); setText(''); }} disabled={disabled || !text.trim()}
        className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
        🔄 תקן תמונה
      </button>
    </div>
  );
}
