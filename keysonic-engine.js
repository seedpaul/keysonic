// keysonic-engine.js
import {
  layoutMain,
  layoutNumpadGrid,
  DISTINCT_HUES,
  STORAGE_KEY,
  TYPED_MAX_LENGTH,
} from "./keysonic-config.js";

import {
  getDomRefs,
  buildKeyboards,
  setNowPlaying,
  renderSavedGrid,
} from "./layout.js";

import { getFrequencyForIndex, SCALES } from "./keysonic-scales.js";

const ACTION_CODES = new Set([
  "Backspace",
  "Tab",
  "CapsLock",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "NumLock",
  "ScrollLock",
  "Pause",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Enter",
  "ContextMenu",
  "Fn",
]);

// ----- State -----

let isRecording = false;
let isPlayingBack = false;
let recordedSequence = [];

let playbackTimeoutId = null;
let playbackSequence = null;
let playbackIndex = 0;
let playbackLabel = "";

let keyOrder = [];
let keyElements = {};
let keyboardEls = [];
let audioCtx;

let titleEl;
let mainRowsContainer;
let numpadContainer;
let recordBtn;
let stopBtn;
let clearBtn;
let saveTypedBtn;
let typedTextEl;
let nowPlayingEl;
let savedGridEl;

let typedText = "";
let nowPlayingChars = [];
let savedRecordings = [];

let tempo = 1;
let tempoSlider;
let tempoValueEl;

let currentScaleId = "major"; // default
let rootFreq = 220; // keep your current baseline
let scaleSelect; // DOM ref for the <select>
const SCALE_PREF_KEY = "keysonic-scale-pref-v1";

// ----- Public Init -----

export function initKeysonic() {
  const dom = getDomRefs();
  ({
    titleEl,
    mainRowsContainer,
    numpadContainer,
    typedTextEl,
    nowPlayingEl,
    savedGridEl,
    recordBtn,
    stopBtn,
    clearBtn,
    saveTypedBtn,
  } = dom);

  document.title = "Keysonic";
  setupTitlePill();

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextCtor();

  tempoSlider = document.getElementById("tempo-slider");
  tempoValueEl = document.getElementById("tempo-value");

  if (tempoSlider) {
    tempo = parseFloat(tempoSlider.value) || 1;
    if (tempoValueEl) {
      tempoValueEl.textContent = tempo.toFixed(1) + "x";
    }

    tempoSlider.addEventListener("input", () => {
      const val = parseFloat(tempoSlider.value);
      tempo = !isNaN(val) && val > 0 ? val : 1;
      if (tempoValueEl) {
        tempoValueEl.textContent = tempo.toFixed(1) + "x";
      }
    });
  }

  computeKeyOrder();

  const { keyElements: builtKeys, keyboardEls: builtBoards } = buildKeyboards({
    layoutMain,
    layoutNumpadGrid,
    mainRowsContainer,
    numpadContainer,
    getHueForCode,
    onKeyPress: (code) => {
      handleFirstInteraction();
      triggerKey(code);
    },
  });

  keyElements = builtKeys;
  keyboardEls = builtBoards;

  applyBaseKeyColors();
  wireAudioUnlock();
  wireKeyboardEvents();
  wireControlEvents();

  // --- Scale selector setup ---
  scaleSelect = document.getElementById("scale-select");
  if (scaleSelect) {
    // populate choices from SCALES
    scaleSelect.innerHTML = "";
    const entries = Object.values(SCALES);
    entries.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      scaleSelect.appendChild(opt);
    });

    // restore saved scale, else default to major
    const savedScale = localStorage.getItem(SCALE_PREF_KEY);
    if (savedScale && SCALES[savedScale]) {
      currentScaleId = savedScale;
    } else {
      currentScaleId = "major";
    }
    scaleSelect.value = currentScaleId;

    // react to user changes
    scaleSelect.addEventListener("change", () => {
      const next = scaleSelect.value;
      if (SCALES[next]) {
        currentScaleId = next;
        localStorage.setItem(SCALE_PREF_KEY, next);
        // optional: if a song is currently playing, you could restart it here under the new scale
        // if (isPlayingBack) { stopPlayback(); /* optionally re-play last sequence */ }
      }
    });
  }

  loadSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  resetTypedText();
  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
}

