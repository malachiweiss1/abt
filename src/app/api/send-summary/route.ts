import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import nodemailer from 'nodemailer';

export const maxDuration = 60;

const RECIPIENT = 'malachiweiss1@gmail.com';
const SMTP_USER = 'malachiweiss1@gmail.com';
const SMTP_PASS = 'refq ghpt hbue movk';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'בחירה מרובה',
  free_text_greeting: 'ברכה אישית',
  drawing_contest: 'תחרות ציור',
  ai_image_contest: 'תמונת AI',
  true_false_rapid: 'נכון / לא נכון',
  meme_contest: 'תחרות ממים',
  video_question: 'שאלת סרטון',
};

async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins} דקות ${secs} שניות`;
}

export async function POST(request: NextRequest) {
  try {
    const { gameCode } = await request.json();
    const supabase = createServerClient();

    // ── 1. Fetch core game data ──────────────────────────────────────────
    const { data: game } = await supabase.from('games').select('*').eq('code', gameCode).single();
    if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 });

    const { data: players } = await supabase
      .from('players').select('*').eq('game_id', game.id).order('total_score', { ascending: false });

    const { data: questions } = await supabase
      .from('questions').select('*').eq('game_id', game.id).order('question_order');

    const questionIds = (questions ?? []).map((q) => q.id);
    const { data: answers } = questionIds.length
      ? await supabase.from('answers').select('*').in('question_id', questionIds)
      : { data: [] };

    const playerMap: Record<string, string> = {};
    for (const p of players ?? []) playerMap[p.id] = p.display_name;

    // ── 2. Compute timing ────────────────────────────────────────────────
    const gameStart = game.created_at ? new Date(game.created_at) : null;
    const gameEnd = game.updated_at ? new Date(game.updated_at) : new Date();
    const duration = gameStart ? gameEnd.getTime() - gameStart.getTime() : 0;

    // ── 3. Build attachments list ────────────────────────────────────────
    interface Attachment { filename: string; content: Buffer }
    const attachments: Attachment[] = [];

    // Collect image/video URLs per question type
    const greetingTexts: Array<{ player: string; text: string; videoUrl?: string }> = [];

    for (const q of questions ?? []) {
      const qAnswers = (answers ?? []).filter((a) => a.question_id === q.id && a.answer_value !== '__skip__');

      if (q.question_type === 'free_text_greeting') {
        for (const a of qAnswers) {
          let text = a.answer_value;
          let videoUrl: string | undefined;
          try {
            const p = JSON.parse(a.answer_value);
            text = p.text || text;
            videoUrl = p.video_url;
          } catch { /* plain */ }
          greetingTexts.push({ player: playerMap[a.player_id] ?? '?', text, videoUrl });
        }
      }

      if (q.question_type === 'ai_image_contest') {
        for (const a of qAnswers) {
          const url = a.answer_value;
          if (!url.startsWith('http')) continue;
          const buf = await downloadFile(url);
          if (buf) attachments.push({ filename: `ai_${playerMap[a.player_id] ?? a.player_id}.png`, content: buf });
        }
      }

      if (q.question_type === 'drawing_contest') {
        for (const a of qAnswers) {
          const url = a.answer_value;
          if (!url.startsWith('http')) continue;
          const buf = await downloadFile(url);
          if (buf) attachments.push({ filename: `drawing_${playerMap[a.player_id] ?? a.player_id}.png`, content: buf });
        }
      }

      if (q.question_type === 'meme_contest') {
        for (const a of qAnswers) {
          try {
            const memes: Array<{ imageUrl: string; caption: string }> = JSON.parse(a.answer_value);
            for (let i = 0; i < memes.length; i++) {
              const imgPath = memes[i].imageUrl; // local /images/xxx.png
              if (imgPath.startsWith('/images/')) {
                // local public file — read from filesystem
                const { readFileSync } = await import('fs');
                const { join } = await import('path');
                try {
                  const buf = readFileSync(join(process.cwd(), 'public', imgPath));
                  attachments.push({ filename: `meme_${playerMap[a.player_id] ?? 'player'}_${i + 1}.png`, content: buf });
                } catch { /* skip */ }
              }
            }
          } catch { /* skip */ }
        }
      }
    }

    // ── 4. Build HTML body ───────────────────────────────────────────────
    const leaderboardRows = (players ?? []).map((p, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9f0ff' : '#fff'}">
        <td style="padding:8px 12px;font-weight:bold">${i + 1}</td>
        <td style="padding:8px 12px">${p.display_name}</td>
        <td style="padding:8px 12px;font-weight:bold;color:#7c3aed">${p.total_score}</td>
      </tr>`).join('');

    let questionsHtml = '';
    for (const q of questions ?? []) {
      const qAnswers = (answers ?? []).filter((a) => a.question_id === q.id);
      const submitted = qAnswers.filter((a) => a.answer_value !== '__skip__').length;
      const correct = qAnswers.filter((a) => a.is_correct).length;
      const typeLabel = QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type;

      questionsHtml += `
        <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#7c3aed;color:white;padding:8px 14px;font-weight:bold">
            שאלה ${q.question_order}: ${typeLabel}
          </div>
          <div style="padding:10px 14px;font-size:14px">
            <p style="margin:4px 0"><strong>שאלה:</strong> ${q.question_text || typeLabel}</p>
            ${q.correct_answer ? `<p style="margin:4px 0;color:green"><strong>תשובה נכונה:</strong> ${q.correct_answer}</p>` : ''}
            <p style="margin:4px 0"><strong>הגישו תשובה:</strong> ${submitted} / ${(players ?? []).length}</p>
            ${q.question_type === 'multiple_choice' || q.question_type === 'video_question' ? `<p style="margin:4px 0"><strong>ענו נכון:</strong> ${correct}</p>` : ''}
          </div>
          ${q.question_type !== 'meme_contest' && q.question_type !== 'drawing_contest' && q.question_type !== 'ai_image_contest' ? `
          <table style="width:100%;border-top:1px solid #e5e7eb;font-size:13px">
            ${qAnswers.filter(a => a.answer_value !== '__skip__').map(a => {
              const player = playerMap[a.player_id] ?? '?';
              let display = a.answer_value;
              if (q.question_type === 'free_text_greeting') {
                try { const p = JSON.parse(a.answer_value); display = p.text || display; } catch { /* */ }
              }
              if (q.question_type === 'true_false_rapid') {
                try { const p = JSON.parse(a.answer_value); display = `${p.correctCount ?? 0} נכון מתוך ${p.answers?.length ?? 0}`; } catch { /* */ }
              }
              return `<tr style="border-top:1px solid #f3f4f6">
                <td style="padding:5px 14px;width:35%">${player}</td>
                <td style="padding:5px 14px">${display}</td>
                <td style="padding:5px 14px;color:${a.is_correct ? 'green' : '#999'}">${a.is_correct ? '✓' : ''}</td>
              </tr>`;
            }).join('')}
          </table>` : ''}
        </div>`;
    }

    let greetingsHtml = '';
    if (greetingTexts.length) {
      greetingsHtml = `<h2 style="color:#7c3aed">💌 ברכות אישיות</h2><table style="width:100%;border-collapse:collapse;font-size:14px">
        ${greetingTexts.map(g => `
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 12px;font-weight:bold;width:30%">${g.player}</td>
            <td style="padding:8px 12px">${g.text}</td>
            <td style="padding:8px 12px">${g.videoUrl ? `<a href="${g.videoUrl}" style="color:#7c3aed">▶ סרטון</a>` : ''}</td>
          </tr>`).join('')}
      </table>`;
    }

    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#1f2937;direction:rtl}table{border-collapse:collapse;width:100%}</style></head>
