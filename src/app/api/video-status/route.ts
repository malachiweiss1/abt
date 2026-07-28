import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const predictionId = searchParams.get('predictionId');
  const answerId     = searchParams.get('answerId');

  if (!predictionId) {
    return NextResponse.json({ error: 'Missing predictionId' }, { status: 400 });
  }

  const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
  });
  const prediction = await res.json();

  if (prediction.status === 'succeeded' && prediction.output) {
    const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

    // Save video_url into answer_value
    if (answerId) {
      const supabase = createServerClient();
      const { data: existing } = await supabase
        .from('answers').select('answer_value').eq('id', answerId).single();
      if (existing) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(existing.answer_value); } catch { /* plain text */ }
        if (!parsed.video_url) {
          parsed.video_url = videoUrl;
          await supabase.from('answers').update({ answer_value: JSON.stringify(parsed) }).eq('id', answerId);
        }
      }
    }

    return NextResponse.json({ status: 'done', video_url: videoUrl });
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    return NextResponse.json({ status: 'failed', error: prediction.error });
  }

  return NextResponse.json({ status: 'pending' });
}