// ----- Wiring -----

function wireAudioUnlock() {
  window.addEventListener("click", handleFirstInteraction, { once: true });
  window.addEventListener("keydown", handleFirstInteraction, { once: true });
}

function wireKeyboardEvents() {
  window.addEventListener("keydown", handleKeydown);
}

function wireControlEvents() {
  if (recordBtn) {
    recordBtn.addEventListener("click", handleRecordClick);
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", handleStopClick);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearClick);
  }
  if (saveTypedBtn) {
    saveTypedBtn.addEventListener("click", handleSaveTypedClick);
  }
  if (savedGridEl) {
    savedGridEl.addEventListener("click", handleSavedGridClick);
  }
}

// ----- Event Handlers -----

function handleFirstInteraction() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function handleKeydown(e) {
  if (e.repeat) return;

  const mapped = normalizeEventToCode(e);
  if (!mapped || !keyOrder.includes(mapped)) return;

  if (
    mapped === "Tab" ||
    mapped === "Backspace" ||
    mapped === " " ||
    mapped.startsWith("Arrow") ||
    mapped.startsWith("Numpad")
  ) {
    e.preventDefault();
  }

  triggerKey(mapped);
}

function handleRecordClick() {
  stopPlayback();
  recordedSequence = [];
  resetTypedText();
  isRecording = true;
  isPlayingBack = false;
  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
}

function handleStopClick() {
  // If we're playing back, stop immediately.
  if (isPlayingBack) {
    stopPlayback();
    return;
  }

  // If not recording, nothing to do.
  if (!isRecording) return;

  isRecording = false;

  if (recordedSequence.length) {
    autoSaveCurrentRecording();
  }

  resetTypedText();
  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
}

function handleClearClick() {
  if (isPlayingBack) return;

  recordedSequence = [];
  resetTypedText();
  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
}

function handleSaveTypedClick() {
  const name = typedText || "";
  if (!name) return;

  const seq = [];
  for (const ch of name) {
    const code = mapCharToCodeFromTypedChar(ch);
    if (code) seq.push(code);
  }
  if (!seq.length) return;

  const entryName = makeUniqueName(name);
  const entry = {
    id: makeId(),
    name: entryName,
    sequence: seq,
  };

  savedRecordings.push(entry);
  persistSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  resetTypedText();
  updateControls();
}

function handleSavedGridClick(e) {
  const deleteBtn = e.target.closest(".saved-card-delete");
  if (deleteBtn) {
    const card = deleteBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    savedRecordings = savedRecordings.filter((r) => r.id !== id);
    persistSavedRecordings();
    renderSavedGrid(savedGridEl, savedRecordings);
    applyColorsToSavedTitles();

    if (savedRecordings.length === 0) {
      recordedSequence = [];
      updateControls();
    }

    e.stopPropagation();
    return;
  }

  const card = e.target.closest(".saved-card");
  if (!card) return;

  const id = card.dataset.id;
  const entry = savedRecordings.find((r) => r.id === id);
  if (!entry || !entry.sequence.length) return;

  stopPlayback();
  playSequence(entry.sequence, entry.name);
}

// ----- Playback Control -----

function stopPlayback() {
  if (playbackTimeoutId !== null) {
    clearTimeout(playbackTimeoutId);
    playbackTimeoutId = null;
  }

  isPlayingBack = false;
  playbackSequence = null;
  playbackIndex = 0;
  playbackLabel = "";

  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
}

// ----- Recording & Controls -----

function updateControls() {
  const hasNotes = recordedSequence.length > 0;
  const hasTyped = !!(typedText && typedText.length);

  if (recordBtn) {
    recordBtn.disabled = isRecording || isPlayingBack;
    recordBtn.classList.toggle("active-record", isRecording);
  }

  if (stopBtn) {
    stopBtn.disabled = !(isRecording || isPlayingBack);
  }

  if (clearBtn) {
    const canClear = (hasNotes || hasTyped) && !isRecording && !isPlayingBack;
    clearBtn.disabled = !canClear;
  }

  if (saveTypedBtn) {
    saveTypedBtn.disabled = !hasTyped || isRecording || isPlayingBack;
  }
}

function recordKeyStroke(code) {
  if (isRecording && !isPlayingBack) {
    recordedSequence.push(code);
    updateControls();
  }
}

