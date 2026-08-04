'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import Confetti from '@/components/Confetti';
import type { Game, Question, Player, Answer } from '@/types';

const OPEN_IMAGES = [
  '/open_images/IMG_4876.png',
  '/open_images/IMG_4877.png',
  '/open_images/IMG_4878.png',
  '/open_images/IMG_4879.png',
  '/open_images/IMG_4880.png',
  '/open_images/IMG_4881.png',
  '/open_images/IMG_4882.png',
  '/open_images/IMG_4883.png',
  '/open_images/IMG_4884.png',
  '/open_images/IMG_4885.png',
  '/open_images/unnamed.png',
];

interface PageProps {
  params: Promise<{ gameCode: string }>;
}

export default function GameScreen({ params }: PageProps) {
  const { gameCode } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [tfTimeLeft, setTfTimeLeft] = useState(60);
  const [tfCountdown, setTfCountdown] = useState(0);
  const [videoBlocked, setVideoBlocked] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [musicBlocked, setMusicBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Slideshow during waiting
  useEffect(() => {
    if (game?.status !== 'waiting') return;
    const id = setInterval(() => setSlideIdx(i => (i + 1) % OPEN_IMAGES.length), 4000);
    return () => clearInterval(id);
  }, [game?.status]);

  // Derived question type booleans (declared early so music useEffect can reference them)
  const isGreetingQuestion = currentQuestion?.question_type === 'free_text_greeting';
  const isDrawingQuestion = currentQuestion?.question_type === 'drawing_contest';
  const isImageContestQuestion = currentQuestion?.question_type === 'ai_image_contest';

  // Music: play during waiting, drawing, AI image, and greeting questions
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const shouldPlay = game?.status === 'waiting'
      || (game?.status === 'question_active' && (isDrawingQuestion || isImageContestQuestion || isGreetingQuestion));
    if (shouldPlay) {
      audio.play().then(() => setMusicBlocked(false)).catch(() => setMusicBlocked(true));
    } else {
      audio.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, isDrawingQuestion, isImageContestQuestion, isGreetingQuestion]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  const playUrl = `${appUrl}/play/${gameCode}`;

  const supabase = createClient();

  const loadGameData = useCallback(async () => {
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('code', gameCode)
      .single();

    if (gameError || !gameData) {
      setError('קוד משחק לא תקין');
      return;
    }
    // Read greeting_index via RPC — PostgREST schema cache doesn't know this column
    const { data: greetingIdx } = await supabase.rpc('get_greeting_index', { p_game_id: gameData.id });
    setGame({ ...gameData, greeting_index: (greetingIdx as number) ?? -1 });

    const { data: allQuestionsData } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameData.id)
      .order('question_order');
    setAllQuestions(allQuestionsData || []);

    if (gameData.current_question_id) {
      const { data: questionData } = await supabase
        .from('questions')
        .select('*')
        .eq('id', gameData.current_question_id)
        .single();
      setCurrentQuestion(questionData);

      if (gameData.status === 'question_active' || gameData.status === 'answer_revealed' || gameData.status === 'video_revealed') {
        const { data: answersData } = await supabase
          .from('answers')
          .select('*')
          .eq('question_id', gameData.current_question_id)
          .order('submitted_at');
        setAnswers(answersData || []);
      }
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
    loadGameData();

    const channel = supabase
      .channel(`game-screen-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${gameCode}` }, () => {
        loadGameData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        loadGameData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, () => {
        loadGameData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameCode, loadGameData, supabase]);

  // True/false countdown timer on game screen (includes 5-second pre-start countdown)
  useEffect(() => {
    if (currentQuestion?.question_type !== 'true_false_rapid') return;
    if (game?.status !== 'question_active') return;
    if (!game?.question_started_at) return;

    const startedAt = new Date(game.question_started_at!).getTime();
    const PRE_START = 10; // seconds of countdown before TF begins

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = PRE_START - elapsed;
      setTfCountdown(remaining > 0 ? Math.ceil(remaining) : 0);
      setTfTimeLeft(Math.floor(Math.max(0, 45 - Math.max(0, elapsed - PRE_START))));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [currentQuestion?.question_type, game?.status, game?.question_started_at]);

  // Compute remaining question type booleans
  const isTrueFalseQuestion = currentQuestion?.question_type === 'true_false_rapid';
  const isMemeQuestion = currentQuestion?.question_type === 'meme_contest';
  const isVideoQuestion = currentQuestion?.question_type === 'video_question';
  const videoQuestions = allQuestions.filter(q => q.question_type === 'video_question').sort((a, b) => a.question_order - b.question_order);
  const videoIndex = isVideoQuestion ? (videoQuestions.findIndex(q => q.id === currentQuestion?.id) + 1) : 0;

  // Try to autoplay video; show click overlay if browser blocks it
  const isVideoActive = isVideoQuestion && game?.status === 'question_active';
  useEffect(() => {
    if (!isVideoActive) return;
    setVideoBlocked(false);
    const vid = videoRef.current;
    if (!vid) return;
    vid.play().catch(() => setVideoBlocked(true));
  }, [isVideoActive, videoIndex]);
  const greetingIndex = game?.greeting_index ?? -1;

  const sortedGreetingAnswers = isGreetingQuestion
    ? [...answers]
        .filter(a => a.answer_value !== '__skip__')
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    : [];

  const activeAnswer = greetingIndex >= 0 ? (sortedGreetingAnswers[greetingIndex] ?? null) : null;

  // Drawing / AI image contest computed vars (filter skipped submissions)
  const sortedDrawingAnswers = (isDrawingQuestion || isImageContestQuestion)
    ? [...answers]
        .filter(a => a.answer_value !== '__skip__')
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    : [];

  const activeDrawingAnswer = greetingIndex >= 0 ? (sortedDrawingAnswers[greetingIndex] ?? null) : null;
  const activeDrawingPlayerName = activeDrawingAnswer
    ? players.find(p => p.id === activeDrawingAnswer.player_id)?.display_name ?? '?'
    : null;
  const activeDrawingScore = activeDrawingAnswer
    ? Math.round((activeDrawingAnswer.base_score ?? 0) / 100)
    : 0;
  const activeDrawingScored = (activeDrawingAnswer?.base_score ?? 0) > 0;

  let activeGreeting: { playerName: string; text: string; voice: string; predictionId?: string; videoUrl?: string } | null = null;
  if (activeAnswer) {
    let text = activeAnswer.answer_value;
    let voice = 'woman';
    let predictionId: string | undefined;
    let videoUrl: string | undefined;
    try {
      const parsed = JSON.parse(activeAnswer.answer_value);
      if (parsed?.text) {
        text = parsed.text;
        voice = parsed.voice || 'woman';
        predictionId = parsed.prediction_id;
        videoUrl = parsed.video_url;
      }
    } catch { /* plain text */ }
    activeGreeting = {
      playerName: players.find(p => p.id === activeAnswer.player_id)?.display_name ?? '?',
      text,
      voice,
      predictionId,
      videoUrl,
    };
  }

  // Flat meme list for game screen display
  const flatMemes = isMemeQuestion
    ? [...answers]
        .filter(a => a.answer_value !== '__skip__')
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
        .flatMap(a => {
          try {
            const memes: Array<{ imageUrl: string; caption: string; score?: number }> = JSON.parse(a.answer_value);
            return memes.map(m => ({
              playerName: players.find(p => p.id === a.player_id)?.display_name ?? '?',
              imageUrl: m.imageUrl,
              caption: m.caption,
              score: m.score,
            }));
          } catch { return []; }
        })
    : [];
  const activeMeme = isMemeQuestion && greetingIndex >= 0 ? (flatMemes[greetingIndex] ?? null) : null;

  // Poll video-status for the currently displayed greeting (triggers DB update → real-time → loadGameData)
  useEffect(() => {
    if (videoPollingRef.current) {
      clearInterval(videoPollingRef.current);
      videoPollingRef.current = null;
    }
    if (!activeAnswer || !activeGreeting?.predictionId || activeGreeting?.videoUrl) return;

    const answerId = activeAnswer.id;
    const predictionId = activeGreeting.predictionId;

    videoPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video-status?predictionId=${predictionId}&answerId=${answerId}`);
        const data = await res.json();
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(videoPollingRef.current!);
          videoPollingRef.current = null;
        }
      } catch { /* ignore transient errors */ }
    }, 4000);

    return () => {
      if (videoPollingRef.current) {
        clearInterval(videoPollingRef.current);
        videoPollingRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnswer?.id, activeAnswer?.answer_value]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-3xl text-center">{error}</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-3xl animate-pulse">טוען...</div>
      </div>
    );
  }

  const correctAnswers = answers.filter(a => a.is_correct).length;
  const incorrectAnswers = answers.filter(a => !a.is_correct).length;

  return (
    <div className="min-h-screen p-6 flex flex-col" dir="rtl">
      {game.status === 'finished' && <Confetti />}

      {/* Background music — always in DOM, controlled via useEffect */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src="/music_for_open.mp3" loop />
      {musicBlocked && (
        <button
          onClick={() => { audioRef.current?.play(); setMusicBlocked(false); }}
          className="fixed top-4 left-4 z-50 bg-white/20 hover:bg-white/40 text-white rounded-xl px-4 py-2 text-sm font-bold backdrop-blur-sm"
        >
          ▶ הפעל מוזיקה
        </button>
      )}

      {/* Header — only when not waiting */}
      {game.status !== 'waiting' && (
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold text-white mb-2">🎂 כמה אתם מכירים את אביה? 🎂</h1>
        </div>
      )}

      {/* Waiting State — full redesign with images in foreground */}
      {game.status === 'waiting' && (
        <div className="flex-1 flex gap-6 items-stretch min-h-0">
          {/* Left: Slideshow images — prominent, full opacity */}
          <div className="flex-1 relative rounded-3xl overflow-hidden shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={slideIdx}
              src={OPEN_IMAGES[slideIdx]}
              alt=""
              className="w-full h-full object-cover"
              style={{ transition: 'opacity 0.8s ease' }}
            />
            {/* Slide indicators */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {OPEN_IMAGES.map((_, i) => (
                <div key={i} className={`h-2 rounded-full transition-all duration-500 ${i === slideIdx ? 'w-6 bg-white' : 'w-2 bg-white/50'}`} />
              ))}
            </div>
            {/* Title overlay */}
            <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/60 to-transparent">
              <h1 className="text-4xl font-bold text-white text-center drop-shadow-lg">🎂 כמה אתם מכירים את אביה? 🎂</h1>
            </div>
          </div>

          {/* Right: QR + players */}
          <div className="w-72 flex flex-col gap-4">
            <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 flex flex-col items-center gap-3 shadow-xl">
              <div className="bg-white p-3 rounded-xl shadow-lg">
                {playUrl && <QRCodeSVG value={playUrl} size={170} />}
              </div>
              <p className="text-white font-bold text-center">סרקו להצטרפות</p>
              <p className="text-pink-200 text-xs text-center break-all">{playUrl}</p>
            </div>
            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl p-4 min-h-0 flex flex-col shadow-xl">
              <h2 className="text-white text-xl font-bold text-center mb-3">
                שחקנים מחוברים ({players.length})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {players.map(p => (
                  <div key={p.id} className="bg-white/20 rounded-xl px-3 py-2 text-white text-lg text-center backdrop-blur-sm">
                    {p.display_name}
                  </div>
                ))}
                {players.length === 0 && (
                  <p className="text-pink-200 text-lg text-center mt-4">ממתין לשחקנים...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Intro — shown before each video question */}
      {game.status === 'video_intro' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="text-[8rem] leading-none">🎬</div>
          <h2 className="text-7xl font-bold text-white">סרטונים</h2>
          <p className="text-2xl text-pink-200">ממתינים לאדמין...</p>
        </div>
      )}

      {/* Question Active */}
      {game.status === 'question_active' && currentQuestion && (
        <div className="flex-1 flex flex-col items-center gap-8">
          {isTrueFalseQuestion ? (
            tfCountdown > 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <p className="text-white text-3xl font-bold">✅ נכון / לא נכון — מתחיל בעוד</p>
                <div className="text-[12rem] font-bold tabular-nums text-yellow-300 leading-none animate-pulse">
                  {tfCountdown}
                </div>
              </div>
            ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-8">
              <div className={`text-9xl font-bold tabular-nums ${tfTimeLeft > 20 ? 'text-green-300' : tfTimeLeft > 10 ? 'text-yellow-300' : 'text-red-400 animate-pulse'}`}>
                {tfTimeLeft}
              </div>
              <div className="w-64 bg-white/20 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${tfTimeLeft > 20 ? 'bg-green-400' : tfTimeLeft > 10 ? 'bg-yellow-400' : 'bg-red-400'}`}
                  style={{ width: `${(tfTimeLeft / 45) * 100}%` }}
                />
              </div>
              <p className="text-white text-3xl font-bold">✅ נכון / לא נכון</p>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-center">
                <p className="text-white text-3xl font-bold">{answers.length} / {players.length} סיימו</p>
              </div>
            </div>
            )
          ) : isMemeQuestion ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <p className="text-white text-6xl font-bold text-center">😂</p>
              <p className="text-white text-4xl font-bold text-center">צרו ממים!</p>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-center">
                <p className="text-white text-3xl font-bold">{answers.length} / {players.length} שלחו</p>
              </div>
            </div>
          ) : isVideoQuestion ? (
            <div className="flex-1 flex flex-col items-center gap-6 w-full relative">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                key={videoIndex}
                src={`/videos/${videoIndex}.mp4`}
                playsInline
                className="w-full rounded-2xl max-h-[80vh] bg-black"
                onEnded={async () => {
                  try {
                    await fetch('/api/video-reveal', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gameCode }),
                    });
                  } catch { /* ignore */ }
                }}
              />
              {videoBlocked && (
                <button
                  onClick={() => {
                    setVideoBlocked(false);
                    videoRef.current?.play();
                  }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-2xl text-white gap-4"
                >
                  <span className="text-8xl">▶</span>
                  <span className="text-3xl font-bold">לחץ להפעלה</span>
                </button>
              )}
            </div>
          ) : isDrawingQuestion ? (
            <div className="flex-1 flex flex-col items-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aviya.png" alt="תמונת עזר" className="mx-auto max-h-[70vh] rounded-2xl object-contain" />
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-center">
                <p className="text-white text-3xl font-bold">{answers.length} / {players.length} שלחו ציור</p>
              </div>
            </div>
          ) : isImageContestQuestion ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <p className="text-white text-5xl font-bold text-center">🤖 צרו תמונת AI של אביה</p>
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-center">
                <p className="text-white text-3xl font-bold">{answers.length} / {players.length} סיימו</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white/20 backdrop-blur-sm rounded-3xl p-8 w-full max-w-4xl text-center">
                <p className="text-pink-200 text-xl mb-2">שאלה {currentQuestion.question_order}</p>
                <h2 className="text-4xl font-bold text-white">
                  {isGreetingQuestion ? 'כתבו ברכה לאביה!' : currentQuestion.question_text}
                </h2>
              </div>

              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 text-center">
                <p className="text-white text-3xl font-bold">
                  {answers.length} / {players.length} {isGreetingQuestion ? 'שלחו ברכה' : 'ענו'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Video Revealed — question shown after video */}
      {(game.status === 'video_revealed') && currentQuestion && (
        <div className="flex-1 flex flex-col items-center gap-8" dir="rtl">
          <div className="bg-white/20 backdrop-blur-sm rounded-3xl p-8 w-full max-w-4xl text-center">
            <p className="text-pink-200 text-xl mb-2">שאלה {currentQuestion.question_order}</p>
            <h2 className="text-4xl font-bold text-white">{currentQuestion.question_text}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full max-w-4xl" dir="rtl">
            {(currentQuestion.options as string[]).map((opt: string) => (
              <div key={opt} className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
                <p className="text-white text-2xl font-bold">{opt}</p>
              </div>
            ))}
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
            <p className="text-white text-2xl font-bold">{answers.length} / {players.length} ענו</p>
          </div>
        </div>
      )}

      {/* Answer Revealed */}
      {game.status === 'answer_revealed' && currentQuestion && (
        <div className="flex-1 flex flex-col items-center gap-6 w-full max-w-3xl mx-auto">
          {isTrueFalseQuestion ? (
            // Show leaderboard-style breakdown
            <div className="flex-1 flex flex-col w-full gap-4">
              <h2 className="text-3xl font-bold text-white text-center">✅ תוצאות נכון/לא נכון</h2>
              <div className="w-full space-y-3 max-h-[70vh] overflow-y-auto">
                {players.map((p, i) => {
                  const pAnswer = answers.find(a => a.player_id === p.id);
                  let correct = 0, total = 0;
                  if (pAnswer) {
                    try {
                      const parsed = JSON.parse(pAnswer.answer_value);
                      correct = parsed.correctCount ?? 0;
                      total = parsed.answers?.length ?? 0;
                    } catch { /* ignore */ }
                  }
                  return (
                    <div key={p.id} className={`flex items-center gap-4 rounded-2xl p-4 ${i === 0 ? 'bg-yellow-400/40 border border-yellow-400' : 'bg-white/20'}`}>
                      <span className="text-2xl font-bold text-white w-8">{i + 1}.</span>
                      <span className="text-xl text-white flex-1">{p.display_name}</span>
                      <span className="text-green-300 font-bold">{correct}/{total}</span>
                      <span className="text-yellow-300 font-bold text-xl">{pAnswer ? correct * 100 : 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isMemeQuestion ? (
            <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">
              {greetingIndex < 0 || !activeMeme ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">😂</p>
                  <p className="text-pink-200 text-2xl animate-pulse">ממתינים לממים...</p>
                </div>
              ) : greetingIndex >= flatMemes.length ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">🏆</p>
                  <p className="text-white text-2xl">כל הממים הוצגו!</p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-pink-200 text-lg">{greetingIndex + 1} / {flatMemes.length}</p>
                    <p className="text-white text-3xl font-bold mt-1">{activeMeme.playerName}</p>
                  </div>
                  <div className="relative rounded-2xl overflow-hidden w-full max-w-2xl" style={{ maxHeight: '60vh' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activeMeme.imageUrl} alt="מם" className="w-full object-cover" style={{ maxHeight: '60vh' }} />
                    {activeMeme.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-center font-bold text-2xl p-3">
                        {activeMeme.caption}
                      </div>
                    )}
                  </div>
                  {activeMeme.score !== undefined && (
                    <div className="bg-yellow-400/30 border-2 border-yellow-400 rounded-2xl px-8 py-4 text-center">
                      <p className="text-yellow-200 text-lg">ניקוד</p>
                      <p className="text-white text-6xl font-bold">{activeMeme.score}<span className="text-3xl text-yellow-200">/10</span></p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : isDrawingQuestion ? (
            <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">
              {greetingIndex < 0 || !activeDrawingAnswer ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">🎨</p>
                  <p className="text-pink-200 text-2xl animate-pulse">ממתינים לציור הבא...</p>
                </div>
              ) : greetingIndex >= sortedDrawingAnswers.length ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">🏆</p>
                  <p className="text-white text-2xl">כל הציורים נוקדו!</p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-pink-200 text-lg">{greetingIndex + 1} / {sortedDrawingAnswers.length}</p>
                    <p className="text-white text-3xl font-bold mt-1">{activeDrawingPlayerName}</p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={activeDrawingAnswer.id}
                    src={activeDrawingAnswer.answer_value}
                    alt="ציור"
                    className="w-full max-w-lg rounded-2xl object-contain bg-white"
                    style={{ maxHeight: '50vh' }}
                  />
                  {activeDrawingScored && (
                    <div className="bg-yellow-400/30 border-2 border-yellow-400 rounded-2xl px-8 py-4 text-center">
                      <p className="text-yellow-200 text-lg">ניקוד</p>
                      <p className="text-white text-6xl font-bold">
                        {activeDrawingScore}<span className="text-3xl text-yellow-200">/10</span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : isImageContestQuestion ? (
            // AI image contest carousel — same structure as drawing
            <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">
              {greetingIndex < 0 || !activeDrawingAnswer ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">🤖</p>
                  <p className="text-pink-200 text-2xl animate-pulse">ממתינים לתמונה הבאה...</p>
                </div>
              ) : greetingIndex >= sortedDrawingAnswers.length ? (
                <div className="text-center">
                  <p className="text-5xl mb-4">🏆</p>
                  <p className="text-white text-2xl">כל התמונות נוקדו!</p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-pink-200 text-lg">{greetingIndex + 1} / {sortedDrawingAnswers.length}</p>
                    <p className="text-white text-3xl font-bold mt-1">{activeDrawingPlayerName}</p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={activeDrawingAnswer.id}
                    src={activeDrawingAnswer.answer_value}
                    alt="תמונת AI"
                    className="w-full max-w-lg rounded-2xl object-contain bg-white"
                    style={{ maxHeight: '50vh' }}
                  />
                  {activeDrawingScored && (
                    <div className="bg-yellow-400/30 border-2 border-yellow-400 rounded-2xl px-8 py-4 text-center">
                      <p className="text-yellow-200 text-lg">ניקוד</p>
                      <p className="text-white text-6xl font-bold">
                        {activeDrawingScore}<span className="text-3xl text-yellow-200">/10</span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : isGreetingQuestion ? (
            <div className="flex-1 flex flex-col items-center justify-center w-full gap-6">
              {!activeGreeting || !activeGreeting.videoUrl ? (
                <div className="text-center">
                  {activeGreeting?.predictionId && !activeGreeting.videoUrl ? (
                    <>
                      <p className="text-white text-3xl font-bold mt-1">{activeGreeting.playerName}</p>
                      <div className="flex items-center gap-3 text-yellow-300 text-xl animate-pulse mt-4">
                        <span>🎬</span><span>הוידאו מוכן בקרוב...</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-5xl mb-4">🎬</p>
                      <p className="text-pink-200 text-2xl animate-pulse">ממתינים לסרטון הבא...</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-pink-200 text-lg">{greetingIndex + 1} / {sortedGreetingAnswers.length}</p>
                    <p className="text-white text-3xl font-bold mt-1">{activeGreeting.playerName}</p>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    key={`${activeGreeting.videoUrl}-${greetingIndex}`}
                    src={activeGreeting.videoUrl}
                    autoPlay
                    playsInline
                    className="w-full rounded-2xl max-h-[60vh]"
                  />
                </>
              )}
            </div>
          ) : (
            <>
              <div className="bg-green-500/80 backdrop-blur-sm rounded-3xl p-8 text-center w-full">
                <p className="text-white text-xl mb-2">התשובה הנכונה:</p>
                <h2 className="text-5xl font-bold text-white" dir="rtl">{currentQuestion.correct_answer}</h2>
              </div>
              <div className="flex gap-8">
                <div className="bg-green-500/50 rounded-2xl p-6 text-center">
                  <p className="text-4xl font-bold text-white">✓ {correctAnswers}</p>
                  <p className="text-green-200">ענו נכון</p>
                </div>
                <div className="bg-red-500/50 rounded-2xl p-6 text-center">
                  <p className="text-4xl font-bold text-white">✗ {incorrectAnswers}</p>
                  <p className="text-red-200">ענו לא נכון</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {(game.status === 'leaderboard' || game.status === 'finished') && (
        <div className="flex-1 flex flex-col items-center gap-6">
          <h2 className="text-4xl font-bold text-white">
            {game.status === 'finished' ? '🏆 תוצאות סופיות 🏆' : '📊 טבלת מובילים'}
          </h2>
          {game.status === 'finished' && players[0] && (
            <div className="bg-yellow-400/30 backdrop-blur-sm rounded-3xl p-6 text-center border-2 border-yellow-400">
              <p className="text-yellow-200 text-xl">🥇 המנצח</p>
              <p className="text-white text-5xl font-bold">{players[0].display_name}</p>
              <p className="text-yellow-200 text-2xl">{players[0].total_score} נקודות</p>
              <p className="text-3xl mt-2">מזל טוב אביה! 🎂</p>
            </div>
          )}
          <div className="w-full max-w-2xl space-y-3">
            {players.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-4 rounded-2xl p-4 ${
                  i === 0 ? 'bg-yellow-400/40 border border-yellow-400' :
                  i === 1 ? 'bg-gray-300/30 border border-gray-300' :
                  i === 2 ? 'bg-orange-400/30 border border-orange-400' :
                  'bg-white/20'
                } backdrop-blur-sm`}
              >
                <span className="text-3xl font-bold text-white w-10 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                <span className="text-2xl text-white flex-1">{p.display_name}</span>
                <span className="text-2xl font-bold text-white">{p.total_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
