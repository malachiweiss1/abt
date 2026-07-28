'use client';

import { useRef, useState, useEffect } from 'react';

interface Greeting {
  playerName: string;
  text: string;
  voice?: string;
}

interface GreetingPlayerProps {
  greetings: Greeting[];
}

const VOICE_META: Record<string, { emoji: string; label: string; pitch: number; rate: number }> = {
  woman:    { emoji: '👩', label: 'אישה',  pitch: 1.1, rate: 0.9 },
  man:      { emoji: '👨', label: 'גבר',   pitch: 0.7, rate: 0.9 },
  child:    { emoji: '👦', label: 'ילד',   pitch: 1.9, rate: 0.7 },
  announcer:{ emoji: '📣', label: 'קריין', pitch: 0.6, rate: 1.45 },
};

export default function GreetingPlayer({ greetings }: GreetingPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const stopFlag = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const getBestVoice = (voiceType: string) => {
    const heVoices = voices.filter(v => v.lang.startsWith('he'));
    if (voiceType === 'man') {
      return (
        heVoices.find(v => /avri|male|aviv/i.test(v.name)) ||
        heVoices[heVoices.length - 1] ||
        null
      );
    }
    return (
      heVoices.find(v => /hila|female/i.test(v.name)) ||
      heVoices[0] ||
      null
    );
  };

  const speakOne = (text: string, voiceType: string, index: number): Promise<void> =>
    new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'he-IL';
      const meta = VOICE_META[voiceType] || VOICE_META.woman;
      utt.pitch = meta.pitch;
      utt.rate = meta.rate;
      const voice = getBestVoice(voiceType);
      if (voice) utt.voice = voice;
      utt.onstart = () => setPlayingIndex(index);
      utt.onend = () => { setPlayingIndex(null); resolve(); };
      utt.onerror = () => { setPlayingIndex(null); resolve(); };
      window.speechSynthesis.speak(utt);
    });

  const playAll = async () => {
    stopFlag.current = false;
    setIsPlayingAll(true);
    for (let i = 0; i < greetings.length; i++) {
      if (stopFlag.current) break;
      const g = greetings[i];
      await speakOne(g.text, g.voice || 'woman', i);
      if (!stopFlag.current) await new Promise(r => setTimeout(r, 700));
    }
    setIsPlayingAll(false);
    setPlayingIndex(null);
  };

  const stopAll = () => {
    stopFlag.current = true;
    window.speechSynthesis.cancel();
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
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {greetings.map((g, i) => {
          const voiceType = g.voice || 'woman';
          const meta = VOICE_META[voiceType] || VOICE_META.woman;
          const isActive = playingIndex === i;
          return (
            <div
              key={i}
              className={`rounded-2xl p-4 flex items-start gap-3 transition-all ${
                isActive
                  ? 'bg-yellow-400/30 border-2 border-yellow-400 scale-[1.01]'
                  : 'bg-white/15 border border-white/10'
              }`}
            >
              <div className="flex-1" dir="rtl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{meta.emoji}</span>
                  <p className="text-pink-200 text-sm font-semibold">{g.playerName}</p>
                  <span className="text-white/40 text-xs">({meta.label})</span>
                </div>
                <p className="text-white text-lg leading-snug italic">"{g.text}"</p>
              </div>
              <button
                onClick={() => isActive ? stopAll() : speakOne(g.text, voiceType, i)}
                disabled={isPlayingAll && !isActive}
                className="shrink-0 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white rounded-xl px-3 py-2 text-xl"
              >
                {isActive ? '■' : '▶'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
