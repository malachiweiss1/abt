import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createServerClient } from '@/lib/supabase/server';
import Replicate from 'replicate';

const TTS_VOICES: Record<string, string> = {
  woman: 'he-IL-HilaNeural',
  man:   'he-IL-AvriNeural',
};

async function generateAudio(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    TTS_VOICES[voice] || TTS_VOICES.woman,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  );
  const { audioStream } = tts.toStream(text, {});
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('end', resolve);
    audioStream.on('error', reject);
  });
  return Buffer.concat(chunks);
}

async function uploadToStorage(
  supabase: ReturnType<typeof createServerClient>,
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from('greetings')
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: urlData } = supabase.storage.from('greetings').getPublicUrl(path);
  return urlData.publicUrl;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const answerId  = formData.get('answerId') as string;
    const text      = formData.get('text') as string;
    const voice     = formData.get('voice') as string;

    if (!imageFile || !answerId || !text) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServerClient();
    const ts = Date.now();

    // Upload photo
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const photoUrl = await uploadToStorage(
      supabase,
      `${ts}-${answerId}-photo.jpg`,
      imageBuffer,
      imageFile.type || 'image/jpeg',
    );

    // Generate & upload TTS audio
    const audioBuffer = await generateAudio(text, voice);
    const audioUrl = await uploadToStorage(
      supabase,
      `${ts}-${answerId}-audio.mp3`,
      audioBuffer,
      'audio/mpeg',
    );

    // Fetch latest SadTalker version from Replicate
    const versionsRes = await fetch('https://api.replicate.com/v1/models/cjwbw/sadtalker/versions', {
      headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
    });
    const versionsData = await versionsRes.json();
    const latestVersion = versionsData.results?.[0]?.id;
    if (!latestVersion) throw new Error('Could not fetch SadTalker version');

    // Start Replicate SadTalker prediction
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const prediction = await replicate.predictions.create({
      version: latestVersion,
      input: {
        source_image: photoUrl,
        driven_audio: audioUrl,
        still: true,
        preprocess: 'crop',
        size: 256,
      },
    });

    // Save prediction_id into answer_value
    const { data: existing } = await supabase
      .from('answers')
      .select('answer_value')
      .eq('id', answerId)
      .single();

    if (existing) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(existing.answer_value); } catch { /* plain text */ }
      parsed.prediction_id = prediction.id;
      parsed.photo_url = photoUrl;
      await supabase.from('answers').update({ answer_value: JSON.stringify(parsed) }).eq('id', answerId);
    }

    return NextResponse.json({ prediction_id: prediction.id });
  } catch (err) {
    console.error('start-video error:', err);
    return NextResponse.json({ error: 'Failed to start video generation' }, { status: 500 });
  }
}
