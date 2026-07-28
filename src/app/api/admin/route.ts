import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

function verifyAdmin(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password');
  return adminPassword === process.env.ADMIN_PASSWORD;
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, gameCode } = body;
    const supabase = createServerClient();

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('code', gameCode)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'משחק לא נמצא' }, { status: 404 });
    }

    const { data: questions } = await supabase
      .from('questions')
      .select('id, question_order')
      .eq('game_id', game.id)
      .order('question_order');

    switch (action) {
      case 'ping': {
        // Auth-only check — does not modify any game state
        return NextResponse.json({ success: true });
      }

      case 'start_game': {
        await supabase
          .from('games')
          .update({ status: 'waiting', updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'start_question': {
        // Find next question
        let nextQuestion;
        if (!game.current_question_id) {
          nextQuestion = questions?.[0];
        } else {
          const currentIndex = questions?.findIndex(q => q.id === game.current_question_id) ?? -1;
          nextQuestion = questions?.[currentIndex + 1];
        }

        if (!nextQuestion) {
          return NextResponse.json({ error: 'אין שאלות נוספות' }, { status: 400 });
        }

        await supabase
          .from('games')
          .update({
            status: 'question_active',
            current_question_id: nextQuestion.id,
            question_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'reveal_answer': {
        await supabase
          .from('games')
          .update({ status: 'answer_revealed', updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'show_leaderboard': {
        await supabase
          .from('games')
          .update({ status: 'leaderboard', updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'next_question': {
        // Find next question after current
        const currentIndex = questions?.findIndex(q => q.id === game.current_question_id) ?? -1;
        const nextQuestion = questions?.[currentIndex + 1];

        if (!nextQuestion) {
          // No more questions - finish game
          await supabase
            .from('games')
            .update({ status: 'finished', updated_at: new Date().toISOString() })
            .eq('id', game.id);
          return NextResponse.json({ success: true, finished: true });
        }

        await supabase
          .from('games')
          .update({
            status: 'question_active',
            current_question_id: nextQuestion.id,
            question_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'finish_game': {
        await supabase
          .from('games')
          .update({ status: 'finished', updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'reset_game': {
        // 1. Reset game state first (most critical)
        const { error: gameErr } = await supabase
          .from('games')
          .update({
            status: 'waiting',
            current_question_id: null,
            question_started_at: null,
            greeting_index: -1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        if (gameErr) {
          console.error('reset_game games update failed:', gameErr);
          return NextResponse.json({ error: `reset failed: ${gameErr.message}` }, { status: 500 });
        }

        // 2. Reset player scores
        const { error: playersErr } = await supabase
          .from('players').update({ total_score: 0 }).eq('game_id', game.id);
        if (playersErr) console.error('reset_game players update failed:', playersErr);

        // 3. Delete answers — use question_id IN (...) to avoid depending on game_id column
        const { data: qs } = await supabase.from('questions').select('id').eq('game_id', game.id);
        if (qs && qs.length > 0) {
          const { error: answersErr } = await supabase
            .from('answers').delete().in('question_id', qs.map(q => q.id));
          if (answersErr) console.error('reset_game answers delete failed:', answersErr);
        }

        return NextResponse.json({ success: true });
      }

      case 'reset_players': {
        // Delete answers via question_id
        const { data: qs2 } = await supabase.from('questions').select('id').eq('game_id', game.id);
        if (qs2 && qs2.length > 0) {
          await supabase.from('answers').delete().in('question_id', qs2.map(q => q.id));
        }
        // Delete all players — forces everyone to sign in again
        await supabase.from('players').delete().eq('game_id', game.id);
        // Reset game state to waiting
        const { error: gameErr2 } = await supabase
          .from('games')
          .update({
            status: 'waiting',
            current_question_id: null,
            question_started_at: null,
            greeting_index: -1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        if (gameErr2) {
          console.error('reset_players games update failed:', gameErr2);
          return NextResponse.json({ error: `reset failed: ${gameErr2.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      case 'greeting_start':
      case 'greeting_restart': {
        await supabase
          .from('games')
          .update({ greeting_index: 0, updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'greeting_next': {
        const { count } = await supabase
          .from('answers')
          .select('*', { count: 'exact', head: true })
          .eq('question_id', game.current_question_id);
        const total = count ?? 0;
        const current = game.greeting_index ?? -1;
        const next = current < 0 ? 0 : Math.min(current + 1, total - 1);
        await supabase
          .from('games')
          .update({ greeting_index: next, updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'greeting_prev': {
        const current = game.greeting_index ?? 0;
        const prev = Math.max(current - 1, 0);
        await supabase
          .from('games')
          .update({ greeting_index: prev, updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'greeting_stop': {
        await supabase
          .from('games')
          .update({ greeting_index: -1, updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'greeting_goto': {
        const index = body.index as number;
        await supabase
          .from('games')
          .update({ greeting_index: index, updated_at: new Date().toISOString() })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'score_drawing': {
        const answerId = body.answerId as string;
        const score = body.score as number;

        // Fetch the answer
        const { data: answer, error: answerError } = await supabase
          .from('answers')
          .select('player_id, base_score')
          .eq('id', answerId)
          .single();

        if (answerError || !answer) {
          return NextResponse.json({ error: 'תשובה לא נמצאה' }, { status: 404 });
        }

        // Check if already scored
        if ((answer.base_score ?? 0) > 0) {
          return NextResponse.json({ alreadyScored: true });
        }

        const points = score * 100;

        // Update the answer
        await supabase
          .from('answers')
          .update({ base_score: points, total_score: points })
          .eq('id', answerId);

        // Fetch current player total_score
        const { data: playerData } = await supabase
          .from('players')
          .select('total_score')
          .eq('id', answer.player_id)
          .single();

        const currentTotal = playerData?.total_score ?? 0;

        // Update player total
        await supabase
          .from('players')
          .update({ total_score: currentTotal + points })
          .eq('id', answer.player_id);

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
