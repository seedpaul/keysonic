// services/recording-service.js
import store from '../store/keysonic-store.js';
import { TYPED_MAX_LENGTH } from '../keysonic-config.js';
import { mapCodeToCharForTyping } from '../typing-utils.js';

class RecordingService {
  constructor() {
    this._startTime = null;
    this._downTimes = new Map();
  }

  start() {
    this._startTime = null;
    this._downTimes.clear();
    store.mutate((state) => {
      state.isRecording = true;
      state.isPlayingBack = false;
      state.recordedSequence = [];
      state.recordedEvents = [];
    });
  }

  stop() {
    store.mutate((state) => {
      state.isRecording = false;
    });
  }

  clear() {
    this._startTime = null;
    this._downTimes.clear();
    store.mutate((state) => {
      state.recordedSequence = [];
      state.recordedEvents = [];
      state.typedText = '';
      state.typedCodeSequence = [];
    });
  }

  clearRecordedSequence() {
    this._startTime = null;
    this._downTimes.clear();
    store.mutate((state) => {
      state.recordedSequence = [];
      state.recordedEvents = [];
    });
  }

  recordKey(code, meta = {}) {
    const state = store.getState();
    if (!state.isRecording || state.isPlayingBack) return;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (this._startTime === null) {
      this._startTime = meta.eventTime || now;
    }
    const eventTime = Number.isFinite(meta.eventTime) ? meta.eventTime : now;
    const offsetMs = Math.max(0, Math.round(eventTime - this._startTime));
    const velocity = Number.isFinite(meta.velocity) ? meta.velocity : undefined;
    this._downTimes.set(code, eventTime);

    store.mutate((draft) => {
      draft.recordedSequence.push(code);
      draft.recordedEvents.push({
        code,
        offsetMs,
        ...(velocity !== undefined ? { velocity } : {}),
      });
    });
  }

  recordKeyRelease(code, meta = {}) {
    const state = store.getState();
    if (!state.isRecording || state.isPlayingBack) return;
    const now =
      Number.isFinite(meta.eventTime) && meta.eventTime >= 0
        ? meta.eventTime
        : typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    if (this._startTime === null) {
      this._startTime = now;
    }
    const offsetMs = Math.max(0, Math.round(now - this._startTime));
    const downAt = this._downTimes.get(code);
    const durationMs =
      Number.isFinite(downAt) && downAt <= now ? Math.max(1, Math.round(now - downAt)) : undefined;

    store.mutate((draft) => {
      for (let i = draft.recordedEvents.length - 1; i >= 0; i--) {
        const ev = draft.recordedEvents[i];
        if (ev && ev.code === code && ev.durationMs === undefined) {
          if (durationMs !== undefined) ev.durationMs = durationMs;
          return;
        }
      }
      draft.recordedEvents.push({
        code,
        offsetMs,
        ...(durationMs !== undefined ? { durationMs } : {}),
      });
    });
  }

  appendTyped(code, meta = {}) {
    const ch = mapCodeToCharForTyping(code);
    if (ch === null || ch === undefined) return;

    const now =
      Number.isFinite(meta.eventTime) && meta.eventTime >= 0
        ? meta.eventTime
        : typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    if (this._startTime === null) {
      this._startTime = now;
    }
    const offsetMs = Math.max(0, Math.round(now - this._startTime));
    const velocity = Number.isFinite(meta.velocity) ? meta.velocity : undefined;

    store.mutate((draft) => {
      draft.typedText += ch;
      draft.typedCodeSequence.push(code);
      // Only capture timing for typed sequences when we're NOT actively recording.
      if (!draft.isRecording && !draft.isPlayingBack) {
        const ev = { code, offsetMs };
        if (velocity !== undefined) ev.velocity = velocity;
        draft.recordedEvents.push(ev);
      }
      if (draft.typedText.length > TYPED_MAX_LENGTH) {
        const overflow = draft.typedText.length - TYPED_MAX_LENGTH;
        draft.typedText = draft.typedText.slice(overflow);
        draft.typedCodeSequence = draft.typedCodeSequence.slice(overflow);
        draft.recordedEvents = draft.recordedEvents.slice(Math.max(0, draft.recordedEvents.length - TYPED_MAX_LENGTH));
      }
    });
  }

  resetTyped() {
    this._startTime = null;
    this._downTimes.clear();
    store.mutate((state) => {
      state.typedText = '';
      state.typedCodeSequence = [];
      state.recordedEvents = [];
    });
  }
}

const recordingService = new RecordingService();
export default recordingService;

