'use client';

import { useRef, useState } from 'react';

interface Greeting {
  playerName: string;
  text: string;
  voice?: string;
}

interface GreetingPlayerProps {
  greetings: Greeting[];
}

const VOICE_META: Record<string, { emoji: string; label: string }> = {
  woman:    { emoji: '👩', label: 'אישה' },
  man:      { emoji: '👨', label: 'גבר' },
  child:    { emoji: '👦', label: 'ילד' },
  announcer:{ emoji: '📣', label: 'קריין' },
};

function ttsUrl(text: string, voice: string) {
  return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
}

export default function GreetingPlayer({ greetings }: GreetingPlayerProps) {
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const stopFlag = useRef(false);

  const playAll = async () => {
    stopFlag.current = false;
    setIsPlayingAll(true);
    for (let i = 0; i < greetings.length; i++) {
      if (stopFlag.current) break;
      const audio = audioRefs.current[i];
      if (!audio) continue;
      audio.currentTime = 0;
      setPlayingIndex(i);
      await new Promise<void>((resolve) => {
        const onEnd = () => { audio.removeEventListener('ended', onEnd); audio.removeEventListener('error', onEnd); resolve(); };
        audio.addEventListener('ended', onEnd);
        audio.addEventListener('error', onEnd);
        audio.play().catch(resolve);
      });
      if (!stopFlag.current) await new Promise(r => setTimeout(r, 700));
    }
    setPlayingIndex(null);
    setIsPlayingAll(false);
  };

  const stopAll = () => {
    stopFlag.current = true;
    audioRefs.current.forEach(a => { if (a) { a.pause(); a.currentTime = 0; } });
    setPlayingIndex(null);
    setIsPlayingAll(false);
  };

  if (greetings.length === 0) {
    return <p className="text-pink-200 text-center">אין ברכות עדיין...</p>;
  }

  return (
    <div className="space-y-4 w-full">
      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={isPlayingAll ? stopAll : playAll}
          className={`flex-1 font-bold py-3 rounded-xl text-lg transition-colors ${
            isPlayingAll
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isPlayingAll ? '■ עצור' : '▶ השמע את כולם'}
        </button>
      </div>

      {/* Individual greetings */}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {greetings.map((g, i) => {
          const voice = g.voice || 'woman';
          const meta = VOICE_META[voice] || VOICE_META.woman;
          return (
            <div
              key={i}
              className={`rounded-2xl p-4 transition-all ${
                playingIndex === i
                  ? 'bg-yellow-400/30 border-2 border-yellow-400 scale-[1.01]'
                  : 'bg-white/15 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{meta.emoji}</span>
                <p className="text-pink-200 text-sm font-semibold">{g.playerName}</p>
                <span className="text-white/40 text-xs">({meta.label})</span>
              </div>
              <p className="text-white text-lg leading-snug mb-3 italic">"{g.text}"</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio
                ref={el => { audioRefs.current[i] = el; }}
                src={ttsUrl(g.text, voice)}
                controls
                preload="none"
                className="w-full h-10"
                onPlay={() => setPlayingIndex(i)}
                onEnded={() => setPlayingIndex(null)}
                onPause={() => { if (playingIndex === i) setPlayingIndex(null); }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
