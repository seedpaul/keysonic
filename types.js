// types.js
/**
 * @typedef {Object} RecordingEntry
 * @property {string} id
 * @property {string} name
 * @property {string[]} sequence
 * @property {string[]} playSequence
 * @property {boolean} loop
 * @property {boolean} reverse
 * @property {boolean} compose
 * @property {{ code: string, offsetMs: number, velocity?: number }[]} [timedEvents]
 * @property {{ tempo?: number, scaleId?: string, instrument?: string, rootFreq?: number }} [settings]
 */

export const __types = {};

