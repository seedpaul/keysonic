// services/audio-service.js
const createContext = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return Ctor ? new Ctor() : null;
};

export class AudioService {
  constructor() {
    this.engine = 'classic';
    this.audioMode = 'classic';
    this.tone = typeof window !== 'undefined' ? window.Tone : null;
    this.sampleLibrary = typeof window !== 'undefined' ? window.SampleLibrary || null : null;
    this.ctx = createContext();
    this.masterGain = this.ctx ? this.ctx.createGain() : null;
    this.activeVoices = new Map();
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
    this.toneVoices = new Map();
    this.toneFxChorus = null;
    this.toneFxDelay = null;
    this.toneFxReverb = null;
    this.toneVolume =
      this.tone && this.tone.Volume
        ? new this.tone.Volume(-6).toDestination()
        : null;
    this.toneSynth = null;
    this.toneOneShot = false;
    this.toneSampler = null;
    this.toneSamplerName = null;
    this.toneSamplerPromise = null;
    this.#buildToneSynth(this.instrument);
    this.#prepareToneSampler(this.instrument);
  }

  #clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  ensureUnlocked() {
    if (this.tone && typeof this.tone.start === 'function') {
      this.tone.start();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(value = 1) {
    const v = this.#clamp(value, 0, 1.5);
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(v, now, 0.02);
    }
    if (this.toneVolume) {
      const db =
        this.tone && typeof this.tone.gainToDb === 'function'
          ? this.tone.gainToDb(v)
          : 20 * Math.log10(Math.max(0.0001, v));
      if (this.toneVolume.volume?.rampTo) {
        this.toneVolume.volume.rampTo(db, 0.02);
      } else if (this.toneVolume.gain?.rampTo) {
        this.toneVolume.gain.rampTo(v, 0.02);
      }
    }
  }

  setAudioMode(mode) {
    // Lazy-grab Tone/SampleLibrary if the script loaded after this service constructed.
    if (mode === 'tone' && typeof window !== 'undefined') {
      if (!this.tone && window.Tone) {
        this.tone = window.Tone;
      }
      if (!this.sampleLibrary && window.SampleLibrary) {
        this.sampleLibrary = window.SampleLibrary;
      }
      if (!this.toneVolume && this.tone?.Volume) {
        try {
          this.toneVolume = new this.tone.Volume(-6).toDestination();
        } catch {
          this.toneVolume = null;
        }
      }
    }

    const wantsTone = mode === 'tone' && this.tone && this.toneVolume;
    this.engine = wantsTone ? 'tone' : 'classic';
    this.audioMode = this.engine;
    this.stopAllHeldNotes();
    if (wantsTone) {
      this.#buildToneFxChain();
      this.#buildToneSynth(this.instrument);
      this.#prepareToneSampler(this.instrument);
    } else {
      this.#disposeToneFx();
    }
    return this.engine;
  }

  setEngine(engine) {
    return this.setAudioMode(engine);
  }

  getEngine() {
    return this.audioMode || this.engine;
  }

  getAudioMode() {
    return this.getEngine();
  }

