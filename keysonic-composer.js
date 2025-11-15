export function composeFromText(codeSeq, opts = {}) {
  const {
    meter = "4/4",
    unit = "eighth",
    tempo = 120,
    restBetweenWords = 2,
    wordContour = "arch",
    maxSpan = 4,
  } = opts;

  if (!Array.isArray(codeSeq) || !codeSeq.length) {
    return { meter, unit, tempo, events: [] };
  }

  // Treat these as "word separators"
  const WORD_SEPS = new Set([
    " ",
    "Space",
    "Enter",
    "Tab",
    "Backspace",
    "CapsLock",
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "Fn",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "NumLock",
  ]);

  // Treat punctuation-like codes as sentence breaks (approx)
  const SENTENCE_SEPS = new Set([
    "Period",
    "Comma",
    "Semicolon",
    "Quote",
    "Slash",
    "Question",
    "QuestionMark",
    "Exclamation",
  ]);

  const words = [];
  let cur = [];

  for (const code of codeSeq) {
    if (WORD_SEPS.has(code)) {
      if (cur.length) {
        words.push(cur);
        cur = [];
      }
      words.push(["__SEP__"]);
    } else if (SENTENCE_SEPS.has(code)) {
      if (cur.length) {
        words.push(cur);
        cur = [];
      }
      words.push(["__SENT_BREAK__"]);
    } else {
      cur.push(code);
    }
  }
  if (cur.length) words.push(cur);

  const events = [];
  let stepCursor = 0;
  let lastSentenceEndCode = null;

  // A few rhythmic "feels" for words
  const WORD_PATTERNS = {
    "4/4": [
      [2, 1, 2, 1, 2],     // med, short, med...
      [1, 1, 2, 2, 2],     // bouncy front
      [1, 2, 1, 2, 2],     // syncopation
    ],
    "3/4": [
      [1, 1, 1, 2],        // triplet-ish then long
      [2, 1, 2],           // med, short, med
    ],
  };

  const basePatterns = WORD_PATTERNS[meter] || WORD_PATTERNS["4/4"];

  const buildWord = (codes, wordIndex) => {
    if (!codes.length) return;

    const h = hashWordCodes(codes);
    const pattern = basePatterns[Math.abs(h) % basePatterns.length];
    const contourShape = selectContourShape(h, wordContour);
    const contour = makeContour(codes.length, contourShape, maxSpan);

    // --- main word events ---
    let p = 0;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      let durSteps = pattern[p % pattern.length];
      p++;

      // Vowels lean a bit longer
      if (isVowelCode(code)) {
        durSteps = Math.min(durSteps + 1, 4);
      }

      events.push({
        step: stepCursor,
        code,
        dur: durSteps,
        move: contour[i] || 0,
        wordIndex,
        idxInWord: i,
        echo: false,
        bassOffset: 0,
      });

      stepCursor += durSteps;
      lastSentenceEndCode = code;
    }

    // --- SUPER ECHO RIFF at word end ---
    const echoLen = Math.min(3, codes.length);
    if (echoLen > 0) {
      const echoStart = codes.length - echoLen;
      const baseOffsets = [-2, -1, 0]; // bass walk down, then back up
      const layers = 1 + (Math.abs(h) % 2); // 1 or 2 layers

      for (let layer = 0; layer < layers; layer++) {
        const layerOffset = baseOffsets[layer] ?? baseOffsets[0];

        for (let j = echoStart; j < codes.length; j++) {
          const echoCode = codes[j];

          const echoDur = 1; // short punches
          events.push({
            step: stepCursor,
            code: echoCode,
            dur: echoDur,
            move: contour[j] || 0,
            wordIndex,
            idxInWord: j,
            echo: true,
            bassOffset: layerOffset,
          });

          stepCursor += echoDur;

          // Tiny rest after each echo hit for extra funk
          events.push({
            step: stepCursor,
            code: "__REST__",
            dur: 1,
            echo: true,
            bassOffset: 0,
          });
          stepCursor += 1;

          lastSentenceEndCode = echoCode;
        }
      }
    }
  };

  words.forEach((w, idx) => {
    // Sentence break → bass hit + big rest
    if (w.length === 1 && w[0] === "__SENT_BREAK__") {
      if (lastSentenceEndCode) {
        events.push({
          step: stepCursor,
          code: lastSentenceEndCode,
          dur: 3,
          move: -2,
          sentenceBreak: true,
          echo: false,
          bassOffset: -3,
        });
        stepCursor += 3;
      }
      stepCursor += restBetweenWords * 2;
      return;
    }

    // Word separator → rest
    if (w.length === 1 && w[0] === "__SEP__") {
      stepCursor += restBetweenWords;
      return;
    }

    // Actual word
    buildWord(w, idx);
    stepCursor += restBetweenWords;
  });

  return {
    meter,
    unit,
    tempo,
    events,
  };
}

function hashWordCodes(codes) {
  let h = 0;
  for (const c of codes) {
    for (let i = 0; i < c.length; i++) {
      h = (h * 31 + c.charCodeAt(i)) | 0;
    }
  }
  return h;
}

function selectContourShape(hash, baseShape) {
  const shapes = ["arch", "rise", "fall"];
  if (baseShape && shapes.includes(baseShape)) return baseShape;
  return shapes[Math.abs(hash) % shapes.length];
}

function isVowelCode(code) {
  if (!code || typeof code !== "string") return false;
  // We currently only know letter keys like "KeyA"
  if (!code.startsWith("Key")) return false;
  const ch = code.slice(3).toUpperCase();
  return "AEIOUY".includes(ch);
}

function makeContour(n, shape, span) {
  const out = new Array(n).fill(0);
  if (n <= 1) return out;

  if (shape === "rise") {
    for (let i = 0; i < n; i++) {
      out[i] = Math.round((i / (n - 1)) * span);
    }
    return centerZero(out);
  }

  if (shape === "fall") {
    for (let i = 0; i < n; i++) {
      out[i] = Math.round(((n - 1 - i) / (n - 1)) * span);
    }
    return centerZero(out);
  }

  // default arch: peak in the center
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const x = Math.abs(i - mid) / mid; // 0..1
    out[i] = Math.round((1 - x) * span);
  }
  return centerZero(out);
}

function centerZero(a) {
  const min = Math.min(...a);
  const max = Math.max(...a);
  const mid = (min + max) / 2;
  return a.map((v) => Math.round(v - mid));
}

function encodeCodeToken(code, { echo = false, bassOffset = 0 } = {}) {
  if (code === "__REST__") return "__REST__";

  const tags = [];
  if (echo) tags.push("ECHO");
  if (bassOffset && Number.isFinite(bassOffset)) {
    tags.push(`B${bassOffset}`);
  }

  if (!tags.length) return code;
  return `${tags.join(":")}:${code}`;
}

export function flattenEventsToStepCodes(song) {
  const out = [];
  if (!song || !Array.isArray(song.events)) return out;

  for (const ev of song.events) {
    if (!ev) continue;

    if (ev.code === "__REST__") {
      // Single-step rest
      out.push("__REST__");
      continue;
    }

    const steps = ev.dur || 1;
    const token = encodeCodeToken(ev.code, {
      echo: !!ev.echo,
      bassOffset: ev.bassOffset || 0,
    });

    for (let i = 0; i < steps; i++) {
      out.push(token);
    }
  }

  return out;
}
