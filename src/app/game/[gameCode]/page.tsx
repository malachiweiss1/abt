'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@/lib/supabase/client';
import Confetti from '@/components/Confetti';
import GreetingPlayer from '@/components/GreetingPlayer';
import type { Game, Question, Player, Answer } from '@/types';

interface PageProps {
  params: Promise<{ gameCode: string }>;
}

export default function GameScreen({ params }: PageProps) {
  const { gameCode } = use(params);
  const [game, setGame] = useState<Game | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
    setGame(gameData);

    if (gameData.current_question_id) {
      const { data: questionData } = await supabase
        .from('questions')
        .select('*')
        .eq('id', gameData.current_question_id)
        .single();
      setCurrentQuestion(questionData);

      if (gameData.status === 'question_active' || gameData.status === 'answer_revealed') {
        const { data: answersData } = await supabase
          .from('answers')
          .select('*')
          .eq('question_id', gameData.current_question_id);
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
  const isGreetingQuestion = currentQuestion?.question_type === 'free_text_greeting';

  return (
    <div className="min-h-screen p-6 flex flex-col" dir="rtl">
      {game.status === 'finished' && <Confetti />}

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-5xl font-bold text-white mb-2">🎂 כמה אתם מכירים את אביה? 🎂</h1>
        <p className="text-pink-200 text-2xl">קוד משחק: {gameCode}</p>
      </div>

      {/* Waiting State */}
      {game.status === 'waiting' && (
        <div className="flex-1 flex gap-8 items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="bg-white p-4 rounded-2xl shadow-2xl">
              {playUrl && <QRCodeSVG value={playUrl} size={200} />}
            </div>
            <p className="text-white text-lg text-center">סרקו להצטרפות</p>
            <p className="text-pink-200 text-sm">{playUrl}</p>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-white text-3xl font-bold text-center">
              שחקנים מחוברים ({players.length})
            </h2>
            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {players.map(p => (
                <div key={p.id} className="bg-white/20 rounded-xl px-4 py-2 text-white text-xl text-center backdrop-blur-sm">
                  {p.display_name}
                </div>
              ))}
            </div>
            {players.length === 0 && (
              <p className="text-pink-200 text-xl text-center">ממתין לשחקנים...</p>
            )}
          </div>
        </div>
      )}

      {/* Question Active */}
      {game.status === 'question_active' && currentQuestion && (
        <div className="flex-1 flex flex-col items-center gap-8">
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
        </div>
      )}

      {/* Answer Revealed */}
      {game.status === 'answer_revealed' && currentQuestion && (
        <div className="flex-1 flex flex-col items-center gap-6 w-full max-w-3xl mx-auto">
          {isGreetingQuestion ? (
            <>
              <h2 className="text-4xl font-bold text-white text-center">💌 ברכות לאביה</h2>
              <GreetingPlayer
                greetings={answers.map(a => {
                  let text = a.answer_value;
                  let voice = 'woman';
                  try {
                    const parsed = JSON.parse(a.answer_value);
                    if (parsed?.text) { text = parsed.text; voice = parsed.voice || 'woman'; }
                  } catch { /* plain text greeting */ }
                  return {
                    playerName: players.find(p => p.id === a.player_id)?.display_name ?? '?',
                    text,
                    voice,
                  };
                })}
              />
            </>
          ) : (
            <>
              <div className="bg-green-500/80 backdrop-blur-sm rounded-3xl p-8 text-center w-full">
                <p className="text-white text-xl mb-2">התשובה הנכונה:</p>
                <h2 className="text-5xl font-bold text-white">{currentQuestion.correct_answer}</h2>
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
