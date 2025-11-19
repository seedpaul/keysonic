/**
 * @typedef {Object} ScaleConfig
 * @property {string} id
 * @property {string} label
 * @property {number[]} steps
 * @property {number} offset
 * @property {number} octaves
 */

/** @type {Record<string, ScaleConfig>} */
export const SCALES = {
  major: {
    id: "major",
    label: "Major",
    steps: [0, 2, 4, 5, 7, 9, 11],
    offset: 0,      // baseline
    octaves: 3
  },
  naturalMinor: {
    id: "naturalMinor",
    label: "Natural Minor",
    steps: [0, 2, 3, 5, 7, 8, 10],
    offset: -2,     // a bit lower & moodier
    octaves: 3
  },
  majorPentatonic: {
    id: "majorPentatonic",
    label: "Major Pentatonic",
    steps: [0, 2, 4, 7, 9],
    offset: 0,      // open, friendly
    octaves: 2
  },
  minorPentatonic: {
    id: "minorPentatonic",
    label: "Minor Pentatonic",
    steps: [0, 3, 5, 7, 10],
    offset: -5,     // lower, bluesy
    octaves: 2
  },
  lydian: {
    id: "lydian",
    label: "Bright (Lydian)",
    steps: [0, 2, 4, 6, 7, 9, 11],
    offset: +5,     // shifted up: more sparkle
    octaves: 3
  },
  phrygian: {
    id: "phrygian",
    label: "Spooky (Phrygian)",
    steps: [0, 1, 3, 5, 7, 8, 10],
    offset: -7,     // dark, low register
    octaves: 2
  }
};

const DEFAULT_ROOT_FREQ = 130.81; // C3: warm, clear, not tiny

/**
 * @param {string} scaleId
 * @returns {ScaleConfig}
 */
export function getScaleConfig(scaleId) {
  return SCALES[scaleId] || SCALES.major;
}

/**
 * @param {number} idx
 * @param {string} [scaleId]
 * @param {number} [rootFreq]
 */
export function getFrequencyForIndex(idx, scaleId = "major", rootFreq = DEFAULT_ROOT_FREQ) {
  const scale = getScaleConfig(scaleId);
  const steps = scale.steps;
  const degreesPerOctave = steps.length;

  const maxOctaves = scale.octaves || 3;
  const offset = scale.offset || 0; // semitones from base root

  if (idx < 0) idx = 0;

  const windowSize = degreesPerOctave * maxOctaves;
  const wrapped = windowSize > 0 ? idx % windowSize : 0;

  const degree = wrapped % degreesPerOctave;
  const octave = Math.floor(wrapped / degreesPerOctave);

  const semitonesFromRoot = offset + steps[degree] + 12 * octave;
  return rootFreq * Math.pow(2, semitonesFromRoot / 12);
}
