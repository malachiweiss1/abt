import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { createServerClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { prompt, currentImageUrl } = await request.json();

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const sourceImageUrl =
      currentImageUrl || `${process.env.NEXT_PUBLIC_APP_URL}/aviya_source_image.png`;

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

    const output = await replicate.run('black-forest-labs/flux-kontext-dev', {
      input: {
        prompt: prompt.trim(),
        input_image: sourceImageUrl,
        output_format: 'jpg',
        safety_tolerance: 6,
      },
    });

    const rawUrl = Array.isArray(output) ? String(output[0]) : String(output);

    if (!rawUrl || rawUrl === 'undefined') {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Upload to Supabase storage so the URL doesn't expire
    const imgRes = await fetch(rawUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const supabase = createServerClient();
    const filePath = `ai-images/${Date.now()}.jpg`;
    await supabase.storage
      .from('greetings')
      .upload(filePath, imgBuffer, { contentType: 'image/jpeg', upsert: true });
    const { data: publicUrlData } = supabase.storage
      .from('greetings')
      .getPublicUrl(filePath);

    return NextResponse.json({ imageUrl: publicUrlData.publicUrl });
  } catch (err) {
    console.error('generate-image error:', err);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}
