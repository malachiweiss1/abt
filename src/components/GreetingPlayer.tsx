'use client';

import { useRef, useState, useEffect } from 'react';

interface Greeting {
  playerName: string;
  text: string;
  voice?: string;
  answerId?: string;
  predictionId?: string;
  videoUrl?: string;
}

interface GreetingPlayerProps {
  greetings: Greeting[];
}

const VOICE_META: Record<string, { emoji: string; label: string; pitch: number; rate: number }> = {
  woman:    { emoji: '👩', label: 'אישה',  pitch: 1.6, rate: 1.0 },
  man:      { emoji: '👨', label: 'גבר',   pitch: 0.4, rate: 0.9 },
  announcer:{ emoji: '📣', label: 'קריין', pitch: 0.3, rate: 1.45 },
};

export default function GreetingPlayer({ greetings }: GreetingPlayerProps) {
  // Video URLs resolved from polling, keyed by answerId
  const [resolvedVideos, setResolvedVideos] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<string, 'polling' | 'failed'>>({});

  // Browser TTS state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const stopFlag = useRef(false);
  const pollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Poll for pending predictions
  useEffect(() => {
    greetings.forEach(g => {
      if (!g.predictionId || !g.answerId) return;
      if (g.videoUrl || resolvedVideos[g.answerId]) return; // already done
      if (pollingRefs.current[g.answerId]) return; // already polling

      setPendingStatus(prev => ({ ...prev, [g.answerId!]: 'polling' }));

      pollingRefs.current[g.answerId] = setInterval(async () => {
        try {
          const res = await fetch(`/api/video-status?predictionId=${g.predictionId}&answerId=${g.answerId}`);
          const data = await res.json();
          if (data.status === 'done' && data.video_url) {
            setResolvedVideos(prev => ({ ...prev, [g.answerId!]: data.video_url }));
            setPendingStatus(prev => { const n = { ...prev }; delete n[g.answerId!]; return n; });
            clearInterval(pollingRefs.current[g.answerId!]);
            delete pollingRefs.current[g.answerId!];
          } else if (data.status === 'failed') {
            setPendingStatus(prev => ({ ...prev, [g.answerId!]: 'failed' }));
            clearInterval(pollingRefs.current[g.answerId!]);
            delete pollingRefs.current[g.answerId!];
          }
        } catch { /* ignore poll errors */ }
      }, 5000);
    });

    return () => {
      Object.values(pollingRefs.current).forEach(clearInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetings]);

  const getHebrewVoice = () => {
    // Just pick the first available Hebrew voice; pitch/rate handles gender
    return voices.find(v => v.lang.startsWith('he')) || null;
  };

  const speakOne = (text: string, voiceType: string, index: number): Promise<void> =>
    new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'he-IL';
      const meta = VOICE_META[voiceType] || VOICE_META.woman;
      utt.pitch = meta.pitch;
      utt.rate = meta.rate;
      const voice = getHebrewVoice();
      if (voice) utt.voice = voice;
      utt.onstart = () => setPlayingIndex(index);
      utt.onend = () => { setPlayingIndex(null); resolve(); };
      utt.onerror = () => { setPlayingIndex(null); resolve(); };
      window.speechSynthesis.speak(utt);
    });

  const playAllAudio = async () => {
    stopFlag.current = false;
    setIsPlayingAll(true);
    for (let i = 0; i < greetings.length; i++) {
      if (stopFlag.current) break;
      const g = greetings[i];
      const vid = g.videoUrl || (g.answerId ? resolvedVideos[g.answerId] : undefined);
      if (!vid) {
        // Only speak audio for greetings without video
        await speakOne(g.text, g.voice || 'woman', i);
        if (!stopFlag.current) await new Promise(r => setTimeout(r, 700));
      }
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

  const hasAudioOnly = greetings.some(g => {
    const vid = g.videoUrl || (g.answerId ? resolvedVideos[g.answerId] : undefined);
    return !vid;
  });

  return (
    <div className="space-y-4 w-full">
      {hasAudioOnly && (
        <div className="flex gap-3">
          <button
            onClick={isPlayingAll ? stopAll : playAllAudio}
            className={`flex-1 font-bold py-3 rounded-xl text-lg transition-colors ${
              isPlayingAll ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isPlayingAll ? '■ עצור' : '▶ השמע ברכות קוליות'}
          </button>
        </div>
      )}

      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {greetings.map((g, i) => {
          const voiceType = g.voice || 'woman';
          const meta = VOICE_META[voiceType] || VOICE_META.woman;
          const videoUrl = g.videoUrl || (g.answerId ? resolvedVideos[g.answerId] : undefined);
          const status = g.answerId ? pendingStatus[g.answerId] : undefined;
          const isActive = playingIndex === i;

          return (
            <div
              key={i}
              className={`rounded-2xl p-4 transition-all ${
                isActive ? 'bg-yellow-400/30 border-2 border-yellow-400' : 'bg-white/15 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-2" dir="rtl">
                <span className="text-lg">{meta.emoji}</span>
                <p className="text-pink-200 text-sm font-semibold">{g.playerName}</p>
              </div>
              <p className="text-white text-base leading-snug italic mb-3" dir="rtl">"{g.text}"</p>

              {videoUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="w-full rounded-xl max-h-64 bg-black"
                />
              ) : status === 'polling' ? (
                <div className="flex items-center gap-2 text-yellow-300 text-sm animate-pulse">
                  <span>🎬</span><span>הוידאו מוכן בקרוב...</span>
                </div>
              ) : status === 'failed' ? (
                <button
                  onClick={() => isActive ? stopAll() : speakOne(g.text, voiceType, i)}
                  disabled={isPlayingAll && !isActive}
                  className="bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-lg"
                >
                  {isActive ? '■' : '▶ השמע'}
                </button>
              ) : (
                <button
                  onClick={() => isActive ? stopAll() : speakOne(g.text, voiceType, i)}
                  disabled={isPlayingAll && !isActive}
                  className="bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-lg"
                >
                  {isActive ? '■' : '▶ השמע'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
