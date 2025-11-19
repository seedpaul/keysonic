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
  }

  ensureUnlocked() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setInstrument(preset) {
    // Simple oscillator presets
    const map = {
      piano: { type: 'sine', attack: 0.01, decay: 0.22, sustain: 0.4, release: 0.16 },
      trumpet: { type: 'square', attack: 0.015, decay: 0.28, sustain: 0.55, release: 0.2 },
      bass: { type: 'sawtooth', attack: 0.02, decay: 0.22, sustain: 0.65, release: 0.24 },
      guitar: { type: 'triangle', attack: 0.012, decay: 0.26, sustain: 0.5, release: 0.2 },
      drums: { type: 'triangle', attack: 0.004, decay: 0.1, sustain: 0.3, release: 0.08 },
    };
    const next = map[preset] || { type: 'sine', attack: 0.012, decay: 0.24, sustain: 0.5, release: 0.18 };
    this.instrument = next.type;
    this.attack = next.attack;
    this.decay = next.decay;
    this.sustain = next.sustain;
    this.release = next.release;
  }

  /**
   * @param {number} freq
   */
  playFrequency(freq) {
    if (!this.ctx || !freq || !isFinite(freq) || freq <= 0) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = this.instrument || 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const a = this.attack || 0.01;
    const d = this.decay || 0.24;
    const r = this.release || 0.18;
    const s = this.sustain || 0.5;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.35, s), now + a);
    gain.gain.exponentialRampToValueAtTime(s, now + a + d);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + r);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + a + d + r + 0.05);
  }
}

const audioService = typeof window !== 'undefined' ? new AudioService() : null;
export default audioService;