// ----- Play Sequence -----
function playSequence(sequence, label) {
  if (!sequence || !sequence.length) return;

  // Clean start
  stopPlayback();
  resetTypedText();

  isPlayingBack = true;
  isRecording = false;

  playbackSequence = sequence.slice();
  playbackIndex = 0;
  playbackLabel = label != null ? String(label) : "";

  nowPlayingChars = setNowPlaying(nowPlayingEl, playbackLabel);
  if (playbackSequence.length) {
    updateNowPlayingColors(nowPlayingChars, playbackSequence);
  }

  updateControls();

  // kick off the first step
  queueNextPlaybackStep();
}

function queueNextPlaybackStep() {
  // If playback was stopped or sequence missing, clean up.
  if (
    !isPlayingBack ||
    !playbackSequence ||
    playbackIndex >= playbackSequence.length
  ) {
    stopPlayback();
    return;
  }

  const code = playbackSequence[playbackIndex];

  // Play this note using the *current* scale & engine.
  triggerKey(code, { fromPlayback: true });

  // Update Now Playing highlight (if we have a label)
  if (playbackLabel && nowPlayingChars && nowPlayingChars.length) {
    const hi = playbackIndex % playbackLabel.length;
    updateNowPlayingColors(nowPlayingChars, playbackSequence);
    highlightNowPlayingIndex(nowPlayingChars, hi);
  }

  playbackIndex += 1;

  // If that was the last note, schedule a short tail then stop.
  if (playbackIndex >= playbackSequence.length) {
    const tail = 200 / (tempo || 1);
    playbackTimeoutId = setTimeout(() => {
      stopPlayback();
    }, tail);
    return;
  }

  // Compute delay for the *next* step using the CURRENT tempo.
  const baseStep = 220; // your existing feel
  const step = baseStep / (tempo || 1); // changing slider mid-play affects from next note on

  playbackTimeoutId = setTimeout(queueNextPlaybackStep, step);
}

// ----- Auto-save Recordings -----

function autoSaveCurrentRecording() {
  const seq = [...recordedSequence];
  if (!seq.length) return;

  const rawName = typedText || "";
  const hasNonSpace = rawName.split("").some((ch) => ch !== " ");

  const baseName = hasNonSpace
    ? rawName
    : `Recording ${savedRecordings.length + 1}`;

  const name = makeUniqueName(baseName);

  const entry = {
    id: makeId(),
    name,
    sequence: seq,
  };

  savedRecordings.push(entry);
  persistSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  recordedSequence = [];
}

// ----- Storage -----

function loadSavedRecordings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savedRecordings = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      savedRecordings = parsed.filter(
        (r) => r && Array.isArray(r.sequence) && r.sequence.length
      );
    } else {
      savedRecordings = [];
    }
  } catch {
    savedRecordings = [];
  }
}

function persistSavedRecordings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRecordings));
  } catch {
    // ignore
  }
}

// ----- Title Coloring -----

function setupTitlePill() {
  const titleTextEl = document.querySelector(".keysonic-title-text");
  const subtitleEl = document.getElementById("word-music-subtitle");
  if (!titleTextEl) return;

  titleTextEl.textContent = "Keysonic";
  if (subtitleEl) {
    subtitleEl.textContent = "Every sentence is a song.";
  }

  const raw = "Keysonic";
  titleTextEl.innerHTML = "";
  for (const ch of raw) {
    const span = document.createElement("span");
    span.textContent = ch;
    if (ch.trim() !== "") {
      const hue = getHueForCode(ch.toUpperCase());
      if (!isNaN(hue)) {
        span.style.color = `hsl(${hue}, 60%, 55%)`;
      }
    }
    titleTextEl.appendChild(span);
  }
}

// ----- Saved Cards Coloring -----