<body style="max-width:800px;margin:0 auto;padding:20px">

  <div style="background:linear-gradient(135deg,#7c3aed,#ec4899);color:white;padding:30px;border-radius:12px;text-align:center;margin-bottom:30px">
    <h1 style="margin:0;font-size:28px">🎂 כמה אתם מכירים את אביה? 🎂</h1>
    <p style="margin:10px 0 0;opacity:0.9">סיכום משחק מלא — קוד: ${gameCode}</p>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
    <div style="flex:1;min-width:160px;background:#f5f3ff;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:32px;font-weight:bold;color:#7c3aed">${(players ?? []).length}</div>
      <div style="color:#6b7280">שחקנים</div>
    </div>
    <div style="flex:1;min-width:160px;background:#f5f3ff;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:32px;font-weight:bold;color:#7c3aed">${(questions ?? []).length}</div>
      <div style="color:#6b7280">שאלות</div>
    </div>
    <div style="flex:1;min-width:160px;background:#f5f3ff;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:32px;font-weight:bold;color:#7c3aed">${duration ? formatDuration(duration) : 'N/A'}</div>
      <div style="color:#6b7280">משך המשחק</div>
    </div>
    <div style="flex:1;min-width:160px;background:#f5f3ff;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:22px;font-weight:bold;color:#7c3aed">${gameStart ? gameStart.toLocaleDateString('he-IL') : 'N/A'}</div>
      <div style="color:#6b7280">תאריך</div>
    </div>
  </div>

  <h2 style="color:#7c3aed">🏆 טבלת ניקוד</h2>
  <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
    <thead><tr style="background:#7c3aed;color:white">
      <th style="padding:10px 12px;text-align:right">מקום</th>
      <th style="padding:10px 12px;text-align:right">שם</th>
      <th style="padding:10px 12px;text-align:right">ניקוד</th>
    </tr></thead>
    <tbody>${leaderboardRows}</tbody>
  </table>

  <h2 style="color:#7c3aed">📋 שאלות ותשובות</h2>
  ${questionsHtml}

  ${greetingsHtml}

  <div style="margin-top:30px;padding:16px;background:#f9fafb;border-radius:8px;font-size:12px;color:#9ca3af;text-align:center">
    נשלח אוטומטית בסיום המשחק • ${new Date().toLocaleString('he-IL')}
  </div>
