// services/audio-service.js
const createContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
};

export class AudioService {
  constructor() {
    this.ctx = createContext();
    this.masterGain = this.ctx ? this.ctx.createGain() : null;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
    }
    this.instrument = 'sine';
    this.attack = 0.012;
    this.decay = 0.24;
    this.sustain = 0.5;
    this.release = 0.18;
    this.useNoise = false;
    this.filterStart = 1200;
    this.filterEnd = 180;
    this.partials = [];
    this.freqScale = 1;
    this.toneLevel = 0;
    this.toneAttack = 0.004;
    this.toneDecay = 0.08;
    this.toneRelease = 0.08;
    this.toneType = 'sine';
  }

  ensureUnlocked() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(value = 1) {
    if (!this.masterGain) return;
    const v = Math.max(0, Math.min(1.5, value));
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(v, now, 0.02);
  }

  setInstrument(preset) {
    // Simple oscillator presets
    const map = {
      // softer attack and a pinch of harmonics + a mellow lowpass sweep
      piano: {
        type: 'sine',
        attack: 0.01,
        decay: 0.22,
        sustain: 0.3,
        release: 0.26,
        noise: false,
        partials: [
          { ratio: 2, level: 0.22, type: 'triangle' },
          { ratio: 3, level: 0.12, type: 'triangle' },
        ],
        filterStart: 2400,
        filterEnd: 900,
        freqScale: 1,
      },
      trumpet: {
        type: 'sawtooth',
        attack: 0.012,
        decay: 0.3,
        sustain: 0.55,
        release: 0.24,
        noise: false,
        partials: [
          { ratio: 2, level: 0.3, type: 'square' },
          { ratio: 3, level: 0.16, type: 'square' },
        ],
        filterStart: 2600,
        filterEnd: 1400,
        freqScale: 1,
      },
      bass: {
        type: 'sawtooth',
        attack: 0.016,
        decay: 0.22,
        sustain: 0.7,
        release: 0.28,
        noise: false,
        partials: [
          { ratio: 0.5, level: 0.35, type: 'sine' },
          { ratio: 2, level: 0.18, type: 'triangle' },
        ],
        filterStart: 900,
        filterEnd: 260,
        freqScale: 0.8,
      },
      guitar: {
        type: 'triangle',
        attack: 0.01,
        decay: 0.24,
        sustain: 0.45,
        release: 0.22,
        noise: false,
        partials: [
          { ratio: 2, level: 0.25, type: 'triangle' },
          { ratio: 3, level: 0.12, type: 'sine' },
        ],
        filterStart: 2100,
        filterEnd: 1100,
        freqScale: 1,
      },
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
        toneLevel: 0.45,
        toneAttack: 0.004,
        toneDecay: 0.08,
        toneRelease: 0.08,
        toneType: 'sine',
        partials: [],
        freqScale: 1,
      },
      // legacy/classic synth stays pure sine so it's clearly different than "piano"
      sine: { type: 'sine', attack: 0.008, decay: 0.18, sustain: 0.55, release: 0.14, noise: false, partials: [], freqScale: 1 },
    };
    const next =
      map[preset] || { type: 'sine', attack: 0.012, decay: 0.24, sustain: 0.5, release: 0.18, noise: false, partials: [], freqScale: 1 };
    this.instrument = next.type;
    this.attack = next.attack;
    this.decay = next.decay;
    this.sustain = next.sustain;
    this.release = next.release;
    this.useNoise = !!next.noise;
    this.filterStart = next.filterStart || 1200;
    this.filterEnd = next.filterEnd || 180;
    this.partials = Array.isArray(next.partials) ? next.partials.slice() : [];
    this.freqScale = Number.isFinite(next.freqScale) ? next.freqScale : 1;
    this.toneLevel = next.toneLevel || 0;
    this.toneAttack = next.toneAttack || 0.004;
    this.toneDecay = next.toneDecay || 0.08;
    this.toneRelease = next.toneRelease || 0.08;
    this.toneType = next.toneType || 'sine';
  }

  /**
   * @param {number} freq
   * @param {number} [velocity=1]
   */
  playFrequency(freq, velocity = 1) {
    if (!this.ctx || !freq || !isFinite(freq) || freq <= 0) return;

    const vel = Math.min(1.5, Math.max(0.3, Number(velocity) || 1));
    const effectiveFreq = freq * (Number.isFinite(this.freqScale) ? this.freqScale : 1);
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
      gain.gain.linearRampToValueAtTime(0.9 * vel, now + a);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.02, s * vel), now + a + d);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + r);

      const destination = this.masterGain || this.ctx.destination;
      noise.connect(filter).connect(gain).connect(destination);
      noise.start(now);
      noise.stop(now + length);

      if (this.toneLevel > 0 && isFinite(freq)) {
        const tone = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();
        tone.type = this.toneType || 'sine';
        tone.frequency.setValueAtTime(freq, now);
        const ta = this.toneAttack || 0.004;
        const td = this.toneDecay || 0.08;
        const tr = this.toneRelease || 0.08;
        const level = Math.max(0.001, Math.min(1, (this.toneLevel || 0.3) * vel));
        toneGain.gain.setValueAtTime(0.0001, now);
        toneGain.gain.linearRampToValueAtTime(level, now + ta);
        toneGain.gain.exponentialRampToValueAtTime(level * 0.4, now + ta + td);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, now + ta + td + tr);
        const destinationTone = this.masterGain || this.ctx.destination;
        tone.connect(toneGain).connect(destinationTone);
        tone.start(now);
        tone.stop(now + ta + td + tr + 0.05);
      }
    } else {
      const destination = this.masterGain || this.ctx.destination;
      const useFilter = this.filterStart && this.filterEnd;
      const filter = useFilter ? this.ctx.createBiquadFilter() : null;
      let target = destination;
      if (filter) {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.filterStart, now);
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(80, this.filterEnd),
          now + a + d
        );
        target = filter;
        filter.connect(destination);
      }

      const spawnVoice = (opts = {}) => {
        const { wave = this.instrument || 'sine', mult = 1, level = 1 } = opts;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = wave;
        osc.frequency.setValueAtTime(effectiveFreq * mult, now);

        const peak = Math.max(0.25, s * vel * level);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + a);
        gain.gain.exponentialRampToValueAtTime(s * vel * level, now + a + d);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + r);

        osc.connect(gain).connect(target);
        osc.start(now);
        osc.stop(now + a + d + r + 0.05);
      };

      // Fundamental
      spawnVoice({ wave: this.instrument || 'sine', mult: 1, level: 1 });
      // Harmonics
      if (Array.isArray(this.partials)) {
        this.partials.forEach((p) => {
          const ratio = Number(p?.ratio) || 0;
          const level = Number(p?.level) || 0;
          if (ratio > 0 && level > 0.001) {
            spawnVoice({ wave: p.type || this.instrument || 'sine', mult: ratio, level });
          }
        });
      }
    }
  }
}

const audioService = typeof window !== 'undefined' ? new AudioService() : null;
export default audioService;

