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

const VOICE_META: Record<string, { emoji: string; label: string }> = {
  woman:    { emoji: '👩', label: 'אישה' },
  man:      { emoji: '👨', label: 'גבר' },
  announcer:{ emoji: '📣', label: 'קריין' },
};

function ttsUrl(text: string, voice: string) {
  return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
}

export default function GreetingPlayer({ greetings }: GreetingPlayerProps) {
  const [resolvedVideos, setResolvedVideos] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<string, 'polling' | 'failed'>>({});
  const pollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Poll for pending predictions — fix: clear both interval AND key on cleanup
  useEffect(() => {
    greetings.forEach(g => {
      if (!g.predictionId || !g.answerId) return;
      if (g.videoUrl || resolvedVideos[g.answerId]) return;
      if (pollingRefs.current[g.answerId]) return; // already polling this one

      const answerId = g.answerId;
      const predictionId = g.predictionId;

      setPendingStatus(prev => ({ ...prev, [answerId]: 'polling' }));

      pollingRefs.current[answerId] = setInterval(async () => {
        try {
          const res = await fetch(`/api/video-status?predictionId=${predictionId}&answerId=${answerId}`);
          const data = await res.json();
          if (data.status === 'done' && data.video_url) {
            setResolvedVideos(prev => ({ ...prev, [answerId]: data.video_url }));
            setPendingStatus(prev => { const n = { ...prev }; delete n[answerId]; return n; });
            clearInterval(pollingRefs.current[answerId]);
            delete pollingRefs.current[answerId]; // ← fix: also remove the key
          } else if (data.status === 'failed') {
            setPendingStatus(prev => ({ ...prev, [answerId]: 'failed' }));
            clearInterval(pollingRefs.current[answerId]);
            delete pollingRefs.current[answerId];
          }
        } catch { /* ignore transient errors */ }
      }, 4000);
    });

    return () => {
      // Fix: clear AND delete all keys so the effect can restart them if needed
      Object.entries(pollingRefs.current).forEach(([key, timer]) => {
        clearInterval(timer);
        delete pollingRefs.current[key];
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetings]);

  if (greetings.length === 0) {
    return <p className="text-pink-200 text-center">אין ברכות עדיין...</p>;
  }

  return (
    <div className="space-y-4 w-full">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {greetings.map((g, i) => {
          const voiceType = g.voice || 'woman';
          const meta = VOICE_META[voiceType] || VOICE_META.woman;
          const videoUrl = g.videoUrl || (g.answerId ? resolvedVideos[g.answerId] : undefined);
          const status = g.answerId ? pendingStatus[g.answerId] : undefined;

          return (
            <div key={i} className="rounded-2xl p-4 bg-white/15 border border-white/10">
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
              ) : (
                /* No video — use server-side TTS for proper male/female Hebrew voices */
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio
                  key={`${i}-${voiceType}`}
                  src={ttsUrl(g.text, voiceType)}
                  controls
                  preload="none"
                  className="w-full h-10"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
