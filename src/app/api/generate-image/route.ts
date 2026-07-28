import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase/server';
import * as fs from 'fs';
import * as path from 'path';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { prompt, currentImageUrl } = await request.json();

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Get the image to edit: either the last generated image (refinement) or the source image
    let imageFile: File;
    if (currentImageUrl) {
      const res = await fetch(currentImageUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      imageFile = new File([buffer], 'current.png', { type: 'image/png' });
    } else {
      const sourcePath = path.join(process.cwd(), 'public', 'aviya_source_image.png');
      const buffer = fs.readFileSync(sourcePath);
      imageFile = new File([buffer], 'aviya_source_image.png', { type: 'image/png' });
    }

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: prompt.trim(),
      n: 1,
      size: '1024x1024',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: 'No image returned from OpenAI' }, { status: 500 });
    }

    // Upload to Supabase storage
    const imgBuffer = Buffer.from(b64, 'base64');
    const supabase = createServerClient();
    const filePath = `ai-images/${Date.now()}.png`;
    await supabase.storage
      .from('greetings')
      .upload(filePath, imgBuffer, { contentType: 'image/png', upsert: true });
    const { data: publicUrlData } = supabase.storage
      .from('greetings')
      .getPublicUrl(filePath);

    return NextResponse.json({ imageUrl: publicUrlData.publicUrl });
  } catch (err) {
    console.error('generate-image error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
