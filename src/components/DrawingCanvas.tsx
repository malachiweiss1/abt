'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

interface DrawingCanvasProps {
  onSubmit: (dataUrl: string) => Promise<void>;
  disabled?: boolean;
}

const COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#a16207', '#64748b', '#06b6d4',
];

type Tool = 'pencil' | 'marker' | 'eraser';

const BRUSH_SIZES = { S: 4, M: 12, L: 28 } as const;
type BrushSizeKey = keyof typeof BRUSH_SIZES;

const MAX_HISTORY = 20;

export default function DrawingCanvas({ onSubmit, disabled }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#000000');
  const [tool, setTool] = useState<Tool>('pencil');
  const [brushSize, setBrushSize] = useState<BrushSizeKey>('M');
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const historyRef = useRef<ImageData[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
  }, []);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || submitted) return;
    saveHistory();
    const pos = getCanvasPos(e);
    if (!pos) return;
    setIsDrawing(true);
    lastPosRef.current = pos;

    // Draw a dot on click/touch start
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (tool === 'eraser') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, BRUSH_SIZES[brushSize] / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = tool === 'marker' ? 0.6 : 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, BRUSH_SIZES[brushSize] / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, [disabled, submitted, saveHistory, getCanvasPos, tool, brushSize, color]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled || submitted) return;
    const pos = getCanvasPos(e);
    if (!pos || !lastPosRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.lineWidth = BRUSH_SIZES[brushSize];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
    } else if (tool === 'marker') {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = color;
    } else {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
    }

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();

    lastPosRef.current = pos;
  }, [isDrawing, disabled, submitted, getCanvasPos, tool, brushSize, color]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPosRef.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snapshot = historyRef.current.pop()!;
    ctx.putImageData(snapshot, 0, 0);
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveHistory();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [saveHistory]);

  const handleSubmit = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || submitting || submitted) return;
    setSubmitting(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await onSubmit(dataUrl);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, submitting, submitted]);

  return (
    <div className="flex flex-col gap-3 w-full" dir="rtl">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Color Swatches */}
        <div className="flex flex-wrap gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); setTool('pencil'); }}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                color === c && tool !== 'eraser' ? 'border-white scale-125' : 'border-transparent'
              }`}
              style={{ backgroundColor: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined }}
              title={c}
            />
          ))}
        </div>

        {/* Brush Sizes */}
        <div className="flex gap-1">
          {(Object.keys(BRUSH_SIZES) as BrushSizeKey[]).map(size => (
            <button
              key={size}
              onClick={() => setBrushSize(size)}
              className={`px-2 py-1 rounded-lg text-sm font-bold transition-colors ${
                brushSize === size
                  ? 'bg-white text-black'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Tools */}
        <div className="flex gap-1">
          <button
            onClick={() => setTool('pencil')}
            className={`px-2 py-1 rounded-lg text-sm transition-colors ${
              tool === 'pencil' ? 'bg-white text-black font-bold' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
            title="עיפרון"
          >✏️</button>
          <button
            onClick={() => setTool('marker')}
            className={`px-2 py-1 rounded-lg text-sm transition-colors ${
              tool === 'marker' ? 'bg-white text-black font-bold' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
            title="מרקר"
          >🖊️</button>
          <button
            onClick={() => setTool('eraser')}
            className={`px-2 py-1 rounded-lg text-sm transition-colors ${
              tool === 'eraser' ? 'bg-white text-black font-bold' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
            title="מחק"
          >🧹</button>
        </div>

        {/* Undo / Clear */}
        <button
          onClick={handleUndo}
          disabled={disabled || submitted}
          className="px-2 py-1 rounded-lg text-sm bg-white/20 text-white hover:bg-white/30 disabled:opacity-40"
          title="בטל"
        >↩️ ביטול</button>
        <button
          onClick={handleClear}
          disabled={disabled || submitted}
          className="px-2 py-1 rounded-lg text-sm bg-red-500/60 text-white hover:bg-red-600/60 disabled:opacity-40"
          title="נקה"
        >🗑️ נקה</button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={600}
        height={500}
        className="w-full rounded-2xl touch-none cursor-crosshair bg-white border-2 border-white/30"
        style={{ maxHeight: '55vh' }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={e => { e.preventDefault(); startDrawing(e); }}
        onTouchMove={e => { e.preventDefault(); draw(e); }}
        onTouchEnd={e => { e.preventDefault(); stopDrawing(); }}
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={disabled || submitted || submitting}
        className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors"
      >
        {submitting ? 'שולח...' : submitted ? '✓ נשלח!' : '🎨 שלח ציור'}
      </button>
    </div>
  );
}
