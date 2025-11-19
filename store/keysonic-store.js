// store/keysonic-store.js
/**
 * @typedef {Object} PlaybackSnapshot
 * @property {string|null} id
 * @property {string[]} sequence
 * @property {number} index
 * @property {boolean} reversed
 * @property {string} label
 */

/**
 * @typedef {Object} KeysonicState
 * @property {boolean} isRecording
 * @property {boolean} isPlayingBack
 * @property {string[]} recordedSequence
 * @property {string} typedText
 * @property {string[]} typedCodeSequence
 * @property {import('../types.js').RecordingEntry[]} savedRecordings
 * @property {number} tempo
 * @property {string} currentScaleId
 * @property {number} rootFreq
 * @property {PlaybackSnapshot} playback
 */

/**
 * Lightweight store with pub/sub semantics.
 */
const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

class KeysonicStore {
  /**
   * @param {KeysonicState} initial
   */
  constructor(initial) {
    this.state = clone(initial);
    this.listeners = new Set();
  }

  /**
   * @returns {KeysonicState}
   */
  getState() {
    return this.state;
  }

  /**
   * @param {(state: KeysonicState) => KeysonicState} updater
   */
  update(updater) {
    const next = updater(clone(this.state));
    this.state = next;
    this.#notify();
  }

  /**
   * @param {(state: KeysonicState) => void} mutator
   */
  mutate(mutator) {
    const next = clone(this.state);
    mutator(next);
    this.state = next;
    this.#notify();
  }

  /**
   * @param {(state: KeysonicState) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

const defaultState = /** @type {KeysonicState} */ ({
  isRecording: false,
  isPlayingBack: false,
  recordedSequence: [],
  typedText: '',
  typedCodeSequence: [],
  savedRecordings: [],
  tempo: 1,
  currentScaleId: 'major',
  rootFreq: 220,
  playback: {
    id: null,
    sequence: [],
    index: 0,
    reversed: false,
    label: '',
  },
});

const store = new KeysonicStore(defaultState);

export default store;

