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
    const { action, gameCode } = await request.json();
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
        // Delete all answers
        await supabase.from('answers').delete().eq('game_id', game.id);
        // Reset player scores
        await supabase.from('players').update({ total_score: 0 }).eq('game_id', game.id);
        // Reset game state
        await supabase
          .from('games')
          .update({
            status: 'waiting',
            current_question_id: null,
            question_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      case 'reset_players': {
        // Delete all answers first (foreign key constraint)
        await supabase.from('answers').delete().eq('game_id', game.id);
        // Delete all players — forces everyone to sign in again
        await supabase.from('players').delete().eq('game_id', game.id);
        // Reset game state to waiting
        await supabase
          .from('games')
          .update({
            status: 'waiting',
            current_question_id: null,
            question_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', game.id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
