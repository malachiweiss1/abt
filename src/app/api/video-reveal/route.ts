import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// Public endpoint — called automatically by the game screen when a video ends.
// No admin auth required; it only transitions question_active → video_revealed
// for video_question type (safe to call without auth).
export async function POST(request: NextRequest) {
  try {
    const { gameCode } = await request.json();
    const supabase = createServerClient();

    const { data: game } = await supabase
      .from('games')
      .select('id, status, current_question_id')
      .eq('code', gameCode)
      .single();

    if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 });

    // Only transition if still in question_active; ignore if already moved on
    if (game.status !== 'question_active') {
      return NextResponse.json({ skipped: true });
    }

    // Verify this is actually a video question
    const { data: question } = await supabase
      .from('questions')
      .select('question_type')
      .eq('id', game.current_question_id)
      .single();

    if (question?.question_type !== 'video_question') {
      return NextResponse.json({ skipped: true });
    }

    await supabase
      .from('games')
      .update({ status: 'video_revealed', updated_at: new Date().toISOString() })
      .eq('id', game.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