  #disposeToneSynth() {
    if (this.toneSynth && this.toneSynth.dispose) {
      try {
        this.toneSynth.dispose();
      } catch {}
    }
    this.toneSynth = null;
    this.toneOneShot = false;
  }

  #disposeToneFx() {
    if (this.toneFxChorus?.dispose) {
      try {
        this.toneFxChorus.dispose();
      } catch {}
    }
    if (this.toneFxDelay?.dispose) {
      try {
        this.toneFxDelay.dispose();
      } catch {}
    }
    if (this.toneFxReverb?.dispose) {
      try {
        this.toneFxReverb.dispose();
      } catch {}
    }
    this.toneFxChorus = null;
    this.toneFxDelay = null;
    this.toneFxReverb = null;
  }

  #buildToneFxChain() {
    if (!this.tone || !this.toneVolume) {
      this.#disposeToneFx();
      return;
    }
    this.#disposeToneFx();
    try {
      this.toneFxChorus = new this.tone.Chorus(5, 2.8, 0.5).start();
      this.toneFxDelay = new this.tone.PingPongDelay({
        delayTime: '8n',
        feedback: 0.28,
        wet: 0.38,
      });
      this.toneFxReverb = new this.tone.Reverb({ decay: 3.2, wet: 0.6 });
      this.toneFxChorus.connect(this.toneFxDelay);
      this.toneFxDelay.connect(this.toneFxReverb);
      this.toneFxReverb.connect(this.toneVolume);
    } catch {
      this.#disposeToneFx();
    }
  }

  #getToneTarget() {
    return this.toneFxChorus || this.toneFxDelay || this.toneFxReverb || this.toneVolume;
  }

  #buildToneSynth(preset = 'piano') {
    if (!this.tone || !this.toneVolume) {
      this.toneSynth = null;
      this.toneOneShot = false;
      return;
    }
    this.#disposeToneSynth();
    const Tone = this.tone;
    const target = this.#getToneTarget() || this.toneVolume;
    const mode = preset || 'piano';
    try {
      switch (mode) {
        case 'trumpet':
          this.toneSynth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 1.5,
            modulationIndex: 8,
            modulation: { type: 'triangle' },
            oscillator: { type: 'square' },
            envelope: {
              attack: this.attack || 0.01,
              decay: this.decay || 0.28,
              sustain: this.sustain || 0.6,
              release: this.release || 0.32,
            },
            modulationEnvelope: {
              attack: 0.01,
              decay: 0.26,
              sustain: 0.6,
              release: 0.3,
            },
          }).connect(target);
          this.toneOneShot = false;
          break;
        case 'bass':
          this.toneSynth = new Tone.MonoSynth({
            oscillator: { type: 'square' },
            filter: { type: 'lowpass', rolloff: -24 },
            filterEnvelope: {
              attack: 0.005,
              decay: 0.3,
              sustain: 0.3,
              release: 0.4,
              baseFrequency: 80,
              octaves: 3,
            },
            envelope: {
              attack: this.attack || 0.01,
              decay: this.decay || 0.2,
              sustain: this.sustain || 0.7,
              release: this.release || 0.32,
            },
          }).connect(target);
          this.toneOneShot = false;
          break;
        case 'guitar':
          this.toneSynth = new Tone.PluckSynth({
            attackNoise: 1.1,
            dampening: 3200,
            resonance: 0.95,
          }).connect(target);
          this.toneOneShot = true;
          break;
        case 'drums':
          this.toneSynth = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 4,
            oscillator: { type: 'sine' },
            envelope: {
              attack: 0.001,
              decay: 0.5,
              sustain: 0.01,
              release: 0.5,
            },
          }).connect(target);
          this.toneOneShot = true;
          break;
        case 'legacy':
          this.toneSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: {
              attack: this.attack || 0.008,
              decay: this.decay || 0.18,
              sustain: this.sustain || 0.55,
              release: this.release || 0.2,
            },
          }).connect(target);
          this.toneOneShot = false;
          break;
        case 'piano':
        default:
          this.toneSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: this.instrument || 'triangle' },
            envelope: {
              attack: this.attack || 0.01,
              decay: this.decay || 0.22,
              sustain: this.sustain || 0.45,
              release: this.release || 0.5,
            },
            filter: { type: 'lowpass', rolloff: -24 },
            filterEnvelope: {
              attack: 0.005,
              decay: 0.25,
              sustain: 0.3,
              release: 0.6,
              baseFrequency: 800,
              octaves: 4,
            },
          }).connect(target);
          this.toneOneShot = false;
          break;
      }
    } catch (err) {
      this.toneSynth = null;
      this.toneOneShot = false;
    }
  }

  #prepareToneSampler(preset = 'piano') {
    if (!this.sampleLibrary || !this.tone || !this.toneVolume) {
      this.toneSampler = null;
      this.toneSamplerName = null;
      this.toneSamplerPromise = null;
      return;
    }
    const map = {
      piano: 'piano',
      trumpet: 'trumpet',
      bass: 'bassoon',
      guitar: 'guitar',
      drums: 'marimba',
      legacy: 'piano',
    };
    const name = map[preset] || 'piano';
    if (this.toneSampler && this.toneSamplerName === name) return;
    this.toneSampler = null;
    this.toneSamplerName = name;
    const baseUrl = 'https://unpkg.com/tonejs-instruments@1.0.2/dist/';
    try {
      this.sampleLibrary.baseUrl = baseUrl;
      const loadPromise = this.sampleLibrary.load({ instruments: [name] });
      this.toneSamplerPromise = loadPromise;
      loadPromise
        .then((obj) => {
          const sampler = obj?.[name];
          if (sampler && sampler.connect) {
            const target = this.#getToneTarget() || this.toneVolume;
            sampler.connect(target);
            this.toneSampler = sampler;
          }
        })
        .catch(() => {
          this.toneSampler = null;
        });
    } catch (err) {
      this.toneSampler = null;
      this.toneSamplerPromise = null;
    }
  }

  setInstrument(preset) {
    // Simple oscillator presets
    const map = {
      // softer attack and a pinch of harmonics + a mellow lowpass sweep
      piano: {
        type: 'triangle',
        attack: 0.008,
        decay: 0.18,
        sustain: 0.32,
        release: 0.32,
        noise: false,
        partials: [
          { ratio: 2, level: 0.18, type: 'sine' },
          { ratio: 3, level: 0.1, type: 'triangle' },
        ],
        filterStart: 2200,
        filterEnd: 850,
        freqScale: 1,
      },
      trumpet: {
        type: 'sawtooth',
        attack: 0.012,
        decay: 0.34,
        sustain: 0.68,
        release: 0.26,
        noise: false,
        partials: [
          { ratio: 2, level: 0.38, type: 'square' },
          { ratio: 3, level: 0.22, type: 'square' },
          { ratio: 4, level: 0.12, type: 'sawtooth' },
        ],
        filterStart: 3400,
        filterEnd: 1400,
        freqScale: 1,
      },
      bass: {
        type: 'square',
        attack: 0.01,
        decay: 0.2,
        sustain: 0.7,
        release: 0.32,
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
        attack: 0.004,
        decay: 0.18,
        sustain: 0.32,
        release: 0.24,
        noise: false,
        partials: [
          { ratio: 2, level: 0.16, type: 'triangle' },
          { ratio: 3, level: 0.08, type: 'sine' },
          { ratio: 4, level: 0.04, type: 'triangle' },
        ],
        filterStart: 1600,
        filterEnd: 750,
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
    this.#buildToneSynth(this.instrument);
    this.#prepareToneSampler(this.instrument);
  }

  stopHeldNote(id) {
    if (!id) return;
    const voice = this.activeVoices.get(id);
    const toneVoice = this.toneVoices.get(id);
    const now = this.ctx ? this.ctx.currentTime : 0;
    const r = this.release || 0.18;
    if (voice && this.ctx) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + r);
      voice.oscillators.forEach((osc) => {
        try {
          osc.stop(now + r + 0.05);
        } catch {}
      });
      this.activeVoices.delete(id);
    }
    if (toneVoice && toneVoice.synth) {
      if (!toneVoice.oneShot) {
        try {
          if (toneVoice.note != null && toneVoice.synth.triggerRelease) {
            toneVoice.synth.triggerRelease(toneVoice.note);
          } else if (toneVoice.synth.triggerRelease) {
            toneVoice.synth.triggerRelease();
          }
        } catch {}
      }
      this.toneVoices.delete(id);
    }
  }

  stopAllHeldNotes() {
    Array.from(this.activeVoices.keys()).forEach((id) => this.stopHeldNote(id));
    Array.from(this.toneVoices.keys()).forEach((id) => this.stopHeldNote(id));
  }

  startHeldNote(freq, velocity = 1, id = 'note', holdMs = null) {
    if (!freq || !isFinite(freq) || freq <= 0) return;
    if (this.audioMode === 'tone' && this.tone && this.toneSynth) {
      const vel = this.#clamp(Number(velocity) || 1, 0.05, 1.5);
      const effectiveFreq = freq * (Number.isFinite(this.freqScale) ? this.freqScale : 1);
      this.stopHeldNote(id);
      const sampler = this.toneSampler;
      const holdSec = Number.isFinite(holdMs) && holdMs > 0 ? holdMs / 1000 : null;
      if (sampler && this.tone && this.tone.Frequency) {
        try {
          const note = this.tone.Frequency(effectiveFreq).toNote();
          const useOneShot = !!this.toneOneShot && !holdSec;
          if (sampler.triggerAttackRelease && (useOneShot || holdSec)) {
            const dur =
              holdSec ??
              this.attack + this.decay + this.release + 0.2;
            sampler.triggerAttackRelease(note, dur, undefined, Math.min(1, vel));
          } else if (sampler.triggerAttack) {
            sampler.triggerAttack(note, undefined, Math.min(1, vel));
            this.toneVoices.set(id, {
              synth: sampler,
              note,
              oneShot: !!this.toneOneShot,
            });
          }
          return;
        } catch {}
      }
      try {
        const velClamped = Math.min(1.5, vel);
        if (this.toneOneShot && !holdSec && this.toneSynth.triggerAttackRelease) {
          this.toneSynth.triggerAttackRelease(effectiveFreq, undefined, velClamped);
        } else if (holdSec && this.toneSynth.triggerAttackRelease) {
          this.toneSynth.triggerAttackRelease(effectiveFreq, holdSec, velClamped);
          this.toneVoices.set(id, {
            synth: this.toneSynth,
            note: effectiveFreq,
            oneShot: !!this.toneOneShot,
          });
        } else {
          this.toneSynth.triggerAttack(effectiveFreq, undefined, velClamped);
          this.toneVoices.set(id, {
            synth: this.toneSynth,
            note: effectiveFreq,
            oneShot: !!this.toneOneShot,
          });
        }
      } catch {}
      return;
    }

    if (!this.ctx) return;
    if (this.useNoise) {
      // noisy instruments (e.g., drums) stay one-shot
      this.playFrequency(freq, velocity);
      return;
    }

    // If this note is already ringing, refresh it
    this.stopHeldNote(id);

    const vel = this.#clamp(Number(velocity) || 1, 0.3, 1.5);
    const effectiveFreq = freq * (Number.isFinite(this.freqScale) ? this.freqScale : 1);
    const now = this.ctx.currentTime;
    const a = this.attack || 0.01;
    const d = this.decay || 0.24;
    const s = this.sustain || 0.5;

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
      const peak = Math.max(0.25, s * vel * level);

      osc.type = wave;
      osc.frequency.setValueAtTime(effectiveFreq * mult, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + a);
      gain.gain.exponentialRampToValueAtTime(s * vel * level, now + a + d);

      osc.connect(gain).connect(target);
      osc.start(now);
      return { osc, gain };
    };

    const oscNodes = [];
    // Fundamental
    oscNodes.push(spawnVoice({ wave: this.instrument || 'sine', mult: 1, level: 1 }));
    // Harmonics
    if (Array.isArray(this.partials)) {
      this.partials.forEach((p) => {
        const ratio = Number(p?.ratio) || 0;
        const level = Number(p?.level) || 0;
        if (ratio > 0 && level > 0.001) {
          oscNodes.push(
            spawnVoice({ wave: p.type || this.instrument || 'sine', mult: ratio, level })
          );
        }
      });
    }

    this.activeVoices.set(id, {
      oscillators: oscNodes.map((n) => n.osc),
      gain: oscNodes[0]?.gain || this.ctx.createGain(),
    });
  }

  /**
   * @param {number} freq
   * @param {number} [velocity=1]
   * @param {number|null} [holdMs=null] Optional hold duration in ms before release
   */
  playFrequency(freq, velocity = 1, holdMs = null) {
    if (!freq || !isFinite(freq) || freq <= 0) return;

    if (this.audioMode === 'tone' && this.tone && this.toneSynth) {
      const vel = this.#clamp(Number(velocity) || 1, 0.05, 1.5);
      const holdSec = Number.isFinite(holdMs) && holdMs > 0 ? holdMs / 1000 : 0;
      const effectiveFreq = freq * (Number.isFinite(this.freqScale) ? this.freqScale : 1);
      const sampler = this.toneSampler;
      if (sampler && sampler.triggerAttackRelease && this.tone && this.tone.Frequency) {
        try {
          const note = this.tone.Frequency(effectiveFreq).toNote();
          const dur =
            holdSec > 0
              ? holdSec
              : this.toneOneShot
              ? this.attack + this.decay + this.release + 0.25
              : this.attack + this.decay + this.release + 0.05;
          sampler.triggerAttackRelease(note, dur, undefined, Math.min(1, vel));
          return;
        } catch {}
      }
      try {
        const dur =
          holdSec > 0
            ? holdSec
            : this.toneOneShot
            ? this.attack + this.decay + this.release + 0.2
            : this.attack + this.decay + this.release + 0.05;
        this.toneSynth.triggerAttackRelease(
          effectiveFreq,
          dur,
          undefined,
          Math.min(1.5, vel)
        );
      } catch {}
      return;
    }

    if (!this.ctx) return;

    const vel = this.#clamp(Number(velocity) || 1, 0.3, 1.5);
    const effectiveFreq = freq * (Number.isFinite(this.freqScale) ? this.freqScale : 1);
    const now = this.ctx.currentTime;
    const a = this.attack || 0.01;
    const d = this.decay || 0.24;
    const r = this.release || 0.18;
    const s = this.sustain || 0.5;
    const holdSec = Number.isFinite(holdMs) && holdMs > 0 ? holdMs / 1000 : 0;

    if (this.useNoise) {
      const length = Math.max(0.35, a + d + r + holdSec + 0.1);
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
      if (holdSec > 0) {
        gain.gain.setValueAtTime(Math.max(0.02, s * vel), now + a + d + holdSec);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + holdSec + r);

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
        if (holdSec > 0) {
          gain.gain.setValueAtTime(s * vel * level, now + a + d + holdSec);
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d + holdSec + r);

        osc.connect(gain).connect(target);
        osc.start(now);
        osc.stop(now + a + d + holdSec + r + 0.05);
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

