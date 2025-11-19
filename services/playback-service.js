// services/playback-service.js
import store from '../store/keysonic-store.js';

const STEP_BASE_MS = 220;

export class PlaybackService {
  constructor() {
    this.timeoutId = null;
    this.listeners = new Map();
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

  play({ sequence, label, id, reversed = false }) {
    if (!sequence?.length) return;

    this.stop();

    store.mutate((state) => {
      state.isPlayingBack = true;
      state.isRecording = false;
      state.playback = {
        id: id || null,
        sequence: sequence.slice(),
        index: reversed ? sequence.length - 1 : 0,
        reversed,
        label: label || '',
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
      store.mutate((draft) => {
        draft.playback.index = draft.playback.reversed
          ? draft.playback.sequence.length - 1
          : 0;
      });
      this.#queueNext();
      return;
    }

    const code = sequence[index];
    this.#emit('step', {
      code,
      index,
      playbackId: playback.id,
      sequence,
    });

    store.mutate((draft) => {
      const step = draft.playback.reversed ? -1 : 1;
      draft.playback.index += step;
    });

    const ms = STEP_BASE_MS / (tempo || 1);
    this.timeoutId = setTimeout(() => this.#queueNext(), ms);
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

