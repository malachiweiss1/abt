import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { calculateScore } from '@/lib/game/scoring';

export async function POST(request: NextRequest) {
  try {
    const { gameCode, questionId, playerId, answerValue } = await request.json();

    if (!answerValue?.trim()) {
      return NextResponse.json({ error: 'תשובה לא יכולה להיות ריקה' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, status, question_started_at, current_question_id')
      .eq('code', gameCode)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'משחק לא נמצא' }, { status: 404 });
    }

    if (game.status !== 'question_active') {
      return NextResponse.json({ error: 'השאלה לא פעילה כרגע' }, { status: 400 });
    }

    // Get question
    const { data: question, error: questionError } = await supabase
      .from('questions')
      .select('correct_answer, time_limit_seconds')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: 'שאלה לא נמצאה' }, { status: 404 });
    }

    // Check if time expired
    const startedAt = new Date(game.question_started_at!).getTime();
    const now = Date.now();
    const responseTimeMs = now - startedAt;
    const timeLimitMs = question.time_limit_seconds * 1000;

    if (responseTimeMs > timeLimitMs + 2000) { // 2 second grace period
      return NextResponse.json({ error: 'הזמן פג, לא ניתן להגיש תשובה' }, { status: 400 });
    }

    const isCorrect = answerValue.trim() === question.correct_answer;
    const { baseScore, speedBonus, totalScore } = calculateScore(
      isCorrect,
      Math.min(responseTimeMs, timeLimitMs),
      question.time_limit_seconds
    );

    // Check for duplicate (upsert won't work due to unique constraint - check first)
    const { data: existingAnswer } = await supabase
      .from('answers')
      .select('id')
      .eq('question_id', questionId)
      .eq('player_id', playerId)
      .single();

    if (existingAnswer) {
      return NextResponse.json({ error: 'כבר הגשת תשובה לשאלה זו' }, { status: 409 });
    }

    // Insert answer
    const { data: answer, error: answerError } = await supabase
      .from('answers')
      .insert({
        game_id: game.id,
        question_id: questionId,
        player_id: playerId,
        answer_value: answerValue.trim(),
        is_correct: isCorrect,
        response_time_ms: Math.min(responseTimeMs, timeLimitMs),
        base_score: baseScore,
        speed_bonus: speedBonus,
        total_score: totalScore,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (answerError) {
      return NextResponse.json({ error: 'שגיאה בשמירת התשובה' }, { status: 500 });
    }

    // Update player total score
    const { data: player } = await supabase
      .from('players')
      .select('total_score')
      .eq('id', playerId)
      .single();

    if (player) {
      await supabase
        .from('players')
        .update({ total_score: player.total_score + totalScore })
        .eq('id', playerId);
    }

    return NextResponse.json({ answer, isCorrect });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
