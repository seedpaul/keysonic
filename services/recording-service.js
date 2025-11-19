// services/recording-service.js
import store from '../store/keysonic-store.js';
import { TYPED_MAX_LENGTH } from '../keysonic-config.js';
import { mapCodeToCharForTyping } from '../typing-utils.js';

class RecordingService {
  start() {
    store.mutate((state) => {
      state.isRecording = true;
      state.isPlayingBack = false;
      state.recordedSequence = [];
    });
  }

  stop() {
    store.mutate((state) => {
      state.isRecording = false;
    });
  }

  clear() {
    store.mutate((state) => {
      state.recordedSequence = [];
      state.typedText = '';
      state.typedCodeSequence = [];
    });
  }

  clearRecordedSequence() {
    store.mutate((state) => {
      state.recordedSequence = [];
    });
  }

  recordKey(code) {
    const state = store.getState();
    if (!state.isRecording || state.isPlayingBack) return;
    store.mutate((draft) => {
      draft.recordedSequence.push(code);
    });
  }

  appendTyped(code) {
    const ch = mapCodeToCharForTyping(code);
    if (ch === null || ch === undefined) return;
    store.mutate((draft) => {
      draft.typedText += ch;
      draft.typedCodeSequence.push(code);
      if (draft.typedText.length > TYPED_MAX_LENGTH) {
        const overflow = draft.typedText.length - TYPED_MAX_LENGTH;
        draft.typedText = draft.typedText.slice(overflow);
        draft.typedCodeSequence = draft.typedCodeSequence.slice(overflow);
      }
    });
  }

  resetTyped() {
    store.mutate((state) => {
      state.typedText = '';
      state.typedCodeSequence = [];
    });
  }
}

const recordingService = new RecordingService();
export default recordingService;

