import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleRate = 44100;
const totalDuration = 3.20; // 3.20s loop duration
const numSamples = Math.floor(sampleRate * totalDuration);

const buffer = new Float32Array(numSamples);

// --- Timbre Synthesizer Function ---
// Blends warm physical electric piano tine + acoustic marimba + crystalline glass harmonics
function addChime(startTime: number, duration: number, freq: number, gain: number, options: {
  attack?: number;
  decayRate?: number;
  harmonics?: Array<{ mult: number; weight: number; decayMult: number }>;
} = {}) {
  const startIdx = Math.floor(startTime * sampleRate);
  const noteSamples = Math.floor(duration * sampleRate);
  const attackSamples = Math.floor((options.attack || 0.008) * sampleRate);
  const decayRate = options.decayRate || 4.2;

  // Physical chime harmonics: [f, 2f, 3f, 4.2f (metallic tine overtone), 5.8f (sparkle)]
  const harmonics = options.harmonics || [
    { mult: 1.0, weight: 1.0, decayMult: 1.0 },
    { mult: 2.0, weight: 0.35, decayMult: 1.3 },
    { mult: 3.0, weight: 0.15, decayMult: 1.8 },
    { mult: 4.2, weight: 0.22, decayMult: 2.4 }, // Metallic chime overtone
    { mult: 5.8, weight: 0.08, decayMult: 3.2 }, // Sparkle
  ];

  const totalWeight = harmonics.reduce((sum, h) => sum + h.weight, 0);

  for (let i = 0; i < noteSamples; i++) {
    const sIdx = startIdx + i;
    if (sIdx >= numSamples) break;

    const t = i / sampleRate;
    const progress = i / noteSamples;

    // Raised cosine attack (prevents any click, gives punchy acoustic transient)
    let attackEnv = 1;
    if (i < attackSamples) {
      attackEnv = 0.5 * (1 - Math.cos((Math.PI * i) / attackSamples));
    }

    let sampleVal = 0;
    for (const h of harmonics) {
      const harmDecay = Math.exp(-progress * decayRate * h.decayMult);
      const wave = Math.sin(2 * Math.PI * (freq * h.mult) * t);
      sampleVal += wave * harmDecay * (h.weight / totalWeight);
    }

    buffer[sIdx] += sampleVal * attackEnv * gain;
  }
}

// Warm Analog Sub/Pads (diffused chord bed)
function addPad(startTime: number, duration: number, freq: number, gain: number, options: {
  attack?: number;
  decayRate?: number;
} = {}) {
  const startIdx = Math.floor(startTime * sampleRate);
  const padSamples = Math.floor(duration * sampleRate);
  const attackSamples = Math.floor((options.attack || 0.10) * sampleRate);
  const decayRate = options.decayRate || 1.8;

  for (let i = 0; i < padSamples; i++) {
    const sIdx = startIdx + i;
    if (sIdx >= numSamples) break;

    const t = i / sampleRate;
    const progress = i / padSamples;

    let env = 0;
    if (i < attackSamples) {
      env = 0.5 * (1 - Math.cos((Math.PI * i) / attackSamples));
    } else {
      env = Math.exp(-progress * decayRate);
    }

    // Warm analog pad: fundamental + soft octave + slight chorus detune
    const wave = Math.sin(2 * Math.PI * freq * t) * 0.7 +
                 Math.sin(2 * Math.PI * (freq * 1.002) * t) * 0.2 +
                 Math.sin(2 * Math.PI * (freq * 2) * t) * 0.1;

    buffer[sIdx] += wave * env * gain;
  }
}

// --- Signature Wibby Motif Arrangement (E Major 9 / C# minor 9) ---

// --- Pulse 1: The Calling Wave (Emaj9) ---
// Ambient Pad Bed
addPad(0.04, 1.35, 164.81, 0.14, { attack: 0.08, decayRate: 1.8 }); // E3
addPad(0.04, 1.35, 246.94, 0.10, { attack: 0.08, decayRate: 2.0 }); // B3
addPad(0.04, 1.35, 369.99, 0.08, { attack: 0.10, decayRate: 2.2 }); // F#4 (9th)

// Melodic Chimes (Rising cascade)
// B4 (493.88Hz) -> E5 (659.25Hz) -> G#5 (830.61Hz) -> F#5 (739.99Hz)
addChime(0.06, 0.40, 493.88, 0.40, { decayRate: 4.8 });  // B4
addChime(0.24, 0.40, 659.25, 0.44, { decayRate: 4.5 });  // E5
addChime(0.44, 0.48, 830.61, 0.48, { decayRate: 4.2 });  // G#5
addChime(0.68, 0.85, 739.99, 0.52, { decayRate: 3.2 });  // F#5 (suspended bloom)

