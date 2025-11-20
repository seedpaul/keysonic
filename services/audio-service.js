// services/audio-service.js
const createContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
};

export class AudioService {
  constructor() {
    this.ctx = createContext();
    this.instrument = 'sine';
    this.attack = 0.012;
    this.decay = 0.24;
    this.sustain = 0.5;
    this.release = 0.18;
    this.useNoise = false;
    this.filterStart = 1200;
    this.filterEnd = 180;
  }

  ensureUnlocked() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setInstrument(preset) {
    // Simple oscillator presets
    const map = {
      // softer attack and a pinch of triangle for a rounded, "felt" piano-ish tone
      piano: { type: 'triangle', attack: 0.018, decay: 0.22, sustain: 0.32, release: 0.22, noise: false },
      trumpet: { type: 'square', attack: 0.015, decay: 0.28, sustain: 0.55, release: 0.2, noise: false },
      bass: { type: 'sawtooth', attack: 0.02, decay: 0.22, sustain: 0.65, release: 0.24, noise: false },
      guitar: { type: 'triangle', attack: 0.012, decay: 0.26, sustain: 0.5, release: 0.2, noise: false },
      // drum hit: white-noise burst through a falling low-pass for a thumpy splash
      drums: {
        type: 'triangle',
        attack: 0.003,
        decay: 0.12,
        sustain: 0.05,
        release: 0.08,
        noise: true,
        filterStart: 1800,
        filterEnd: 220,
      },
      // legacy/classic synth stays pure sine so it's clearly different than "piano"
      sine: { type: 'sine', attack: 0.008, decay: 0.18, sustain: 0.55, release: 0.14, noise: false },
    };
    const next = map[preset] || { type: 'sine', attack: 0.012, decay: 0.24, sustain: 0.5, release: 0.18, noise: false };
    this.instrument = next.type;
    this.attack = next.attack;
    this.decay = next.decay;
    this.sustain = next.sustain;
    this.release = next.release;
    this.useNoise = !!next.noise;
    this.filterStart = next.filterStart || 1200;
    this.filterEnd = next.filterEnd || 180;
  }

  /**
   * @param {number} freq
   */
  playFrequency(freq) {
    if (!this.ctx || !freq || !isFinite(freq) || freq <= 0) return;

    const now = this.ctx.currentTime;
    const a = this.attack || 0.01;
    const d = this.decay || 0.24;
    const r = this.release || 0.18;
    const s = this.sustain || 0.5;

    if (this.useNoise) {
      const length = Math.max(0.35, a + d + r + 0.1);
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.filterStart || 1200, now);
      filter.frequency.exponentialRampToValueAtTime(this.filterEnd || 180, now + a + d);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.9, now + a);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.02, s), now + a + d);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + r);

      noise.connect(filter).connect(gain).connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + length);
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = this.instrument || 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.35, s), now + a);
      gain.gain.exponentialRampToValueAtTime(s, now + a + d);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + r);

      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + a + d + r + 0.05);
    }
  }
}

const audioService = typeof window !== 'undefined' ? new AudioService() : null;
export default audioService;

