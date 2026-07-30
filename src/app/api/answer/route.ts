import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { calculateScore } from '@/lib/game/scoring';

export async function POST(request: NextRequest) {
  try {
    const { gameCode, questionId, playerId, answerValue } = await request.json();

    if (!answerValue) {
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
      .select('correct_answer, time_limit_seconds, question_type')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: 'שאלה לא נמצאה' }, { status: 404 });
    }

    const qType = question.question_type;
    const startedAt = new Date(game.question_started_at!).getTime();
    const responseTimeMs = Date.now() - startedAt;

    // Score logic per question type
    let isCorrect: boolean;
    let baseScore: number, speedBonus: number, totalScore: number;

    if (['free_text_greeting', 'drawing_contest', 'ai_image_contest', 'meme_contest'].includes(qType)) {
      // No auto-scoring — admin scores manually
      isCorrect = true;
      baseScore = speedBonus = totalScore = 0;
    } else if (qType === 'true_false_rapid') {
      // answer_value is JSON: {answers: string[], correctCount: number}
      let correctCount = 0;
      try {
        const parsed = JSON.parse(answerValue);
        correctCount = parsed.correctCount ?? 0;
      } catch { /* ignore */ }
      isCorrect = correctCount > 0;
      baseScore = correctCount * 100;
      speedBonus = 0;
      totalScore = baseScore;
    } else {
      // multiple_choice / video_question: compare to correct_answer
      isCorrect = answerValue.trim() === question.correct_answer;
      const score = calculateScore(isCorrect, Math.min(responseTimeMs, question.time_limit_seconds * 1000), question.time_limit_seconds);
      baseScore = score.baseScore;
      speedBonus = score.speedBonus;
      totalScore = score.totalScore;
    }

    // Check for duplicate
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
        answer_value: answerValue,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
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
    if (totalScore > 0) {
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
    }

    // Auto-reveal: if all players have answered, move to answer_revealed
    const { count: answerCount } = await supabase
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', questionId);

    const { count: playerCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', game.id);

    if (answerCount !== null && playerCount !== null && answerCount >= playerCount && playerCount > 0) {
      await supabase
        .from('games')
        .update({ status: 'answer_revealed', updated_at: new Date().toISOString() })
        .eq('id', game.id);
    }

    return NextResponse.json({ answer, isCorrect });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
