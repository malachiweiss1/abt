import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { gameCode, displayName, playerId } = await request.json();

    if (!displayName?.trim()) {
      return NextResponse.json({ error: 'שם השחקן לא יכול להיות ריק' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Find game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, status')
      .eq('code', gameCode)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'קוד משחק לא תקין' }, { status: 404 });
    }

    // Check if player ID already exists (returning player)
    if (playerId) {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .eq('game_id', game.id)
        .single();

      if (existingPlayer) {
        // Update last_seen_at
        await supabase
          .from('players')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', playerId);
        return NextResponse.json({ player: existingPlayer });
      }
    }

    // Check for duplicate name
    const { data: nameExists } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', game.id)
      .eq('display_name', displayName.trim())
      .single();

    if (nameExists) {
      return NextResponse.json({ error: 'השם הזה כבר תפוס, בחר שם אחר' }, { status: 409 });
    }

    // Create new player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        display_name: displayName.trim(),
        total_score: 0,
        joined_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (playerError) {
      return NextResponse.json({ error: 'שגיאה בהצטרפות למשחק' }, { status: 500 });
    }

    return NextResponse.json({ player });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
