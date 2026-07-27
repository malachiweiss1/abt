'use client';

import { useState, useEffect } from 'react';

interface TimerProps {
  startedAt: string;
  timeLimitSeconds: number;
  onExpire?: () => void;
}

export default function Timer({ startedAt, timeLimitSeconds, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState(timeLimitSeconds);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const rem = Math.max(0, timeLimitSeconds - elapsed);
      setRemaining(Math.ceil(rem));

      if (rem <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [startedAt, timeLimitSeconds, onExpire]);

  const percentage = (remaining / timeLimitSeconds) * 100;
  const isUrgent = remaining <= 5;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-4xl font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
        {remaining}
      </div>
      <div className="w-full bg-white/20 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-100 ${isUrgent ? 'bg-red-400' : 'bg-green-400'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
