// keysonic-engine.js
import {
  layoutMain,
  layoutNumpadGrid,
  DISTINCT_HUES,
} from "./keysonic-config.js";

import {
  getDomRefs,
  KeyboardView,
  NowPlayingView,
  SavedGridView,
  TypedTextView,
} from "./keysonic-layout.js";

import { getFrequencyForIndex, SCALES } from "./keysonic-scales.js";

import {
  composeFromText,
  flattenEventsToStepCodes,
} from "./keysonic-composer.js";

import store from "./store/keysonic-store.js";
import playbackService from "./services/playback-service.js";
import audioService from "./services/audio-service.js";
import recordingService from "./services/recording-service.js";
import { RecordingRepository } from "./services/recording-repository.js";
import { getThemeOptions, initTheme, applyTheme } from "./keysonic-theme.js";

const recordingRepo = new RecordingRepository();

let keyOrder = [];
let keyElements = {};
let keyboardEls = [];

let mainRowsContainer;
let numpadContainer;
let recordBtn;
let stopBtn;
let clearBtn;
let saveTypedBtn;
let typedTextEl;
let nowPlayingEl;
let savedGridEl;
let typedBackspaceBtn;

let nowPlayingChars = [];
let tempoSlider;
let tempoValueEl;

let numpadRobotEl = null;
let numpadRobotEyes = [];
let numpadRobotHideTimer = null;

let numpadRobotFloatRAF = null;
let numpadRobotPos = { x: 0, y: 0 };
let numpadRobotVel = { x: 0, y: 0 };
let numpadRobotSize = { w: 110, h: 110 };

let currentScaleId = "major"; // default
let rootFreq = 220; // keep your current baseline
let scaleSelect; // DOM ref for the <select>
const SCALE_PREF_KEY = "keysonic-scale-pref-v1";
const INSTRUMENT_PREF_KEY = "keysonic-instrument-pref-v1";
const SONG_STEP_NOTE_VALUE = "eighth"; // all events = 1/8 note by definition
let themeSelect;
let instrumentSelect;

const DEFAULT_KEY_COLOR_SETTINGS = {
  saturation: 55,
  lightness: 88,
  borderSaturation: 55,
  borderLightness: 70,
  activeSaturation: 80,
  activeLightness: 48,
  toneSaturation: 90,
  toneLightness: 55,
};

let keyColorSettings = { ...DEFAULT_KEY_COLOR_SETTINGS };

let keyboardView;
let nowPlayingView;
let savedGridView;
let typedTextView;

const getState = () => store.getState();

function applyInstrument(id) {
  const sanitized = id || "piano";
  if (audioService?.setInstrument) {
    audioService.setInstrument(sanitized === "legacy" ? "sine" : sanitized);
  }
  try {
    localStorage.setItem(INSTRUMENT_PREF_KEY, sanitized);
  } catch (err) {
    // ignore storage issues
  }
}

function parseCssNumber(value, fallback) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function refreshKeyColorSettings() {
  const root = document.documentElement;
  if (!root) return;

  const styles = getComputedStyle(root);
  keyColorSettings = {
    saturation: parseCssNumber(
      styles.getPropertyValue("--key-saturation"),
      DEFAULT_KEY_COLOR_SETTINGS.saturation
    ),
    lightness: parseCssNumber(
      styles.getPropertyValue("--key-lightness"),
      DEFAULT_KEY_COLOR_SETTINGS.lightness
    ),
    borderSaturation: parseCssNumber(
      styles.getPropertyValue("--key-border-saturation"),
      DEFAULT_KEY_COLOR_SETTINGS.borderSaturation
    ),
    borderLightness: parseCssNumber(
      styles.getPropertyValue("--key-border-lightness"),
      DEFAULT_KEY_COLOR_SETTINGS.borderLightness
    ),
    activeSaturation: parseCssNumber(
      styles.getPropertyValue("--key-active-saturation"),
      DEFAULT_KEY_COLOR_SETTINGS.activeSaturation
    ),
    activeLightness: parseCssNumber(
      styles.getPropertyValue("--key-active-lightness"),
      DEFAULT_KEY_COLOR_SETTINGS.activeLightness
    ),
    toneSaturation: parseCssNumber(
      styles.getPropertyValue("--tone-saturation"),
      DEFAULT_KEY_COLOR_SETTINGS.toneSaturation
    ),
    toneLightness: parseCssNumber(
      styles.getPropertyValue("--tone-lightness"),
      DEFAULT_KEY_COLOR_SETTINGS.toneLightness
    ),
  };
}

function getSavedRecordings() {
  return getState().savedRecordings;
}

function setSavedRecordings(next) {
  store.mutate((state) => {
    state.savedRecordings = next;
  });
  recordingRepo.save(next);
  savedGridView.render(next);
  applyColorsToSavedTitles();
  savedGridView.highlight(getState().playback.id);
}

