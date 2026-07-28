import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataUrl, answerId } = body as { dataUrl: string; answerId: string };

    if (!dataUrl || !answerId) {
      return NextResponse.json({ error: 'Missing dataUrl or answerId' }, { status: 400 });
    }

    // Strip the data URL prefix (e.g. "data:image/png;base64,")
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const supabase = createServerClient();

    const filePath = `drawings/${Date.now()}-${answerId}.png`;

    const { error: uploadError } = await supabase.storage
      .from('greetings')
      .upload(filePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from('greetings')
      .getPublicUrl(filePath);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err) {
    console.error('upload-drawing error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
