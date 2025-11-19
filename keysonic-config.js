// keysonic-config.js

/**
 * @typedef {Object} MainKey
 * @property {string} label
 * @property {string} code
 * @property {number} [span]
 * @property {boolean} [small]
 * @property {boolean} [space]
 */

/**
 * @typedef {Object} NumpadKey
 * @property {string} label
 * @property {string} code
 * @property {number} r
 * @property {number} c
 * @property {number} [rowSpan]
 * @property {number} [colSpan]
 * @property {boolean} [small]
 */

/** @type {MainKey[][]} */
export const layoutMain = [
  [
    { label: "`", code: "`" },
    { label: "1", code: "1" },
    { label: "2", code: "2" },
    { label: "3", code: "3" },
    { label: "4", code: "4" },
    { label: "5", code: "5" },
    { label: "6", code: "6" },
    { label: "7", code: "7" },
    { label: "8", code: "8" },
    { label: "9", code: "9" },
    { label: "0", code: "0" },
    { label: "-", code: "-" },
    { label: "=", code: "=" },
    { label: "Backspace", code: "Backspace", span: 2, small: true }
  ],
  [
    { label: "Tab", code: "Tab", span: 1.6, small: true },
    { label: "Q", code: "Q" },
    { label: "W", code: "W" },
    { label: "E", code: "E" },
    { label: "R", code: "R" },
    { label: "T", code: "T" },
    { label: "Y", code: "Y" },
    { label: "U", code: "U" },
    { label: "I", code: "I" },
    { label: "O", code: "O" },
    { label: "P", code: "P" },
    { label: "[", code: "[" },
    { label: "]", code: "]" },
    { label: "\\", code: "\\", span: 1.4 }
  ],
  [
    { label: "Caps", code: "CapsLock", span: 1.9, small: true },
    { label: "A", code: "A" },
    { label: "S", code: "S" },
    { label: "D", code: "D" },
    { label: "F", code: "F" },
    { label: "G", code: "G" },
    { label: "H", code: "H" },
    { label: "J", code: "J" },
    { label: "K", code: "K" },
    { label: "L", code: "L" },
    { label: ";", code: ";" },
    { label: "'", code: "'" },
    { label: "Enter", code: "Enter", span: 2.3, small: true }
  ],
  [
    { label: "Shift", code: "Shift", span: 2.4, small: true },
    { label: "Z", code: "Z" },
    { label: "X", code: "X" },
    { label: "C", code: "C" },
    { label: "V", code: "V" },
    { label: "B", code: "B" },
    { label: "N", code: "N" },
    { label: "M", code: "M" },
    { label: ",", code: "," },
    { label: ".", code: "." },
    { label: "/", code: "/" },
    { label: "Shift", code: "Shift", span: 2.4, small: true }
  ],
  [
    { label: "Ctrl", code: "Control", span: 1.4, small: true },
    { label: "Fn", code: "Fn", span: 1.1, small: true },
    { label: "Alt", code: "Alt", span: 1.3, small: true },
    { label: "Space", code: " ", span: 4.2, space: true },
    { label: "Alt", code: "Alt", span: 1.3, small: true },
    { label: "Ctrl", code: "Control", span: 1.4, small: true },
    { label: "←", code: "ArrowLeft" },
    { label: "↑", code: "ArrowUp" },
    { label: "↓", code: "ArrowDown" },
    { label: "→", code: "ArrowRight" }
  ]
];

/** @type {NumpadKey[]} */
export const layoutNumpadGrid = [
  { label: "Num",   code: "NumLock",        r: 1, c: 1, small: true },
  { label: "/",     code: "NumpadDivide",   r: 1, c: 2 },
  { label: "*",     code: "NumpadMultiply", r: 1, c: 3 },
  { label: "-",     code: "NumpadSubtract", r: 1, c: 4 },

  { label: "7",     code: "Numpad7",        r: 2, c: 1 },
  { label: "8",     code: "Numpad8",        r: 2, c: 2 },
  { label: "9",     code: "Numpad9",        r: 2, c: 3 },
  { label: "+",     code: "NumpadAdd",      r: 2, c: 4, rowSpan: 2, small: true },

  { label: "4",     code: "Numpad4",        r: 3, c: 1 },
  { label: "5",     code: "Numpad5",        r: 3, c: 2 },
  { label: "6",     code: "Numpad6",        r: 3, c: 3 },

  { label: "1",     code: "Numpad1",        r: 4, c: 1 },
  { label: "2",     code: "Numpad2",        r: 4, c: 2 },
  { label: "3",     code: "Numpad3",        r: 4, c: 3 },
  { label: "Enter", code: "NumpadEnter",    r: 4, c: 4, rowSpan: 2, small: true },

  { label: "0",     code: "Numpad0",        r: 5, c: 1, colSpan: 2 },
  { label: ".",     code: "NumpadDecimal",  r: 5, c: 3 }
];

export const DISTINCT_HUES = [
  0,   15,  30,  45,
  60,  75,  90,  105,
  120, 135, 150, 165,
  180, 195, 210, 225,
  240, 255, 270, 285,
  300, 315, 330, 345
];
export const STORAGE_KEY = "keysonic-saved-v1";
export const TYPED_MAX_LENGTH = 500;