function updateRecording(id, mutator) {
  const next = getSavedRecordings().map((rec) => {
    if (rec.id !== id) return rec;
    const draft = {
      ...rec,
      sequence: Array.isArray(rec.sequence) ? rec.sequence.slice() : [],
      playSequence: Array.isArray(rec.playSequence)
        ? rec.playSequence.slice()
        : [],
    };
    const updated = mutator(draft) || draft;
    return updated;
  });
  setSavedRecordings(next);
}

function updateTempo(value) {
  const next = !isNaN(value) && value > 0 ? value : 1;
  store.mutate((state) => {
    state.tempo = next;
  });
  if (tempoValueEl) {
    tempoValueEl.textContent = next.toFixed(1) + "x";
  }
}

// ----- Public Init -----

export function initKeysonic() {
  const dom = getDomRefs();
  ({
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

  const activeThemeId = initTheme();
  refreshKeyColorSettings();

  themeSelect = document.getElementById("theme-select");
  instrumentSelect = document.getElementById("instrument-select");
  if (themeSelect) {
    const options = getThemeOptions();
    themeSelect.innerHTML = "";
    options.forEach(({ id, label }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      themeSelect.appendChild(opt);
    });

    if (options.some((opt) => opt.id === activeThemeId)) {
      themeSelect.value = activeThemeId;
    } else if (options.length) {
      themeSelect.value = options[0].id;
    }

    themeSelect.addEventListener("change", () => {
      const appliedId = applyTheme(themeSelect.value);
      refreshKeyColorSettings();
      applyBaseKeyColors();
      themeSelect.value = appliedId;
    });
  }

  if (instrumentSelect) {
    const instruments = [
      { id: "piano", label: "Piano" },
      { id: "trumpet", label: "Trumpet" },
      { id: "bass", label: "Bass" },
      { id: "guitar", label: "Electric Guitar" },
      { id: "drums", label: "Drums" },
      { id: "legacy", label: "Classic Synth" },
    ];
    instrumentSelect.innerHTML = "";
    instruments.forEach(({ id, label }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      instrumentSelect.appendChild(opt);
    });
    const savedInstrument = localStorage.getItem(INSTRUMENT_PREF_KEY) || "piano";
    instrumentSelect.value = savedInstrument;
    applyInstrument(savedInstrument);

    instrumentSelect.addEventListener("change", () => {
      applyInstrument(instrumentSelect.value);
    });
  }

  tempoSlider = document.getElementById("tempo-slider");
  tempoValueEl = document.getElementById("tempo-value");
  typedBackspaceBtn = document.getElementById("typed-backspace-btn");

  if (tempoSlider) {
    const initial = parseFloat(tempoSlider.value) || 1;
    updateTempo(initial);
    tempoSlider.addEventListener("input", () => {
      const val = parseFloat(tempoSlider.value);
      updateTempo(val);
    });
  }

  if (typedBackspaceBtn) {
    typedBackspaceBtn.addEventListener("click", handleTypedBackspaceClick);
  }

  computeKeyOrder();

  keyboardView = new KeyboardView({
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

  const { keyElements: builtKeys, keyboardEls: builtBoards } = keyboardView.mount();
  keyElements = builtKeys;
  keyboardEls = builtBoards;

  nowPlayingView = new NowPlayingView(nowPlayingEl);
  savedGridView = new SavedGridView(savedGridEl);
  typedTextView = new TypedTextView(typedTextEl);

  applyBaseKeyColors();
  wireAudioUnlock();
  wireKeyboardEvents();
  wireControlEvents();
  wirePlaybackEvents();

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
      if (!SCALES[next]) return;

      currentScaleId = next;
      localStorage.setItem(SCALE_PREF_KEY, next);

      // 1) Recompute hues for every physical key so that
      //    keys that play the same note stay visually grouped
      if (keyElements) {
        Object.entries(keyElements).forEach(([code, els]) => {
          const hue = getHueForCode(code);
          if (isNaN(hue)) return;

          els.forEach((el) => {
            el.dataset.hue = String(hue);
          });
        });

        // Re-apply base colors with the new hues
        applyBaseKeyColors();
      }

      // 2) Refresh colors on saved song titles (they use getHueForCode too)
      applyColorsToSavedTitles();

      // 3) Refresh colors on the "Spell a Song" typed text
      syncTypedDisplay();

      const playbackSeq = getState().playback.sequence;
      if (playbackSeq.length) {
        nowPlayingView.tint(playbackSeq, getHueForCode, getToneColor);
      }

      // optional: if a song is currently playing, you could restart it here under the new scale
      // if (isPlayingBack) { stopPlayback(); /* optionally re-play last sequence */ }
    });
  }

  loadSavedRecordings();
  savedGridView.render(store.getState().savedRecordings);
  applyColorsToSavedTitles();

  resetTypedText();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

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

function wirePlaybackEvents() {
  playbackService.on("start", handlePlaybackStarted);
  playbackService.on("stop", handlePlaybackStopped);
  playbackService.on("step", handlePlaybackStep);
}

function handlePlaybackStarted(snapshot) {
  const label = snapshot?.label || "";
  nowPlayingChars = nowPlayingView.setLabel(label);
  if (snapshot?.sequence?.length) {
    nowPlayingView.tint(snapshot.sequence, getHueForCode, getToneColor);
  }
  applyPlaybackCardHighlight();
  updateControls();
}

function handlePlaybackStopped() {
  nowPlayingChars = nowPlayingView.setLabel("");
  applyPlaybackCardHighlight();
  updateControls();
}

function handlePlaybackStep({ code, index, sequence }) {
  triggerKey(code, { fromPlayback: true });
  highlightPlaybackProgress(index, sequence);
}

function highlightPlaybackProgress(currentIndex, sequence) {
  if (!sequence?.length || !nowPlayingChars.length) return;
  const charCount = nowPlayingChars.length;
  let hi = 0;
  if (sequence.length === charCount) {
    hi = currentIndex;
  } else {
    const denom = Math.max(sequence.length - 1, 1);
    hi = Math.round((currentIndex / denom) * (charCount - 1));
  }
  hi = Math.min(Math.max(hi, 0), charCount - 1);
  nowPlayingView.highlight(hi);
}

function handleFirstInteraction() {
  audioService?.ensureUnlocked();
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
  recordingService.start();
  resetTypedText();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

function handleStopClick() {
  // If we're playing back, stop immediately.
  if (getState().isPlayingBack) {
    stopPlayback();
    return;
  }

  if (!getState().isRecording) return;

  recordingService.stop();

  if (getState().recordedSequence.length) {
    autoSaveCurrentRecording();
  }

  resetTypedText();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

function handleClearClick() {
  if (getState().isPlayingBack) return;

  recordingService.clear();
  syncTypedDisplay();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

function handleSaveTypedClick() {
  const state = getState();
  const playSeq = state.typedCodeSequence.slice();
  if (!playSeq.length) return;

  const displaySeq = recordingRepo.toDisplaySequence(playSeq);

  const rawName = state.typedText || "";
  const hasNonSpace = rawName.split("").some((ch) => ch !== " ");

  const recordings = getSavedRecordings();
  const baseName = hasNonSpace ? rawName : `Recording ${recordings.length + 1}`;
  const name = recordingRepo.makeUniqueName(baseName, recordings);

  const entry = recordingRepo.createRecording({
    name,
    playSequence: playSeq,
    displaySequence: displaySeq,
  });

  setSavedRecordings([...recordings, entry]);

  resetTypedText();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

function handleSavedGridClick(e) {
  const loopBtn = e.target.closest(".saved-card-loop-toggle");
  if (loopBtn) {
    const card = loopBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    updateRecording(id, (entry) => ({ ...entry, loop: !entry.loop }));
    applyPlaybackCardHighlight();

    e.stopPropagation();
    return;
  }

  const deleteBtn = e.target.closest(".saved-card-delete");
  if (deleteBtn) {
    const card = deleteBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    if (getState().playback.id === id) {
      stopPlayback();
    }

    const next = getSavedRecordings().filter((r) => r.id !== id);
    setSavedRecordings(next);

    if (!next.length) {
      recordingService.clearRecordedSequence();
      updateControls();
    }

    e.stopPropagation();
    return;
  }

  const reverseBtn = e.target.closest(".saved-card-reverse-toggle");
  if (reverseBtn) {
    const card = reverseBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;
    const recordings = getSavedRecordings();
    const entry = recordings.find((r) => r.id === id);
    if (!entry) return;

    updateRecording(id, (rec) => ({ ...rec, reverse: !rec.reverse }));
    applyPlaybackCardHighlight();

    if (getState().isPlayingBack && getState().playback.id === id) {
      restartPlaybackFromEntry({ ...entry, reverse: !entry.reverse }, { preserveTyped: true });
    }

    e.stopPropagation();
    return;
  }

  const composeBtn = e.target.closest(".saved-card-compose-toggle");
  if (composeBtn) {
    const card = composeBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;
    const recordings = getSavedRecordings();
    const entry = recordings.find((r) => r.id === id);
    if (!entry) return;

    const nextCompose = !entry.compose;
    updateRecording(id, (rec) => ({ ...rec, compose: nextCompose }));
    applyPlaybackCardHighlight();

    if (getState().isPlayingBack && getState().playback.id === id) {
      restartPlaybackFromEntry({ ...entry, compose: nextCompose });
    }

    e.stopPropagation();
    return;
  }

  const card = e.target.closest(".saved-card");
  if (!card) return;

  const id = card.dataset.id;
  const entry = getSavedRecordings().find((r) => r.id === id);
  if (!entry || !entry.sequence.length) return;

  // If this card is currently playing, treat click as a STOP toggle
  if (getState().isPlayingBack && getState().playback.id === id) {
    stopPlayback();
    return;
  }

  startPlaybackFromEntry(entry);
}

function handleTypedBackspaceClick() {
  const state = getState();
  if (state.isRecording || state.isPlayingBack) return;
  if (!state.typedText || state.typedText.length === 0) return;

  store.mutate((draft) => {
    draft.typedText = draft.typedText.slice(0, -1);
    draft.typedCodeSequence = draft.typedCodeSequence.slice(0, -1);
  });

  syncTypedDisplay();
  updateControls();
}

function buildPlaybackSequence(entry) {
  let seq = entry.playSequence.slice();
  if (entry.compose && seq.length) {
    const song = composeFromText(seq, {
      meter: "4/4",
      restBetweenWords: 3,
      wordContour: "arch",
      maxSpan: 4,
    });
    seq = flattenEventsToStepCodes(song);
  }
  return seq;
}

function startPlaybackFromEntry(entry, { preserveTyped = false } = {}) {
  const seq = buildPlaybackSequence(entry);
  if (!seq.length) return;
  if (!preserveTyped) {
    resetTypedText();
  }
  playbackService.play({
    sequence: seq,
    label: entry.name,
    id: entry.id,
    reversed: !!entry.reverse,
  });
}

function restartPlaybackFromEntry(entry, opts = {}) {
  startPlaybackFromEntry(entry, opts);
}

function stopPlayback() {
  playbackService.stop();
}

function updateControls() {
  const state = getState();
  const hasNotes = state.recordedSequence.length > 0;
  const hasTyped = !!state.typedText;

  if (recordBtn) {
    recordBtn.disabled = state.isRecording || state.isPlayingBack;
    recordBtn.classList.toggle("active-record", state.isRecording);
  }

  if (stopBtn) {
    stopBtn.disabled = !(state.isRecording || state.isPlayingBack);
  }

  if (clearBtn) {
    const canClear = (hasNotes || hasTyped) && !state.isRecording && !state.isPlayingBack;
    clearBtn.disabled = !canClear;
  }

  if (saveTypedBtn) {
    saveTypedBtn.disabled = !hasTyped || state.isRecording || state.isPlayingBack;
  }

  if (typedBackspaceBtn) {
    const canBackspace = hasTyped && !state.isRecording && !state.isPlayingBack;
    typedBackspaceBtn.disabled = !canBackspace;
  }
}

// playbackService now owns scheduling logic.

function autoSaveCurrentRecording() {
  const playSeq = getState().recordedSequence.slice();
  if (!playSeq.length) return;

  const displaySeq = recordingRepo.toDisplaySequence(playSeq);
  const rawName = getState().typedText || "";
  const hasNonSpace = rawName.split("").some((ch) => ch !== " ");
  const recordings = getSavedRecordings();
  const baseName = hasNonSpace ? rawName : `Recording ${recordings.length + 1}`;
  const name = recordingRepo.makeUniqueName(baseName, recordings);
  const entry = recordingRepo.createRecording({
    name,
    playSequence: playSeq,
    displaySequence: displaySeq,
  });

  setSavedRecordings([...recordings, entry]);
  recordingService.clearRecordedSequence();
}

function loadSavedRecordings() {
  const recordings = recordingRepo.load();
  setSavedRecordings(recordings);
}

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

function applyColorsToSavedTitles() {
  savedGridView?.applyTitleColors(getSavedRecordings(), getHueForCode, getToneColor);
}

function resetTypedText() {
  recordingService.resetTyped();
  typedTextView?.clear();
  updateControls();
}

function updateTypedTextForUserKey(code) {
  recordingService.appendTyped(code);
  syncTypedDisplay();
  updateControls();
}

function syncTypedDisplay() {
  if (!typedTextView) return;
  const state = getState();
  typedTextView.render(
    state.typedText,
    state.typedCodeSequence,
    getHueForCode,
    getToneColor
  );
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
  if (code.startsWith("Numpad")) return code;
  if (key && key.startsWith("Arrow")) return key;
  if (key && key.length === 1) {
    return /[a-z]/.test(key) ? key.toUpperCase() : key;
  }
  return null;
}

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
  // If we have a musical mapping for this key, use it so that
  // all keys that land on the same note share the same hue.
  if (
    Array.isArray(keyOrder) &&
    keyOrder.length &&
    SCALES &&
    SCALES[currentScaleId]
  ) {
    let idx = keyOrder.indexOf(code);

    if (idx !== -1) {
      const scale = SCALES[currentScaleId] || SCALES.major;
      const degreesPerOctave =
        scale.steps && scale.steps.length ? scale.steps.length : 1;
      const maxOctaves = scale.octaves || 3;
      const windowSize = degreesPerOctave * maxOctaves || 1;

      // This is the same wrapping concept used in getFrequencyForIndex:
      // different keys that land on the same wrapped index → same note.
      const slot = windowSize > 0 ? idx % windowSize : idx;

      const hueIdx = Math.abs(slot) % DISTINCT_HUES.length;
      return DISTINCT_HUES[hueIdx];
    }
  }

  // Fallback: original hash-based mapping (covers things like title letters
  // and any codes not in keyOrder, and still works before keyOrder is computed)
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DISTINCT_HUES.length;
  return DISTINCT_HUES[idx];
}

function getBaseKeyColor(hue) {
  const { saturation, lightness } = keyColorSettings;
  // lighter pastel but more saturated → better separation between hues
  return isNaN(hue)
    ? "var(--key)"
    : `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getBaseKeyBorder(hue) {
  const { borderSaturation, borderLightness } = keyColorSettings;
  // darker border for contrast against the base fill
  return isNaN(hue)
    ? "var(--key-border)"
    : `hsl(${hue}, ${borderSaturation}%, ${borderLightness}%)`;
}

function getToneColor(hue) {
  const { toneSaturation, toneLightness } = keyColorSettings;
  return isNaN(hue)
    ? `hsl(0, ${toneSaturation}%, ${toneLightness}%)`
    : `hsl(${hue}, ${toneSaturation}%, ${toneLightness}%)`;
}

function getActiveKeyColor(hue) {
  const { activeSaturation, activeLightness } = keyColorSettings;
  // vivid active color so pressed keys really pop
  return isNaN(hue)
    ? "var(--key)"
    : `hsl(${hue}, ${activeSaturation}%, ${activeLightness}%)`;
}

function getFrequencyForCode(code, degreeOffset = 0) {
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

  // Apply bass-walk style offset (from composer)
  idx += degreeOffset;
  if (idx < 0) idx = 0;

  // Delegate to the scale engine
  return getFrequencyForIndex(idx, currentScaleId, rootFreq);
}

function applyBaseKeyColors() {
  refreshKeyColorSettings();
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

function playTone(code, opts = {}) {
  const { degreeOffset = 0 } = opts;
  const freq = getFrequencyForCode(code, degreeOffset);
  if (!freq || !audioService) return;
  audioService.playFrequency(freq);
}

function flashKey(code, { isEcho = false } = {}) {
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

  // Use the existing particle system, but let it know if this is an echo hit
  spawnNoteParticleForKey(code, { isEcho });

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

function triggerKey(rawCode, { fromPlayback = false } = {}) {
  // REST tokens from the composer: advance time but do nothing visually
  if (rawCode === "__REST__") {
    return;
  }

  let code = rawCode;
  let isEcho = false;
  let degreeOffset = 0;

  // Parse composer-encoded tokens, e.g. "ECHO:B-2:KeyA"
  if (typeof rawCode === "string" && rawCode.includes(":")) {
    const parts = rawCode.split(":");
    const base = parts[parts.length - 1];
    const tags = parts.slice(0, parts.length - 1);

    code = base;

    for (const tag of tags) {
      if (tag === "ECHO") {
        isEcho = true;
      } else if (tag.startsWith("B")) {
        const n = parseInt(tag.slice(1), 10);
        if (Number.isFinite(n)) degreeOffset = n;
      }
    }
  }

  // Allow recorded codes and the explicit space character
  if (!keyOrder.includes(code) && code !== " ") {
    return;
  }

  if (!fromPlayback) {
    // Live typing / recording:
    // - store the real code in recordedSequence
    // - update Spell a Song text (which maps action keys -> spaces)
    recordingService.recordKey(code);
    updateTypedTextForUserKey(code);
  }

  // Playback:
  // - action keys light up their own key
  // - space (" ") lights the spacebar
  // - echo hits can walk the bass (degreeOffset) and get special visuals
  playTone(code, { degreeOffset });
  flashKey(code, { isEcho });
}

function applyPlaybackCardHighlight() {
  savedGridView?.highlight(getState().playback.id);
}

// musical symbols******************************************
function spawnNoteParticleForKey(code, opts = {}) {
  const { isEcho = false } = opts;

  let els = keyElements[code];

  // Handle the explicit space token as the spacebar key visually.
  if ((!els || !els.length) && (code === " " || code === "Space")) {
    els = keyElements["Space"];
  }

  if (!els || !els.length) return;

  const glyph = getNoteGlyphForCode(code);
  if (!glyph) return;

  els.forEach((keyEl) => {
    let rect = keyEl.getBoundingClientRect();

    // Note color based on key's hue
    const hue = parseFloat(keyEl.dataset.hue);
    const sat = isEcho ? 96 : 92;
    const light = isEcho ? 60 : 64;
    const color = !isNaN(hue) ? `hsl(${hue}, ${sat}%, ${light}%)` : null;

    const isRectHidden = !rect || (rect.width === 0 && rect.height === 0);
    const isNumpadKey = typeof code === "string" && code.startsWith("Numpad");

    if (isRectHidden && isNumpadKey) {
      // 🔄 Route hidden numpad notes through the robot
      flashNumpadRobotEyes(color);

      const robot = ensureNumpadRobot();
      const eye =
        numpadRobotEyes && numpadRobotEyes[0] ? numpadRobotEyes[0] : robot;
      const eRect = eye.getBoundingClientRect();

      rect = {
        left: eRect.left,
        top: eRect.top,
        width: eRect.width,
        height: eRect.height,
      };
    } else if (isRectHidden) {
      // Non-numpad hidden keys: fall back to a generic keyboard anchor
      let anchor =
        document.querySelector(".numpad-toggle") ||
        document.getElementById("keyboard-main") ||
        document.querySelector(".keyboard-wrapper") ||
        document.body;

      const aRect = anchor.getBoundingClientRect();
      rect = {
        left: aRect.right - 32,
        top: aRect.top,
        width: 32,
        height: 32,
      };
    }

    const noteEl = document.createElement("div");
    noteEl.className = isEcho ? "note-float note-float-echo" : "note-float";
    noteEl.textContent = glyph;

    if (color) {
      noteEl.style.color = color;
    }

    const dx = (Math.random() * 26 - 13).toFixed(1) + "px";
    noteEl.style.setProperty("--dx", dx);

    // Position at top-center of the real key or the robot eye
    noteEl.style.left = `${rect.left + rect.width / 2}px`;
    noteEl.style.top = `${rect.top}px`;

    document.body.appendChild(noteEl);

    setTimeout(() => {
      noteEl.remove();
    }, 1200);
  });
}

function getScaleContextId() {
  if (typeof getCurrentScaleId === "function") {
    const v = getCurrentScaleId();
    if (v) return String(v).toLowerCase();
  }
  if (typeof currentScaleId === "string") return currentScaleId.toLowerCase();
  if (typeof currentScale === "string") return currentScale.toLowerCase();
  if (typeof window !== "undefined") {
    if (typeof window.currentScaleId === "string") {
      return window.currentScaleId.toLowerCase();
    }
    if (typeof window.currentScale === "string") {
      return window.currentScale.toLowerCase();
    }
  }
  return "";
}

// Extend/align with your actual scale IDs as needed.
const KEY_SIG_PREFS = {
  c_major: { prefer: "natural" },
  g_major: { prefer: "sharps" },
  d_major: { prefer: "sharps" },
  a_major: { prefer: "sharps" },
  e_major: { prefer: "sharps" },
  b_major: { prefer: "sharps" },
  "f#_major": { prefer: "sharps" },
  "c#_major": { prefer: "sharps" },
  f_major: { prefer: "flats" },
  bb_major: { prefer: "flats" },
  eb_major: { prefer: "flats" },
  ab_major: { prefer: "flats" },
  db_major: { prefer: "flats" },
  gb_major: { prefer: "flats" },
  cb_major: { prefer: "flats" },

  a_minor: { prefer: "natural" },
  e_minor: { prefer: "sharps" },
  b_minor: { prefer: "sharps" },
  "f#_minor": { prefer: "sharps" },
  "c#_minor": { prefer: "sharps" },
  "g#_minor": { prefer: "sharps" },
  "d#_minor": { prefer: "sharps" },

  d_minor: { prefer: "flats" },
  g_minor: { prefer: "flats" },
  c_minor: { prefer: "flats" },
  f_minor: { prefer: "flats" },
  bb_minor: { prefer: "flats" },
  eb_minor: { prefer: "flats" },
  ab_minor: { prefer: "flats" },
};

function inferKeySigPreferenceFromContext(ctx) {
  if (!ctx) return null;

  if (KEY_SIG_PREFS[ctx]) return KEY_SIG_PREFS[ctx].prefer;

  const m = ctx.match(/([a-g](?:b|#)?)[_\-](major|minor)/);
  if (m) {
    const keyId = (m[1] + "_" + m[2]).toLowerCase();
    if (KEY_SIG_PREFS[keyId]) return KEY_SIG_PREFS[keyId].prefer;
  }

  // Fallback mood-based hints
  if (
    ctx.includes("flat") ||
    ctx.includes("blue") ||
    ctx.includes("blues") ||
    ctx.includes("jazzy") ||
    ctx.includes("dark") ||
    ctx.includes("lofi") ||
    ctx.includes("moody") ||
    ctx.includes("minor")
  ) {
    return "flats";
  }

  return "sharps";
}

function noteNameFromMidi_Strict(midi) {
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const ctx = getScaleContextId();
  const pref = inferKeySigPreferenceFromContext(ctx) || "sharps";

  // Naturals
  switch (semitone) {
    case 0:
      return "C" + octave;
    case 2:
      return "D" + octave;
    case 4:
      return "E" + octave;
    case 5:
      return "F" + octave;
    case 7:
      return "G" + octave;
    case 9:
      return "A" + octave;
    case 11:
      return "B" + octave;
  }

  // Accidentals based on key preference
  if (semitone === 1) return (pref === "flats" ? "D♭" : "C♯") + octave;
  if (semitone === 3) return (pref === "flats" ? "E♭" : "D♯") + octave;
  if (semitone === 6) return (pref === "flats" ? "G♭" : "F♯") + octave;
  if (semitone === 8) return (pref === "flats" ? "A♭" : "G♯") + octave;
  if (semitone === 10) return (pref === "flats" ? "B♭" : "A♯") + octave;

  return "♪";
}

function toSuperscriptDigits(num) {
  const map = {
    "-": "⁻",
    0: "⁰",
    1: "¹",
    2: "²",
    3: "³",
    4: "⁴",
    5: "⁵",
    6: "⁶",
    7: "⁷",
    8: "⁸",
    9: "⁹",
  };
  return String(num)
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
}

function buildSongExportFromEntry(entry) {
  if (!entry) return null;

  const baseSeq =
    Array.isArray(entry.playSequence) && entry.playSequence.length
      ? entry.playSequence
      : Array.isArray(entry.sequence)
      ? entry.sequence
      : [];

  if (!baseSeq.length || typeof getFrequencyForCode !== "function") {
    return null;
  }

  const keyId = getScaleContextId() || null;
  const liveTempo = getState().tempo;
  const tempoBpm = typeof liveTempo === "number" && liveTempo > 0 ? liveTempo : 120;

  const events = [];

  for (let i = 0; i < baseSeq.length; i++) {
    const rawCode = baseSeq[i];
    const code = rawCode === " " ? "Space" : rawCode;

    const freq = getFrequencyForCode(code);
    if (!freq || !isFinite(freq) || freq <= 0) {
      continue; // skip non-tonal / invalid
    }

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    if (!isFinite(midi)) continue;

    const name = noteNameFromMidi_Strict(midi);
    if (!name || name === "♪") continue;

    events.push({
      step: i, // discrete position (0,1,2,...) at SONG_STEP_NOTE_VALUE each
      midi,
      note: name, // e.g. "C♯4" or "B♭3"
      // dynamics / articulations could be added here later in a deterministic way
    });
  }

  if (!events.length) return null;

  return {
    id: entry.id,
    name: entry.name,
    key: keyId,
    tempo: tempoBpm,
    stepNoteValue: SONG_STEP_NOTE_VALUE,
    events,
  };
}

function getNoteGlyphForCode(code) {
  const effectiveCode = code === " " ? "Space" : code;

  if (typeof getFrequencyForCode !== "function") {
    return "♪";
  }

  const freq = getFrequencyForCode(effectiveCode);
  if (!freq || !isFinite(freq) || freq <= 0) {
    return "♪";
  }

  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  if (!isFinite(midi)) {
    return "♪";
  }

  const strictName = noteNameFromMidi_Strict(midi); // e.g. "A♯4" / "B♭3" / "C4"
  if (!strictName || strictName === "♪") {
    return "♪";
  }

  // Parse into base, accidental, octave
  let base = "";
  let accidental = "";
  let octaveStr = "";

  for (const ch of strictName) {
    if (ch === "♯" || ch === "♭") {
      accidental = ch;
    } else if ((ch >= "0" && ch <= "9") || ch === "-") {
      octaveStr += ch;
    } else {
      base += ch;
    }
  }

  const octaveSup = octaveStr ? toSuperscriptDigits(octaveStr) : "";

  // Rhythmic symbol is tied to SONG_STEP_NOTE_VALUE so view == export.
  let noteHead = "♪"; // default eighth
  if (SONG_STEP_NOTE_VALUE === "quarter") noteHead = "♩";
  else if (SONG_STEP_NOTE_VALUE === "eighth") noteHead = "♪";
  else if (SONG_STEP_NOTE_VALUE === "sixteenth") noteHead = "♫";

  // If you want dynamics or articulations later, compute them deterministically
  // from sequence context / card metadata and ALSO store them in buildSongExportFromEntry.
  // For now we keep this clean & strictly reproducible: pitch + fixed rhythmic unit.
  // Example glyph: ♪C♯⁴, ♩B♭³, ♫G⁵

  let glyph = noteHead + base;
  if (accidental) glyph += accidental;
  if (octaveSup) glyph += octaveSup;

  return glyph || "♪";
}

function ensureNumpadRobot() {
  if (numpadRobotEl) return numpadRobotEl;

  const robot = document.createElement("div");
  robot.className = "numpad-robot";
  robot.innerHTML = `
    <div class="numpad-robot-face">
      <div class="numpad-robot-eye" data-eye="left"></div>
      <div class="numpad-robot-eye" data-eye="right"></div>
      <div class="numpad-robot-mouth"></div>
    </div>
    <div class="numpad-robot-speech">ouch!</div>
  `;

  document.body.appendChild(robot);

  numpadRobotEl = robot;
  numpadRobotEyes = Array.from(robot.querySelectorAll(".numpad-robot-eye"));

  // Start the floating animation once it's in the DOM
  startNumpadRobotFloat();

  // Easter egg: poke the robot
  robot.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    triggerNumpadRobotOuch();
  });

  return robot;
}

function flashNumpadRobotEyes(color) {
  const robot = ensureNumpadRobot();
  robot.classList.add("visible");

  if (numpadRobotHideTimer) {
    clearTimeout(numpadRobotHideTimer);
    numpadRobotHideTimer = null;
  }

  if (numpadRobotEyes && numpadRobotEyes.length) {
    numpadRobotEyes.forEach((eye) => {
      if (color) {
        eye.style.color = color; // used by .flash box-shadow
        eye.style.backgroundColor = color;
      }
      eye.classList.add("flash");
      setTimeout(() => {
        eye.classList.remove("flash");
      }, 180);
    });
  }

  // hide the robot again after a short idle period
  numpadRobotHideTimer = setTimeout(() => {
    robot.classList.remove("visible");
  }, 1400);
}

function startNumpadRobotFloat() {
  const robot = ensureNumpadRobot();
  if (numpadRobotFloatRAF !== null) return; // already running

  // Measure size
  const rect = robot.getBoundingClientRect();
  if (rect.width && rect.height) {
    numpadRobotSize.w = rect.width;
    numpadRobotSize.h = rect.height;
  }

  const margin = 16;
  const maxX = Math.max(window.innerWidth - numpadRobotSize.w - margin * 2, margin);
  const maxY = Math.max(window.innerHeight - numpadRobotSize.h - margin * 2, margin);

  // Initial random position
  numpadRobotPos.x = Math.random() * (maxX - margin) + margin;
  numpadRobotPos.y = Math.random() * (maxY - margin) + margin;

  // 🔥 Faster base speed
  const baseSpeed = 260; // was ~120

  const angle = Math.random() * Math.PI * 2;
  numpadRobotVel.x = Math.cos(angle) * baseSpeed;
  numpadRobotVel.y = Math.sin(angle) * baseSpeed;

  // Sporadic behavior tuning
  const minSpeed = 180;
  const maxSpeed = 340;
  const changeIntervalMin = 0.6; // seconds
  const changeIntervalMax = 1.8;

  let lastTime = performance.now();
  let nextDirChangeAt =
    lastTime +
    (changeIntervalMin +
      Math.random() * (changeIntervalMax - changeIntervalMin)) *
      1000;

  const step = (time) => {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    const maxX = window.innerWidth - numpadRobotSize.w - margin;
    const maxY = window.innerHeight - numpadRobotSize.h - margin;
    const minX = margin;
    const minY = margin;

    // Integrate position
    numpadRobotPos.x += numpadRobotVel.x * dt;
    numpadRobotPos.y += numpadRobotVel.y * dt;

    // Bounce off edges
    if (numpadRobotPos.x < minX) {
      numpadRobotPos.x = minX;
      numpadRobotVel.x *= -1;
    } else if (numpadRobotPos.x > maxX) {
      numpadRobotPos.x = maxX;
      numpadRobotVel.x *= -1;
    }

    if (numpadRobotPos.y < minY) {
      numpadRobotPos.y = minY;
      numpadRobotVel.y *= -1;
    } else if (numpadRobotPos.y > maxY) {
      numpadRobotPos.y = maxY;
      numpadRobotVel.y *= -1;
    }

    // 💥 Sporadic direction/speed changes
    if (time >= nextDirChangeAt) {
      // Random small turn: ±45°
      const jitterAngle = (Math.random() * Math.PI / 2) - (Math.PI / 4);
      const cosA = Math.cos(jitterAngle);
      const sinA = Math.sin(jitterAngle);

      const vx = numpadRobotVel.x;
      const vy = numpadRobotVel.y;

      let jx = vx * cosA - vy * sinA;
      let jy = vx * sinA + vy * cosA;

      // Randomize speed within a range
      const targetSpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      const norm = Math.hypot(jx, jy) || 1;
      jx = (jx / norm) * targetSpeed;
      jy = (jy / norm) * targetSpeed;

      numpadRobotVel.x = jx;
      numpadRobotVel.y = jy;

      // Schedule next change
      const interval =
        (changeIntervalMin +
          Math.random() * (changeIntervalMax - changeIntervalMin)) *
        1000;
      nextDirChangeAt = time + interval;
    }

    robot.style.left = `${numpadRobotPos.x}px`;
    robot.style.top = `${numpadRobotPos.y}px`;

    numpadRobotFloatRAF = requestAnimationFrame(step);
  };

  numpadRobotFloatRAF = requestAnimationFrame(step);

  // Keep him clamped when the window resizes
  window.addEventListener("resize", () => {
    const maxX = window.innerWidth - numpadRobotSize.w - margin;
    const maxY = window.innerHeight - numpadRobotSize.h - margin;
    numpadRobotPos.x = Math.min(Math.max(numpadRobotPos.x, margin), maxX);
    numpadRobotPos.y = Math.min(Math.max(numpadRobotPos.y, margin), maxY);
  });
}

function triggerNumpadRobotOuch() {
  const robot = ensureNumpadRobot();
  robot.classList.add("visible"); // make sure he’s on-screen
  robot.classList.add("ouch");

  // Briefly flash eyes in a painful color
  if (numpadRobotEyes && numpadRobotEyes.length) {
    numpadRobotEyes.forEach((eye) => {
      eye.style.color = "#fecaca";
      eye.style.backgroundColor = "#fecaca";
      eye.classList.add("flash");
      setTimeout(() => {
        eye.classList.remove("flash");
      }, 200);
    });
  }

  // Clear the ouch state after a short delay
  setTimeout(() => {
    robot.classList.remove("ouch");
  }, 500);
}
