// services/recording-repository.js
import { STORAGE_KEY } from '../keysonic-config.js';
import { mapCodeToCharForTyping } from '../typing-utils.js';

const safeStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
};

/**
 * Centralized persistence layer for recordings.
 */
export class RecordingRepository {
  /**
   * @param {string} storageKey
   * @param {Storage} storage
   */
  constructor(storageKey = STORAGE_KEY, storage = safeStorage()) {
    this.storageKey = storageKey;
    this.storage = storage;
  }

  /**
    * @returns {import('../types.js').RecordingEntry[]}
    */
  load() {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((r) => r && Array.isArray(r.sequence))
        .map((entry) => this.#normalize(entry));
    } catch {
      return [];
    }
  }

  /**
   * @param {import('../types.js').RecordingEntry[]} recordings
   */
  save(recordings) {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(recordings));
    } catch {
      // ignore quota errors
    }
  }

  /**
   * @param {Object} params
   * @param {string} params.name
   * @param {string[]} params.playSequence
   * @param {string[]} [params.displaySequence]
   * @returns {import('../types.js').RecordingEntry}
   */
  createRecording({ name, playSequence, displaySequence }) {
    const sequence = Array.isArray(displaySequence)
      ? displaySequence.slice()
      : this.toDisplaySequence(playSequence);

    return {
      id: this.#makeId(),
      name,
      sequence,
      playSequence: playSequence.slice(),
      loop: false,
      reverse: false,
      compose: false,
    };
  }

  /**
   * @param {string[]} playSequence
   */
  toDisplaySequence(playSequence = []) {
    return playSequence.map((code) => {
      const ch = mapCodeToCharForTyping(code);
      return ch !== null && ch !== undefined ? ch : code;
    });
  }

  /**
   * @param {string} base
   * @param {import('../types.js').RecordingEntry[]} existing
   */
  makeUniqueName(base, existing) {
    const safeBase = base || 'Recording';
    let name = safeBase;
    let i = 2;
    const names = new Set(existing.map((r) => r.name));
    while (names.has(name)) {
      name = `${safeBase} (${i++})`;
    }
    return name;
  }

  #normalize(raw) {
    const playSequence = Array.isArray(raw.playSequence)
      ? raw.playSequence.slice()
      : raw.sequence.slice();
    const sequence = Array.isArray(raw.sequence) && raw.sequence.length
      ? raw.sequence.slice()
      : this.toDisplaySequence(playSequence);
    return {
      id: raw.id || this.#makeId(),
      name: raw.name || 'Recording',
      sequence,
      playSequence,
      loop: !!raw.loop,
      reverse: !!raw.reverse,
      compose: !!raw.compose,
    };
  }

  #makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}

