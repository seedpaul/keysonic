// services/playback-service.js
import store from '../store/keysonic-store.js';

const STEP_BASE_MS = 220;

export class PlaybackService {
  constructor() {
    this.timeoutId = null;
    this.listeners = new Map();
    this.prevOffsetMs = 0;
  }

  /**
   * @param {'start'|'stop'|'step'} type
   * @param {(payload: any) => void} handler
   */
  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  play({ sequence, label, id, reversed = false, settings = null }) {
    if (!sequence?.length) return;

    this.stop();
    this.prevOffsetMs = 0;

    store.mutate((state) => {
      state.isPlayingBack = true;
      state.isRecording = false;
      state.playback = {
        id: id || null,
        sequence: Array.isArray(sequence) ? sequence.slice() : [],
        index: reversed ? sequence.length - 1 : 0,
        reversed,
        label: label || '',
        settings: settings || null,
      };
    });

    this.#emit('start', store.getState().playback);
    this.#queueNext();
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.prevOffsetMs = 0;

    const wasPlaying = store.getState().isPlayingBack;
    store.mutate((state) => {
      state.isPlayingBack = false;
      state.playback = {
        id: null,
        sequence: [],
        index: 0,
        reversed: false,
        label: '',
      };
    });

    if (wasPlaying) {
      this.#emit('stop');
    }
  }

  #queueNext() {
    const state = store.getState();
    const { playback, tempo } = state;
    const { sequence } = playback;
    if (!state.isPlayingBack || !sequence.length) {
      this.stop();
      return;
    }

    const { index } = playback;
    if (index < 0 || index >= sequence.length) {
      const shouldLoop = this.#shouldLoop(playback.id);
      if (!shouldLoop) {
        this.timeoutId = setTimeout(() => this.stop(), 200 / (tempo || 1));
        return;
      }
      this.prevOffsetMs = 0;
      store.mutate((draft) => {
        draft.playback.index = draft.playback.reversed
          ? draft.playback.sequence.length - 1
          : 0;
      });
      this.#queueNext();
      return;
    }

    const item = sequence[index];
    const tempoVal = tempo || 1;
    const currentOffset = this.#getOffsetMs(item);
    const lastOffset = this.prevOffsetMs || 0;
    const delayBefore =
      currentOffset != null && !playback.reversed
        ? Math.max(0, currentOffset - lastOffset) / tempoVal
        : 0;

    const runStep = () => {
      const payload =
        item && typeof item === 'object'
          ? {
              code: item.code,
              velocity: item.velocity,
              settings: item.settings,
              durationMs: item.durationMs,
            }
          : { code: item, settings: playback.settings };
      const code = payload.code;
      this.#emit('step', {
        code,
        velocity: payload.velocity,
        settings: payload.settings || playback.settings || null,
        index,
        playbackId: playback.id,
        sequence,
        durationMs: payload.durationMs,
      });

      const nextIdx = playback.reversed ? index - 1 : index + 1;
      const nextEvent = sequence[nextIdx];
      const nextOffset = this.#getOffsetMs(nextEvent);

      // Look ahead so the next queue pass doesn't re-wait the same delta.
      this.prevOffsetMs =
        nextOffset != null
          ? nextOffset
          : currentOffset != null
          ? currentOffset
          : lastOffset;

      store.mutate((draft) => {
        const step = draft.playback.reversed ? -1 : 1;
        draft.playback.index += step;
      });

      let delayMs = STEP_BASE_MS / tempoVal;

      if (currentOffset != null && nextOffset != null) {
        const delta = Math.abs(nextOffset - currentOffset);
        delayMs = Math.max(0, delta) / tempoVal;
      }

      this.timeoutId = setTimeout(() => this.#queueNext(), delayMs);
    };

    if (delayBefore > 0) {
      this.timeoutId = setTimeout(runStep, delayBefore);
    } else {
      runStep();
    }
  }

  #getOffsetMs(item) {
    if (item && typeof item === 'object' && typeof item.offsetMs === 'number') {
      return Math.max(0, item.offsetMs);
    }
    return null;
  }

  #shouldLoop(id) {
    if (!id) return false;
    const record = store.getState().savedRecordings.find((r) => r.id === id);
    return !!record?.loop;
  }

  #emit(type, payload) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    listeners.forEach((fn) => fn(payload));
  }
}

const playbackService = new PlaybackService();
export default playbackService;

