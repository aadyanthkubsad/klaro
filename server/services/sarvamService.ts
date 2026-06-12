/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sarvam AI Text-to-Speech service.
 *
 * Wraps the Sarvam TTS REST API.  The API key lives server-side only and is
 * NEVER sent to the frontend.
 *
 * Docs: https://docs.sarvam.ai/api-reference-docs/endpoints/text-to-speech
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type VoiceStyle = 'clear-teacher' | 'friendly-tutor' | 'exam-coach' | 'story-mode' | 'clear-narrator';
export type AudioLanguage = 'en-IN' | 'hi-IN' | 'hinglish';

export interface GenerateAudioParams {
  topic: string;
  subject?: string;
  classLevel?: string;
  script: string;
  language: AudioLanguage;
  voiceStyle: VoiceStyle;
}

export interface GenerateAudioResult {
  audioUrl: string;
  duration: string;
  script: string;
  cached: boolean;
}

// ─── Voice mapping ──────────────────────────────────────────────────────────
// Sarvam speaker IDs — pick voices that best match each pedagogical style.
// See https://docs.sarvam.ai/api-reference-docs/endpoints/text-to-speech

const VOICE_MAP: Record<VoiceStyle, { speaker: string; pace: number; pitch: number }> = {
  'clear-teacher':  { speaker: 'anushka', pace: 1.0, pitch: 0 },
  'friendly-tutor': { speaker: 'manisha', pace: 1.1, pitch: 0 },
  'exam-coach':     { speaker: 'abhilash', pace: 1.15, pitch: 0 },
  'story-mode':     { speaker: 'karun', pace: 0.9, pitch: 0 },
  'clear-narrator': { speaker: 'anushka', pace: 0.95, pitch: 0 },
};

// Sarvam model to use
const SARVAM_MODEL = 'bulbul:v2';

// ─── Audio cache directory ──────────────────────────────────────────────────
const AUDIO_DIR = path.resolve('public', 'generated-audio');