function applyColorsToSavedTitles() {
  if (!savedGridEl || !Array.isArray(savedRecordings)) return;

  const cards = savedGridEl.querySelectorAll(".saved-card");
  cards.forEach((card) => {
    const id = card.dataset.id;
    const entry = savedRecordings.find((r) => r.id === id);
    if (!entry) return;

    const titleEl = card.querySelector(".saved-card-title");
    if (!titleEl) return;

    const name = entry.name || "";
    const seq = Array.isArray(entry.sequence) ? entry.sequence : [];

    titleEl.innerHTML = "";
    if (!name) return;

    const chars = [...name];
    const seqLen = seq.length;

    chars.forEach((ch, index) => {
      const span = document.createElement("span");
      span.textContent = ch;

      let hue = NaN;
      if (seqLen > 0) {
        const code = seq[index % seqLen];
        hue = getHueForCode(code);
      } else {
        hue = getHueForCode(ch.toUpperCase());
      }

      if (!isNaN(hue) && ch.trim() !== "") {
        span.style.color = `hsl(${hue}, 90%, 55%)`;
      }

      titleEl.appendChild(span);
    });
  });
}

// ----- Typed Display -----

function resetTypedText() {
  typedText = "";
  syncTypedDisplay();
  updateControls();
}

function updateTypedTextForUserKey(code) {
  const ch = mapCodeToCharForTyping(code);
  if (ch !== null && ch !== undefined) {
    typedText += ch;
  }

  if (typedText.length > TYPED_MAX_LENGTH) {
    typedText = typedText.slice(0, TYPED_MAX_LENGTH);
  }

  syncTypedDisplay();
  updateControls();
}

function syncTypedDisplay() {
  if (!typedTextEl) return;

  typedTextEl.innerHTML = "";
  if (!typedText) return;

  for (const ch of typedText) {
    const span = document.createElement("span");
    span.textContent = ch;
    if (ch.trim() !== "") {
      const hue = getHueForCode(ch.toUpperCase());
      if (!isNaN(hue)) {
        span.style.color = `hsl(${hue}, 90%, 55%)`;
      }
    }
    typedTextEl.appendChild(span);
  }
}

// ----- Now Playing Coloring -----

function updateNowPlayingColors(chars, sequence) {
  if (!chars || !chars.length) return;
  const seqLen = sequence.length;
  if (!seqLen) return;

  chars.forEach((span, idx) => {
    const code = sequence[idx % seqLen];
    const hue = getHueForCode(code);
    if (!isNaN(hue)) {
      span.style.color = `hsl(${hue}, 90%, 55%)`;
    }
    span.style.transform = "";
    span.style.fontWeight = "600";
  });
}

function highlightNowPlayingIndex(chars, activeIndex) {
  if (!chars || !chars.length) return;

  chars.forEach((span, idx) => {
    if (idx === activeIndex) {
      span.style.transform = "translateY(-1px) scale(1.25)";
      span.style.fontWeight = "800";
    } else {
      span.style.transform = "";
      span.style.fontWeight = "600";
    }
  });
}

// ----- Mapping Helpers -----

function mapCodeToCharForTyping(code) {
  const actionAsSpace = new Set([
    "Backspace",
    "Tab",
    "CapsLock",
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "NumLock",
    "ScrollLock",
    "Pause",
    "Insert",
    "Delete",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Enter",
    "ContextMenu",
    "Fn",
  ]);

  if (code === " ") return " ";
  if (actionAsSpace.has(code)) return " ";
  if (code.startsWith("Arrow")) return " ";

  if (code.startsWith("Numpad")) {
    const suffix = code.slice("Numpad".length);
    if (/^[0-9]$/.test(suffix)) return suffix;
    if (suffix === "Decimal") return ".";
    return " ";
  }

  if (code.length === 1 && code >= " " && code <= "~") {
    return code;
  }

  return null;
}

