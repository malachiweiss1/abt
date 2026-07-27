import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const VOICES: Record<string, { voice: string; prosody: Record<string, unknown> }> = {
  woman:    { voice: 'he-IL-HilaNeural', prosody: {} },
  man:      { voice: 'he-IL-AvriNeural', prosody: {} },
  child:    { voice: 'he-IL-HilaNeural', prosody: { pitch: 'high', rate: 'fast' } },
  announcer:{ voice: 'he-IL-AvriNeural', prosody: { rate: 'fast', volume: 'x-LOUD' } },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text') || '';
  const voiceType = searchParams.get('voice') || 'woman';

  if (!text.trim()) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  const config = VOICES[voiceType] || VOICES.woman;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(config.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text, config.prosody);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    const audio = Buffer.concat(chunks);

    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('TTS error:', err);
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
  }
}
