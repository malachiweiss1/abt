'use client';

import { useState, useEffect } from 'react';

interface Greeting {
  playerName: string;
  text: string;
}

interface GreetingPlayerProps {
  greetings: Greeting[];
}

export default function GreetingPlayer({ greetings }: GreetingPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSupported(false);
      return;
    }

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      // Prefer Hebrew voices; fall back to showing all
      const he = all.filter(v => v.lang.startsWith('he'));
      setVoices(he.length > 0 ? he : all);
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const getVoice = () =>
    voices.find(v => v.name === selectedVoiceName) ?? voices[0] ?? null;

  const speakOne = (text: string, index: number): Promise<void> =>
    new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'he-IL';
      const voice = getVoice();
      if (voice) utt.voice = voice;
      utt.rate = 0.95;
      utt.onstart = () => setPlayingIndex(index);
      utt.onend = () => { setPlayingIndex(null); resolve(); };
      utt.onerror = () => { setPlayingIndex(null); resolve(); };
      window.speechSynthesis.speak(utt);
    });

  const playAll = async () => {
    for (let i = 0; i < greetings.length; i++) {
      await speakOne(greetings[i].text, i);
      // Short pause between greetings
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setPlayingIndex(null);
  };

  if (!supported) {
    return (
      <p className="text-yellow-300 text-center">
        הדפדפן שלך אינו תומך בהשמעת טקסט. נסה בכרום.
      </p>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* Voice selector */}
      {voices.length > 1 && (
        <div className="flex flex-col gap-1">
          <label className="text-pink-200 text-sm">בחר קול:</label>
          <select
            value={selectedVoiceName}
            onChange={e => setSelectedVoiceName(e.target.value)}
            className="bg-white/20 text-white rounded-xl p-2 border border-white/30 text-sm"
          >
            {voices.map(v => (
              <option key={v.name} value={v.name} className="text-black bg-white">
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={playAll}
          disabled={playingIndex !== null || greetings.length === 0}
          className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg"
        >
          ▶ השמע את כולם
        </button>
        <button
          onClick={stop}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-xl text-lg"
        >
          ■
        </button>
      </div>

      {/* Individual greetings */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {greetings.map((g, i) => (
          <div
            key={i}
            className={`rounded-2xl p-4 flex items-start gap-3 transition-all ${
              playingIndex === i
                ? 'bg-yellow-400/30 border-2 border-yellow-400 scale-[1.02]'
                : 'bg-white/15'
            }`}
          >
            <div className="flex-1">
              <p className="text-pink-200 text-xs mb-1">{g.playerName}</p>
              <p className="text-white text-lg leading-snug">{g.text}</p>
            </div>
            <button
              onClick={() => speakOne(g.text, i)}
              disabled={playingIndex !== null}
              className="shrink-0 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl px-3 py-2 text-lg"
            >
              {playingIndex === i ? '🔊' : '▶'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
