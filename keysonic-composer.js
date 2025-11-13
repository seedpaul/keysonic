// keysonic-composer.js
// Turn a typedCodeSequence into a more melodic & rhythmic pattern.

export function composeFromText(codeSeq, opts = {}) {
  const {
    meter = "4/4",                 // "4/4" | "3/4"
    unit = "eighth",               // must match SONG_STEP_NOTE_VALUE
    tempo = 120,                   // BPM, for export metadata only
    restBetweenWords = 1,          // steps of rest between words
    wordContour = "arch",          // "arch" | "rise" | "fall"
    maxSpan = 4,                   // max scale-degree span per motif
  } = opts;

  // Split at “word separators” (space & action keys)
  const SEPS = new Set([" ", "Space", "Enter", "Tab", "Backspace",
                        "CapsLock", "Shift", "Control", "Alt", "Meta", "Fn",
                        "ArrowLeft","ArrowRight","ArrowUp","ArrowDown","NumLock"]);

  const words = [];
  let cur = [];
  for (const code of codeSeq) {
    if (SEPS.has(code)) {
      if (cur.length) words.push(cur), (cur = []);
      // keep a separator token to add rests
      words.push(["__SEP__"]);
    } else {
      cur.push(code);
    }
  }
  if (cur.length) words.push(cur);

  const events = [];
  let stepCursor = 0;

  // Simple bar patterns (in steps). Eighth-note grid.
  const patterns = {
    "4/4": [1,1,2, 1,1,2],     // ♪ ♪ ♩ | ♪ ♪ ♩
    "3/4": [1,1,1, 1,2],       // ♪ ♪ ♪ | ♪ ♩
  };
  const pat = patterns[meter] || patterns["4/4"];

  for (const w of words) {
    if (w.length === 1 && w[0] === "__SEP__") {
      // rest between words
      stepCursor += restBetweenWords;
      continue;
    }
    if (!w.length) continue;

    // Build a melodic contour over this word
    const contour = makeContour(w.length, wordContour, maxSpan);

    // Walk the pattern & the letters together
    let p = 0;
    for (let i = 0; i < w.length; i++) {
      const code = w[i];
      const durSteps = pat[p % pat.length]; p++;

      // Encode the melodic move as a harmless tag we’ll read in the engine:
      events.push({
        step: stepCursor,
        code,
        dur: durSteps,      // in steps (eighths)
        move: contour[i],   // -n … +n scale-degree move from local center
      });

      stepCursor += durSteps;
    }
    // small post-word rest
    stepCursor += restBetweenWords;
  }

  return {
    meter,
    unit,
    tempo,
    events,
  };
}

// Generate a degree contour for a word length
function makeContour(n, shape, span) {
  const out = new Array(n).fill(0);
  if (n <= 1) return out;

  if (shape === "rise") {
    for (let i = 0; i < n; i++) out[i] = Math.round((i / (n - 1)) * span);
    return centerZero(out);
  }
  if (shape === "fall") {
    for (let i = 0; i < n; i++) out[i] = Math.round(((n - 1 - i) / (n - 1)) * span);
    return centerZero(out);
  }
  // default: arch
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const x = Math.abs(i - mid) / mid; // 0..1
    out[i] = Math.round((1 - x) * span);
  }
  // Convert to up-down symmetric around 0: e.g., [0,2,3,2,0] → [-1, +1, +2, +1, -1]
  // (keeps center high but relative)
  for (let i = 0; i < n; i++) out[i] = out[i] - Math.round(span / 2);
  return out;
}

function centerZero(a) {
  // normalize around 0
  const min = Math.min(...a), max = Math.max(...a);
  const mid = (min + max) / 2;
  return a.map(v => Math.round(v - mid));
}

// Flatten to stepwise codes if you want to re-use your existing playSequence runner
export function flattenEventsToStepCodes(song) {
  const out = [];
  for (const ev of song.events) {
    if (!ev || !ev.code) continue;
    for (let i = 0; i < (ev.dur || 1); i++) {
      out.push(ev.code);
    }
  }
  return out;
}