// --- Pulse 2: The Warm Answer (C#m9 resolution) ---
// Ambient Pad Bed
addPad(1.22, 1.45, 138.59, 0.13, { attack: 0.08, decayRate: 1.6 }); // C#3
addPad(1.22, 1.45, 207.65, 0.09, { attack: 0.08, decayRate: 1.8 }); // G#3
addPad(1.22, 1.45, 311.13, 0.07, { attack: 0.10, decayRate: 2.0 }); // D#4 (9th)

// Melodic Chimes (Descending gentle resolution)
// D#5 (622.25Hz) -> B4 (493.88Hz) -> G#4 (415.30Hz) -> E4 (329.63Hz)
addChime(1.24, 0.38, 622.25, 0.42, { decayRate: 4.6 });  // D#5
addChime(1.44, 0.38, 493.88, 0.38, { decayRate: 4.8 });  // B4
addChime(1.66, 0.45, 415.30, 0.36, { decayRate: 4.2 });  // G#4
addChime(1.92, 0.95, 329.63, 0.46, { decayRate: 2.8 });  // E4 (warm anchor)

// --- Master Conditioning & Zero-Crossing Boundary Taper ---

// Micro-fade at start (first 10ms)
const startFade = Math.floor(0.010 * sampleRate);
for (let i = 0; i < startFade; i++) {
  buffer[i] *= (i / startFade);
}

// Gentle acoustic decay to silence at end (from 2.95s to 3.20s)
const endFadeStart = Math.floor(2.95 * sampleRate);
const endFadeLen = numSamples - endFadeStart;
for (let i = 0; i < endFadeLen; i++) {
  const sIdx = endFadeStart + i;
  buffer[sIdx] *= Math.cos((Math.PI * 0.5 * i) / endFadeLen);
}
// Exact zero in final 200 samples
for (let i = numSamples - 200; i < numSamples; i++) {
  buffer[i] = 0;
}

// Peak measurement
let maxPeak = 0;
for (let i = 0; i < numSamples; i++) {
  const abs = Math.abs(buffer[i]);
  if (abs > maxPeak) maxPeak = abs;
}

console.log(`Peak before norm: ${maxPeak.toFixed(4)}`);
const targetPeak = 0.80; // -1.94 dBFS peak (optimal web loudness, zero clipping)
const normScale = maxPeak > 0 ? (targetPeak / maxPeak) : 1;

const int16Samples = new Int16Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const scaled = buffer[i] * normScale;
  const clamped = Math.max(-1, Math.min(1, scaled));
  int16Samples[i] = clamped < 0 ? Math.floor(clamped * 32768) : Math.floor(clamped * 32767);
}

// Encode WAV
const subChunk2Size = numSamples * 2;
const chunkSize = 36 + subChunk2Size;
const wavBuffer = Buffer.alloc(44 + subChunk2Size);

wavBuffer.write('RIFF', 0);
wavBuffer.writeUInt32LE(chunkSize, 4);
wavBuffer.write('WAVE', 8);
wavBuffer.write('fmt ', 12);
wavBuffer.writeUInt32LE(16, 16);
wavBuffer.writeUInt16LE(1, 20); // PCM
wavBuffer.writeUInt16LE(1, 22); // mono
wavBuffer.writeUInt32LE(sampleRate, 24);
wavBuffer.writeUInt32LE(sampleRate * 2, 28);
wavBuffer.writeUInt16LE(2, 32);
wavBuffer.writeUInt16LE(16, 34);
wavBuffer.write('data', 36);
wavBuffer.writeUInt32LE(subChunk2Size, 40);

for (let i = 0; i < numSamples; i++) {
  wavBuffer.writeInt16LE(int16Samples[i], 44 + i * 2);
}

// Export paths
const outDir = path.resolve(__dirname, '../../../client/public/audio');
const outWavPath = path.join(outDir, 'wibby-ringtone.wav');
const outMp3Path = path.join(outDir, 'wibby-ringtone.mp3');

fs.writeFileSync(outWavPath, wavBuffer);
console.log(`✓ WAV generated: ${outWavPath} (${wavBuffer.length} bytes)`);

// Encode MP3 (128 kbps mono)
try {
  // @ts-ignore
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const mp3encoder = new Mp3Encoder(1, sampleRate, 128);
  const mp3Data: Buffer[] = [];
  const mp3buf = mp3encoder.encodeBuffer(int16Samples);
  if (mp3buf.length > 0) mp3Data.push(Buffer.from(mp3buf));
  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) mp3Data.push(Buffer.from(endBuf));
  const finalMp3 = Buffer.concat(mp3Data);

  fs.writeFileSync(outMp3Path, finalMp3);
  console.log(`✓ MP3 generated: ${outMp3Path} (${finalMp3.length} bytes)`);
} catch (e: any) {
  console.warn('MP3 encoding notice:', e.message);
}
