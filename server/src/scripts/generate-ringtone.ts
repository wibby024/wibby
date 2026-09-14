import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleRate = 44100;
const totalDuration = 2.4; // seconds
const numSamples = Math.floor(sampleRate * totalDuration);

// Buffer for 16-bit mono PCM samples
const samples = new Float32Array(numSamples);

interface Note {
  start: number; // in seconds
  duration: number; // in seconds
  freq1: number; // Hz
  freq2: number; // Hz
}

const notes: Note[] = [
  // Burst 1: tone pair
  { start: 0.04, duration: 0.22, freq1: 523.25, freq2: 783.99 }, // C5 + G5
  { start: 0.28, duration: 0.32, freq1: 659.25, freq2: 1046.50 }, // E5 + C6
  // Short inter-burst pause
  // Burst 2: tone pair
  { start: 0.72, duration: 0.22, freq1: 523.25, freq2: 783.99 }, // C5 + G5
  { start: 0.96, duration: 0.40, freq1: 659.25, freq2: 1046.50 }, // E5 + C6
  // Followed by 1.04 seconds of clean silence before looping
];

for (const note of notes) {
  const startSample = Math.floor(note.start * sampleRate);
  const noteSampleCount = Math.floor(note.duration * sampleRate);

  for (let i = 0; i < noteSampleCount; i++) {
    const sIdx = startSample + i;
    if (sIdx >= numSamples) break;

    const t = i / sampleRate;
    const progress = i / noteSampleCount;

    // Smooth raised-cosine attack (10ms) to prevent ANY clicks/pops
    const attackSamples = Math.floor(0.012 * sampleRate);
    let envelope = 0;
    if (i < attackSamples) {
      envelope = 0.5 * (1 - Math.cos((Math.PI * i) / attackSamples));
    } else {
      // Exponential decay envelope
      envelope = Math.exp(-progress * 4.5);
    }

    // Synthesis: Fundamental + subtle soft 2nd harmonic (warm bell tone)
    const wave1 = Math.sin(2 * Math.PI * note.freq1 * t) * 0.55 +
                  Math.sin(2 * Math.PI * (note.freq1 * 2) * t) * 0.10;
    const wave2 = Math.sin(2 * Math.PI * note.freq2 * t) * 0.30 +
                  Math.sin(2 * Math.PI * (note.freq2 * 2) * t) * 0.05;

    const val = (wave1 + wave2) * envelope * 0.40; // Max amplitude 0.40 (-8dBFS headroom)
    samples[sIdx] += val;
  }
}

// Ensure exact zero crossings at boundaries
for (let i = 0; i < 200; i++) {
  samples[i] *= i / 200;
  samples[numSamples - 1 - i] *= i / 200;
}

// Convert Float32Array to 16-bit PCM WAV
const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
const subChunk2Size = numSamples * 2;
const chunkSize = 36 + subChunk2Size;

const wavBuffer = Buffer.alloc(44 + subChunk2Size);

// RIFF header
wavBuffer.write('RIFF', 0);
wavBuffer.writeUInt32LE(chunkSize, 4);
wavBuffer.write('WAVE', 8);

// fmt subchunk
wavBuffer.write('fmt ', 12);
wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size = 16 for PCM
wavBuffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
wavBuffer.writeUInt16LE(1, 22); // NumChannels = 1 (mono)
wavBuffer.writeUInt32LE(sampleRate, 24);
wavBuffer.writeUInt32LE(byteRate, 28);
wavBuffer.writeUInt16LE(2, 32); // BlockAlign = 2
wavBuffer.writeUInt16LE(16, 34); // BitsPerSample = 16

// data subchunk
wavBuffer.write('data', 36);
wavBuffer.writeUInt32LE(subChunk2Size, 40);

const int16Samples = new Int16Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  let sample = Math.max(-1, Math.min(1, samples[i]));
  const int16 = sample < 0 ? Math.floor(sample * 32768) : Math.floor(sample * 32767);
  wavBuffer.writeInt16LE(int16, 44 + i * 2);
  int16Samples[i] = int16;
}

const outWavPath = path.resolve(__dirname, '../../../client/public/audio/wibby-ringtone.wav');
const outMp3Path = path.resolve(__dirname, '../../../client/public/audio/wibby-ringtone.mp3');
const outM4aPath = path.resolve(__dirname, '../../../client/public/audio/wibby-ringtone.m4a');

fs.writeFileSync(outWavPath, wavBuffer);
console.log(`✓ WAV generated: ${outWavPath} (${wavBuffer.length} bytes)`);

// Encode MP3 using @breezystack/lamejs
try {
  // @ts-ignore
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const mp3encoder = new Mp3Encoder(1, sampleRate, 128);
  const mp3Data: Buffer[] = [];
  const mp3buf = mp3encoder.encodeBuffer(int16Samples);
  if (mp3buf.length > 0) {
    mp3Data.push(Buffer.from(mp3buf));
  }
  const endBuf = mp3encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(Buffer.from(endBuf));
  }
  const finalMp3 = Buffer.concat(mp3Data);
  fs.writeFileSync(outMp3Path, finalMp3);
  console.log(`✓ MP3 generated via @breezystack/lamejs: ${outMp3Path} (${finalMp3.length} bytes)`);
} catch (e: any) {
  console.warn('mp3 encoding note:', e.message);
}

// Also convert to M4A using macOS afconvert if available
try {
  execSync(`afconvert -f m4af -d aac "${outWavPath}" "${outM4aPath}"`);
  console.log(`✓ M4A generated via afconvert: ${outM4aPath} (${fs.statSync(outM4aPath).size} bytes)`);
} catch (e: any) {
  console.warn('afconvert to m4a note:', e.message);
}