</body>
</html>`;

    // ── 5. Send email (split if > 20 MB attachments) ────────────────────
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const MAX_ATTACH = 18 * 1024 * 1024;

    if (attachments.length === 0) {
      // Just one email with HTML
      await transporter.sendMail({
        from: SMTP_USER,
        to: RECIPIENT,
        subject: `סיכום משחק אביה — ${new Date().toLocaleDateString('he-IL')}`,
        html,
      });
    } else {
      // First email: full HTML + text data (no images)
      await transporter.sendMail({
        from: SMTP_USER,
        to: RECIPIENT,
        subject: `סיכום משחק אביה — ${new Date().toLocaleDateString('he-IL')}`,
        html,
      });

      // Additional emails: image batches
      let batch: Attachment[] = [], batchSize = 0, part = 1;
      const sendBatch = async (b: Attachment[], p: number) => {
        await transporter.sendMail({
          from: SMTP_USER,
          to: RECIPIENT,
          subject: `סיכום משחק אביה — תמונות חלק ${p}`,
          text: `תמונות ממשחק אביה (חלק ${p}) — ${b.map(a => a.filename).join(', ')}`,
          attachments: b.map(a => ({ filename: a.filename, content: a.content })),
        });
      };

      for (const att of attachments) {
        if (batchSize + att.content.length > MAX_ATTACH && batch.length) {
          await sendBatch(batch, part++);
          batch = []; batchSize = 0;
        }
        batch.push(att); batchSize += att.content.length;
      }
      if (batch.length) await sendBatch(batch, part);
    }

    console.log('[send-summary] Done. Sent summary for game', gameCode);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[send-summary] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