function mapCharToCodeFromTypedChar(ch) {
  if (ch === " ") return " ";
  if (/^[A-Z]$/.test(ch)) return ch;
  if (/^[0-9]$/.test(ch)) return ch;
  if (/^[`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?]$/.test(ch)) {
    return ch;
  }
  return null;
}

function normalizeEventToCode(e) {
  const key = e.key;
  const code = e.code || "";

  if (key === " ") return " ";
  if (
    [
      "Backspace",
      "Tab",
      "CapsLock",
      "Shift",
      "Control",
      "Alt",
      "NumLock",
    ].includes(key)
  ) {
    return key;
  }
  if (key === "Enter") {
    if (code === "NumpadEnter") return "NumpadEnter";
    return "Enter";
  }
  if (key && key.startsWith("Arrow")) return key;
  if (code.startsWith("Numpad")) return code;
  if (key && key.length === 1) {
    return /[a-z]/.test(key) ? key.toUpperCase() : key;
  }
  return null;
}

// ----- Key Order / Color / Tone -----

function computeKeyOrder() {
  const codes = [];
  layoutMain.forEach((row) => {
    row.forEach((k) => {
      if (!codes.includes(k.code)) codes.push(k.code);
    });
  });
  layoutNumpadGrid.forEach((k) => {
    if (!codes.includes(k.code)) codes.push(k.code);
  });
  keyOrder = codes;
}

function getHueForCode(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DISTINCT_HUES.length;
  return DISTINCT_HUES[idx];
}

function getBaseKeyColor(hue) {
  return isNaN(hue) ? "var(--key)" : `hsl(${hue}, 40%, 92%)`;
}

function getBaseKeyBorder(hue) {
  return isNaN(hue) ? "var(--key-border)" : `hsl(${hue}, 35%, 78%)`;
}

function getActiveKeyColor(hue) {
  return isNaN(hue) ? "var(--key)" : `hsl(${hue}, 90%, 55%)`;
}

function getFrequencyForCode(code) {
  // Find stable position of this key in the keyboard map
  let idx = keyOrder.indexOf(code);

  if (idx === -1) {
    // Fallback for codes not directly in keyOrder: hash into range
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash << 5) - hash + code.charCodeAt(i);
      hash |= 0;
    }
    const len = keyOrder.length || 1;
    idx = Math.abs(hash) % len;
  }

  // Delegate to the scale engine
  return getFrequencyForIndex(idx, currentScaleId, rootFreq);
}

// ----- Keyboard Visuals -----

function applyBaseKeyColors() {
  if (!keyElements) return;
  Object.values(keyElements).forEach((els) => {
    els.forEach((el) => {
      const hue = parseFloat(el.dataset.hue);
      el.style.backgroundColor = getBaseKeyColor(hue);
      el.style.borderColor = getBaseKeyBorder(hue);
    });
  });
}

function setKeyboardShadowHue(hue) {
  if (!keyboardEls.length || isNaN(hue)) return;
  const shadow = `0 8px 32px hsla(${hue}, 90%, 55%, 0.75)`;
  keyboardEls.forEach((el) => {
    el.style.boxShadow = shadow;
  });
}

function resetKeyboardShadow() {
  if (!keyboardEls.length) return;
  keyboardEls.forEach((el) => {
    el.style.boxShadow = "0 2px 10px rgba(15, 23, 42, 0.12)";
  });
}

// ----- Audio + Flash -----

function playTone(code) {
  const freq = getFrequencyForCode(code);
  if (!freq || !audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

function flashKey(code) {
  const els = keyElements[code];
  if (!els || !els.length) return;

  const hue = parseFloat(els[0].dataset.hue);
  const activeBg = getActiveKeyColor(hue);

  if (!isNaN(hue)) {
    setKeyboardShadowHue(hue);
  }

  els.forEach((el) => {
    el.classList.add("active");
    el.style.backgroundColor = activeBg;
  });

  setTimeout(() => {
    els.forEach((el) => {
      el.classList.remove("active");
      const h = parseFloat(el.dataset.hue);
      el.style.backgroundColor = getBaseKeyColor(h);
      el.style.borderColor = getBaseKeyBorder(h);
    });
    resetKeyboardShadow();
  }, 140);
}

function triggerKey(code, { fromPlayback = false } = {}) {
  // Allow recorded codes and the explicit space character
  if (!keyOrder.includes(code) && code !== " ") {
    return;
  }

  if (!fromPlayback) {
    // Live typing / recording:
    // - store the real code in recordedSequence
    // - update Spell a Song text (which maps action keys -> spaces)
    recordKeyStroke(code);
    updateTypedTextForUserKey(code);
  }

  // Playback:
  // Use the actual code from the saved sequence:
  // - action keys light up their own key
  // - space (" ") lights the spacebar
  // - everything gets its tone as usual
  playTone(code);
  flashKey(code);
}

// ----- Utils -----

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeUniqueName(base) {
  let name = base || "Recording";
  let i = 2;
  const existing = new Set(savedRecordings.map((r) => r.name));
  while (existing.has(name)) {
    name = `${base} (${i++})`;
  }
  return name;
}