function ensureAudioDir(): void {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

// ─── Cache key ──────────────────────────────────────────────────────────────

function audioCacheKey(params: GenerateAudioParams): string {
  const payload = `${params.script}::${params.language}::${params.voiceStyle}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

// ─── Validate API key ───────────────────────────────────────────────────────

export function getSarvamApiKey(): string | null {
  return process.env.SARVAM_API_KEY?.trim() || null;
}

export function validateSarvamConfig(): { ok: boolean; error?: string } {
  const key = getSarvamApiKey();
  if (!key || key === 'your_sarvam_api_key_here') {
    return {
      ok: false,
      error: 'Sarvam API key is not configured. Add SARVAM_API_KEY to .env and restart the server.',
    };
  }
  return { ok: true };
}

// ─── Sarvam TTS call ────────────────────────────────────────────────────────

/** Max characters Sarvam accepts in a single request (API limit is 500). */
const MAX_SCRIPT_LENGTH = 500;

/**
 * Split a long script into chunks that Sarvam can handle, splitting at
 * sentence boundaries when possible. Every returned chunk is guaranteed
 * to be ≤ maxLen characters.
 */
function splitScript(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find the last sentence boundary whose *end* fits within maxLen
    let splitAt = -1;
    for (const sep of ['. ', '? ', '! ', '।\n', '। ', '\n\n', '\n', ', ']) {
      const searchTo = maxLen - sep.length;
      if (searchTo < 1) continue;
      const idx = remaining.lastIndexOf(sep, searchTo);
      if (idx > maxLen * 0.2) {
        splitAt = idx + sep.length;
        break;
      }
    }

    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(' ', maxLen - 1);
      if (splitAt <= 0) splitAt = maxLen;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    // Safety net: if trim didn't help and chunk is still over limit, hard-cut
    if (chunk.length > maxLen) {
      const hardCut = remaining.lastIndexOf(' ', maxLen - 1);
      const cutAt = hardCut > 0 ? hardCut : maxLen;
      chunks.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    } else {
      chunks.push(chunk);
      remaining = remaining.slice(splitAt).trim();
    }
  }

  return chunks;
}

/**
 * Sanitise a text chunk for Sarvam TTS. Sarvam's preprocessor chokes on
 * chemical formulas, arrows, math notation, and various special characters,
 * returning 500 "error preprocessing input text". This function converts
 * all such artefacts into plain spoken-word equivalents.
 */
function sanitiseForTTS(text: string): string {
  return text
    // ── Pause markers → graded sentence breaks for TTS ─────────────
    .replace(/\[long pause\]/gi, '. . . ')
    .replace(/\[medium pause\]/gi, '. . ')
    .replace(/\[short pause\]/gi, '. ')
    .replace(/\[pause\]/gi, '. ')

    // ── Arrows → spoken words ───────────────────────────────────────
    .replace(/\s*[-=]>\s*/g, ' gives ')       // -> or => → "gives"
    .replace(/\s*→\s*/g, ' gives ')            // → arrow
    .replace(/\s*←\s*/g, ' from ')             // ← arrow
    .replace(/\s*⇌\s*/g, ' is in equilibrium with ')
    .replace(/\s*↑\s*/g, ' (gas released) ')
    .replace(/\s*↓\s*/g, ' (precipitate) ')

    // ── Chemical formulas → spoken form ─────────────────────────────
    // e.g. "CO2" → "C O 2", "H2SO4" → "H 2 S O 4", "CH3COOH" → "C H 3 C O O H"
    // Insert spaces between letters and digits so TTS spells them out
    .replace(/([A-Z][a-z]?)(\d+)/g, '$1 $2 ')  // "H2" → "H 2 "
    .replace(/(\d)([A-Z])/g, '$1 $2')            // "2H" → "2 H"

    // ── Subscript/superscript Unicode → plain digits ────────────────
    .replace(/[₀⁰]/g, '0').replace(/[₁¹]/g, '1').replace(/[₂²]/g, '2')
    .replace(/[₃³]/g, '3').replace(/[₄⁴]/g, '4').replace(/[₅⁵]/g, '5')
    .replace(/[₆⁶]/g, '6').replace(/[₇⁷]/g, '7').replace(/[₈⁸]/g, '8')
    .replace(/[₉⁹]/g, '9')
    .replace(/[⁺]/g, ' plus').replace(/[⁻]/g, ' minus')

    // ── Math & science symbols → words ──────────────────────────────
    .replace(/°C/g, ' degrees Celsius')
    .replace(/°F/g, ' degrees Fahrenheit')
    .replace(/°/g, ' degrees ')
    .replace(/±/g, ' plus or minus ')
    .replace(/≈/g, ' approximately ')
    .replace(/≠/g, ' is not equal to ')
    .replace(/≥/g, ' is greater than or equal to ')
    .replace(/≤/g, ' is less than or equal to ')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/√/g, ' square root of ')
    .replace(/∞/g, ' infinity ')
    .replace(/Δ/g, ' delta ')
    .replace(/Ω/g, ' ohm ')
    .replace(/μ/g, ' micro ')
    .replace(/π/g, ' pi ')
    .replace(/θ/g, ' theta ')
    .replace(/α/g, ' alpha ')
    .replace(/β/g, ' beta ')
    .replace(/γ/g, ' gamma ')
    .replace(/λ/g, ' lambda ')

    // ── Common problematic punctuation ──────────────────────────────
    .replace(/\.{2,}/g, '.')               // ellipsis
    .replace(/\*+/g, '')                   // markdown bold/italic
    .replace(/#+\s*/g, '')                 // markdown headings
    .replace(/^[-–—•]\s*/gm, '')           // bullet points
    .replace(/\[/g, '(').replace(/\]/g, ')') // brackets → parens
    .replace(/\{/g, '(').replace(/\}/g, ')') // braces → parens
    .replace(/[""]/g, '"')                 // smart quotes → regular
    .replace(/['']/g, "'")                 // smart apostrophes
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
    .replace(/\$/g, ' dollars ')
    .replace(/(\d)\s*%/g, '$1 percent')   // "50%" → "50 percent" (only after digits)
    .replace(/%/g, ' percent ')
    .replace(/\s\+\s/g, ' plus ')         // " + " → " plus " (only when spaced, i.e. math)
    .replace(/\s=\s/g, ' equals ')        // " = " → " equals " (only when spaced)
    .replace(/\|/g, ', ')
    .replace(/~/g, ' approximately ')
    .replace(/\^/g, ' to the power ')
    .replace(/_/g, ' ')
    .replace(/\\/g, ' ')

    // ── Strip any remaining non-ASCII that isn't Hindi/Devanagari ───
    // Keep: ASCII printable, Devanagari block (U+0900-U+097F), common punctuation
    .replace(/[^\x20-\x7Eऀ-ॿ -ÿ\n]/g, ' ')

    // ── Clean up spacing ────────────────────────────────────────────
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Call Sarvam TTS for a single text chunk and return the raw WAV buffer.
 * Retries once with aggressive sanitisation on 500 errors.
 */
async function callSarvamTTS(
  text: string,
  language: AudioLanguage,
  voiceStyle: VoiceStyle,
  apiKey: string,
): Promise<Buffer> {
  const voice = VOICE_MAP[voiceStyle] || VOICE_MAP['clear-teacher'];

  const langMap: Record<AudioLanguage, string> = {
    'en-IN': 'en-IN',
    'hi-IN': 'hi-IN',
    'hinglish': 'hi-IN',
  };

  // Text is already sanitised by the caller (generateAudio sanitises before splitting)
  const cleanText = text;

  const makeRequest = async (inputText: string) => {
    const body = {
      inputs: [inputText],
      target_language_code: langMap[language] || 'en-IN',
      speaker: voice.speaker,
      model: SARVAM_MODEL,
      pitch: voice.pitch,
      pace: voice.pace,
      loudness: 1.5,
      enable_preprocessing: true,
    };

    return fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  };

  let response = await makeRequest(cleanText);

  // On 500 "preprocessing" error, retry with ultra-aggressive cleanup
  if (response.status === 500) {
    const errText = await response.text().catch(() => '');
    if (errText.includes('preprocessing')) {
      logger.warn('Sarvam preprocessing error, retrying with aggressive sanitisation', {
        meta: { chunkLen: cleanText.length, firstChars: cleanText.substring(0, 80) },
      });
      // Strip everything except basic ASCII letters, digits, spaces, and basic punctuation
      const ultraClean = cleanText
        .replace(/[^a-zA-Z0-9\s.,;:!?'"()\-\nऀ-ॿ]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      response = await makeRequest(ultraClean);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const status = response.status;

    if (status === 429) {
      throw new SarvamError('QUOTA_EXCEEDED', 'Sarvam API quota exceeded. Please try again later.');
    }
    if (status === 401 || status === 403) {
      throw new SarvamError('AUTH_FAILED', 'Sarvam API authentication failed. Check your API key.');
    }
    if (status === 402) {
      throw new SarvamError('QUOTA_EXCEEDED', `Sarvam API credits exhausted: ${errText.substring(0, 200)}`);
    }
    if (status === 400) {
      throw new SarvamError('BAD_REQUEST', `Sarvam rejected the request: ${errText.substring(0, 200)}`);
    }

    throw new SarvamError('API_ERROR', `Sarvam API returned ${status}: ${errText.substring(0, 200)}`);
  }

  const json = await response.json();

  if (!json.audios || !json.audios[0]) {
    throw new SarvamError('EMPTY_RESPONSE', 'Sarvam returned no audio data.');
  }

  return Buffer.from(json.audios[0], 'base64');
}

// ─── Error class ────────────────────────────────────────────────────────────

export class SarvamError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SarvamError';
  }
}

// ─── Main generate function ─────────────────────────────────────────────────

export async function generateAudio(params: GenerateAudioParams): Promise<GenerateAudioResult> {
  // 1. Validate API key
  const apiKey = getSarvamApiKey();
  if (!apiKey || apiKey === 'your_sarvam_api_key_here') {
    throw new SarvamError(
      'NO_API_KEY',
      'Sarvam API key is not configured. Add SARVAM_API_KEY to .env and restart the server.',
    );
  }

  // 2. Sanitise the FULL script for TTS BEFORE splitting into chunks.
  //    This must happen before splitting because sanitisation expands text
  //    (e.g. "=" → " equals ") and chunks must be ≤500 chars AFTER expansion.
  const originalScript = params.script; // keep original for transcript display
  const sanitisedScript = sanitiseForTTS(params.script);

  // 3. Validate script length
  if (!sanitisedScript || sanitisedScript.trim().length < 10) {
    throw new SarvamError('INVALID_INPUT', 'Script is too short for audio generation.');
  }

  // 4. Check cache (use sanitised script for cache key so same input = same audio)
  ensureAudioDir();
  const cacheId = audioCacheKey({ ...params, script: sanitisedScript });
  const cachedPath = path.join(AUDIO_DIR, `${cacheId}.wav`);

  if (fs.existsSync(cachedPath)) {
    const stats = fs.statSync(cachedPath);
    const sizeMB = stats.size / (1024 * 1024);
    // Estimate duration: WAV at ~16kHz mono 16-bit = ~32KB/s
    const estSeconds = Math.round(stats.size / 32000);
    const durMin = Math.floor(estSeconds / 60);
    const durSec = estSeconds % 60;
    logger.info('Sarvam audio cache hit', { meta: { cacheId, sizeMB: sizeMB.toFixed(2) } });
    return {
      audioUrl: `/generated-audio/${cacheId}.wav`,
      duration: `${durMin}:${durSec.toString().padStart(2, '0')}`,
      script: originalScript,
      cached: true,
    };
  }

  // 5. Split the SANITISED script into ≤500 char chunks, then generate audio
  const chunks = splitScript(sanitisedScript.trim(), MAX_SCRIPT_LENGTH);
  logger.info('Sarvam TTS starting', {
    meta: {
      topic: params.topic,
      language: params.language,
      voiceStyle: params.voiceStyle,
      chunks: chunks.length,
      totalChars: params.script.length,
    },
  });

  // Process chunks in parallel (up to 6 concurrent) for speed
  const CONCURRENCY = 6;
  const audioBuffers: Buffer[] = new Array(chunks.length);

  for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
    const batchChunks = chunks.slice(batch, batch + CONCURRENCY);
    const results = await Promise.allSettled(
      batchChunks.map((chunk, idx) =>
        callSarvamTTS(chunk, params.language, params.voiceStyle, apiKey)
          .then(buf => ({ index: batch + idx, buf }))
      )
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const err = result.reason;
        if (err instanceof SarvamError) throw err;
        throw new SarvamError('NETWORK_ERROR', `Failed to generate audio: ${(err as Error).message}`);
      }
      audioBuffers[result.value.index] = result.value.buf;
    }
  }

  // 6. Concatenate buffers (simple concat for WAV — first buffer has the header)
  // For a proper WAV concat we need to fix the header, but for MVP we'll
  // write separate chunks if multiple, or the single buffer if just one.
  let finalBuffer: Buffer;
  if (audioBuffers.length === 1) {
    finalBuffer = audioBuffers[0];
  } else {
    // Simple concatenation: take header from first, raw data from rest
    // WAV header is 44 bytes; strip header from subsequent chunks
    const parts = [audioBuffers[0]];
    for (let i = 1; i < audioBuffers.length; i++) {
      // Each Sarvam response is a complete WAV; skip its 44-byte header
      parts.push(audioBuffers[i].slice(44));
    }
    const combined = Buffer.concat(parts);
    // Fix the WAV file size headers
    const dataSize = combined.length - 44;
    combined.writeUInt32LE(combined.length - 8, 4);   // RIFF chunk size
    combined.writeUInt32LE(dataSize, 40);              // data sub-chunk size
    finalBuffer = combined;
  }

  // 7. Write to disk
  fs.writeFileSync(cachedPath, finalBuffer);

  // 8. Calculate duration
  const estSeconds = Math.round(finalBuffer.length / 32000);
  const durMin = Math.floor(estSeconds / 60);
  const durSec = estSeconds % 60;

  logger.info('Sarvam TTS complete', {
    meta: {
      cacheId,
      sizeMB: (finalBuffer.length / (1024 * 1024)).toFixed(2),
      estimatedDuration: `${durMin}:${durSec.toString().padStart(2, '0')}`,
    },
  });

  return {
    audioUrl: `/generated-audio/${cacheId}.wav`,
    duration: `${durMin}:${durSec.toString().padStart(2, '0')}`,
    script: originalScript, // Return the readable original, not the TTS-sanitised version
    cached: false,
  };
}

// ─── Cleanup old audio files (call periodically) ────────────────────────────

const MAX_AUDIO_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function cleanupOldAudioFiles(): number {
  ensureAudioDir();
  const now = Date.now();
  let removed = 0;
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    for (const f of files) {
      const fp = path.join(AUDIO_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > MAX_AUDIO_AGE_MS) {
        fs.unlinkSync(fp);
        removed++;
      }
    }
  } catch (err) {
    logger.warn('Audio cleanup error', { meta: { error: (err as Error).message } });
  }
  return removed;
}
