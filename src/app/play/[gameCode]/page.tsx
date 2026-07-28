'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import DrawingCanvas from '@/components/DrawingCanvas';
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
  const [drawingSubmitted, setDrawingSubmitted] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'starting' | 'generating' | 'done' | 'error'>('idle');

  // AI image contest state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageHistory, setImageHistory] = useState<string[]>([]); // all generated images
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null); // chosen to submit
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageApproved, setImageApproved] = useState(false);
  const MAX_REFINEMENTS = 5;
  const generatedImageUrl = imageHistory[imageHistory.length - 1] ?? null;

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

    // If greeting with photo, start video generation immediately
    if (currentQuestion.question_type === 'free_text_greeting' && photoFile && data.answer?.id) {
      setVideoStatus('starting');
      try {
        const fd = new FormData();
        fd.append('image', photoFile);
        fd.append('answerId', data.answer.id);
        fd.append('text', greetingText);
        fd.append('voice', voiceType);
        const vRes = await fetch('/api/start-video', { method: 'POST', body: fd });
        if (vRes.ok) {
          setVideoStatus('generating');
        } else {
          setVideoStatus('error');
        }
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
        setSelectedImageUrl(data.imageUrl); // default select the newest
      }
    } catch {
      setError('שגיאת רשת — נסה שוב');
    } finally {
      setImageGenerating(false);
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

    const questionLabel = isGreeting
      ? 'כתבו ברכה לאביה!'
      : isDrawing
      ? '🎨 ציירו!'
      : isImageContest
      ? '🤖 צרו תמונת AI של אביה'
      : currentQuestion.question_text;

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
          // AI IMAGE CONTEST
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
                // Initial prompt input
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
                    {imageGenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⚙️</span> יוצר תמונה...
                      </span>
                    ) : '✨ צור תמונה'}
                  </button>
                  {error && <p className="text-red-300 text-center">{error}</p>}
                </>
              ) : (
                <>
                  {/* Currently selected image (large) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImageUrl ?? generatedImageUrl ?? ''}
                    alt="תמונה נבחרת"
                    className="w-full rounded-2xl object-contain max-h-56 bg-white/10"
                  />

                  {/* History thumbnails — click to select */}
                  {imageHistory.length > 1 && (
                    <div className="space-y-1">
                      <p className="text-pink-200 text-xs text-center">בחרו תמונה לשליחה:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {imageHistory.map((url, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt={`תמונה ${i + 1}`}
                            onClick={() => setSelectedImageUrl(url)}
                            className={`h-16 w-16 flex-shrink-0 rounded-xl object-cover cursor-pointer border-2 transition-all ${
                              selectedImageUrl === url
                                ? 'border-yellow-400 scale-110'
                                : 'border-white/30 opacity-70'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-pink-200 text-xs text-center">
                    תמונה {imageHistory.indexOf(selectedImageUrl ?? '') + 1} מתוך {imageHistory.length}
                    {imageHistory.length < MAX_REFINEMENTS + 1 && ` · נותרו ${MAX_REFINEMENTS + 1 - imageHistory.length} תיקונים`}
                  </p>

                  {/* Approve button */}
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

                  {/* Refine option */}
                  {imageHistory.length <= MAX_REFINEMENTS && !imageGenerating && (
                    <RefinementInput
                      disabled={imageGenerating || submitting}
                      onRefine={(refinementText) => handleGenerateImage(refinementText)}
                    />
                  )}
                  {imageGenerating && (
                    <div className="text-center text-yellow-300 animate-pulse text-lg">⚙️ מתקן תמונה...</div>
                  )}
                  {error && <p className="text-red-300 text-center">{error}</p>}
                </>
              )}
            </div>
          )
        ) : submitted ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-5xl">{isGreeting ? '💌' : myAnswer?.isCorrect ? '✅' : '❌'}</div>
              <p className="text-white text-2xl font-bold">
                {isGreeting ? 'הברכה נשלחה!' : myAnswer?.isCorrect ? 'כל הכבוד!' : 'אוי לא...'}
              </p>
              {isGreeting && myAnswer && (
                <p className="text-pink-200 text-lg italic">&ldquo;{parseGreetingText(myAnswer.answerValue)}&rdquo;</p>
              )}
              {videoStatus === 'starting' && <p className="text-yellow-300 text-sm animate-pulse">מכין את הוידאו שלך...</p>}
              {videoStatus === 'generating' && <p className="text-green-300 text-sm animate-pulse">✨ הוידאו שלך בדרך!</p>}
              {videoStatus === 'error' && <p className="text-orange-300 text-sm">הוידאו לא הצליח</p>}
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
              rows={3}
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

            {/* Photo upload */}
            <div className="space-y-2">
              <p className="text-pink-200 text-sm text-center">📸 העלו תמונת פנים (אופציונלי — ליצירת וידאו)</p>
              {photoPreview ? (
                <div className="relative flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="תצוגה מקדימה" className="h-32 w-32 object-cover rounded-2xl border-2 border-pink-400" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center"
                  >✕</button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 bg-white/10 border border-dashed border-white/40 rounded-2xl p-4 cursor-pointer hover:bg-white/20 transition-colors">
                  <span className="text-3xl">📷</span>
                  <span className="text-white/70 text-sm">לחצו לצילום או העלאת תמונה</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPhotoFile(file);
                        setPhotoPreview(URL.createObjectURL(file));
                      }
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
    const isDrawing = currentQuestion.question_type === 'drawing_contest';
    const isImageContest = currentQuestion.question_type === 'ai_image_contest';
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-6 max-w-sm w-full">
          {isDrawing || isImageContest ? (
            <>
              <div className="text-6xl">{isDrawing ? '🎨' : '🤖'}</div>
              <h2 className="text-3xl font-bold text-white">
                {isDrawing ? 'הציורים מוצגים!' : 'התמונות מוצגות!'}
              </h2>
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

// Small sub-component for the refinement input
function RefinementInput({
  disabled,
  onRefine,
}: {
  disabled: boolean;
  onRefine: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-2">
      <p className="text-pink-200 text-sm text-center">לא מרוצה? תארו שינוי:</p>
      <input
        type="text"
        placeholder="למשל: תוסיף כוכבים ברקע"
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={disabled}
        className="w-full bg-white/20 text-white placeholder-white/60 rounded-xl p-3 text-base border border-white/30 focus:outline-none focus:border-white"
        maxLength={150}
      />
      <button
        onClick={() => { onRefine(text); setText(''); }}
        disabled={disabled || !text.trim()}
        className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"
      >
        🔄 תקן תמונה
      </button>
    </div>
  );
}
