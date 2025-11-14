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
} from "./keysonic-layout.js";

import { getFrequencyForIndex, SCALES } from "./keysonic-scales.js";

import {
  composeFromText,
  flattenEventsToStepCodes,
} from "./keysonic-composer.js";

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
let playbackSequence = null; // the base sequence, always in forward order
let playbackIndex = 0; // index of the NEXT note to play
let playbackLabel = ""; // the word/name shown in Now Playing
let playbackReversed = false; // are we currently moving backwards?
let playbackStep = 0; // how many notes have been played in this run
let currentPlaybackId = null; // which card (id) is currently playing, if any

let keyOrder = [];
let keyElements = {};
let keyboardEls = [];
let audioCtx;

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

let typedText = "";
let typedCodeSequence = [];

let nowPlayingChars = [];
let savedRecordings = [];

let tempo = 1;
let tempoSlider;
let tempoValueEl;

let currentScaleId = "major"; // default
let rootFreq = 220; // keep your current baseline
let scaleSelect; // DOM ref for the <select>
const SCALE_PREF_KEY = "keysonic-scale-pref-v1";
const SONG_STEP_NOTE_VALUE = "eighth"; // all events = 1/8 note by definition

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

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextCtor();

  tempoSlider = document.getElementById("tempo-slider");
  tempoValueEl = document.getElementById("tempo-value");
  typedBackspaceBtn = document.getElementById("typed-backspace-btn");

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

  if (typedBackspaceBtn) {
    typedBackspaceBtn.addEventListener("click", handleTypedBackspaceClick);
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

      // optional: if a song is currently playing, you could restart it here under the new scale
      // if (isPlayingBack) { stopPlayback(); /* optionally re-play last sequence */ }
    });
  }

  loadSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  resetTypedText();
  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
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

  let playSeq = [];

  // If we have a typedCodeSequence (new behavior), use that as the true playback sequence.
  if (typedCodeSequence && typedCodeSequence.length) {
    playSeq = typedCodeSequence.slice();
  } else {
    // Fallback for legacy behavior: derive from visible characters.
    for (const ch of name) {
      const code = mapCharToCodeFromTypedChar(ch);
      if (code) {
        playSeq.push(code);
      }
    }
  }

  if (!playSeq.length) return;

  const entryName = makeUniqueName(name);

  const entry = {
    id: makeId(),
    name,
    // Display sequence: exactly what user sees in "Spell a Song"
    sequence: name.split(""),
    // Playback sequence: true keystrokes, including action keys.
    playSequence: playSeq,
    loop: false,
    reverse: false,
    compose: false,
  };

  savedRecordings.push(entry);
  persistSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  resetTypedText();
  updateControls();
}

function handleSavedGridClick(e) {
  
  const loopBtn = e.target.closest(".saved-card-loop-toggle");
  if (loopBtn) {
    const card = loopBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    const entry = savedRecordings.find((r) => r.id === id);
    if (!entry) return;

    // Flip this recording's loop flag
    entry.loop = !entry.loop;

    persistSavedRecordings();
    renderSavedGrid(savedGridEl, savedRecordings);
    applyColorsToSavedTitles();
    applyPlaybackCardHighlight(); // keep playing highlight in sync

    e.stopPropagation();
    return;
  }

  const deleteBtn = e.target.closest(".saved-card-delete");
  if (deleteBtn) {
    const card = deleteBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    // If this card is currently playing, stop playback immediately
    if (currentPlaybackId === id) {
      stopPlayback();
    }

    savedRecordings = savedRecordings.filter((r) => r.id !== id);
    persistSavedRecordings();
    renderSavedGrid(savedGridEl, savedRecordings);
    applyColorsToSavedTitles();
    applyPlaybackCardHighlight();

    if (savedRecordings.length === 0) {
      recordedSequence = [];
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

    const entry = savedRecordings.find((r) => r.id === id);
    if (!entry) return;

    // Toggle this recording's reverse flag
    entry.reverse = !entry.reverse;

    persistSavedRecordings();
    renderSavedGrid(savedGridEl, savedRecordings);
    applyColorsToSavedTitles();
    applyPlaybackCardHighlight();

    // If THIS card is currently playing, flip direction in-place
    if (
      isPlayingBack &&
      currentPlaybackId === id &&
      playbackSequence &&
      playbackSequence.length
    ) {
      const len = playbackSequence.length;
      const oldDir = playbackReversed ? -1 : 1;
      const newReversed = !!entry.reverse;
      const newDir = newReversed ? -1 : 1;

      if (oldDir !== newDir) {
        // lastPlayed = index we just played
        const lastPlayed = (((playbackIndex - oldDir) % len) + len) % len;
        playbackReversed = newReversed;

        // next note should be one step in the new direction from lastPlayed
        playbackIndex = (lastPlayed + newDir + len) % len;
        // do NOT reset playbackStep; highlight progression continues smoothly
      } else {
        playbackReversed = newReversed;
      }
    }

    e.stopPropagation();
    return;
  }

  const composeBtn = e.target.closest(".saved-card-compose-toggle");
  if (composeBtn) {
    const card = composeBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;

    const entry = savedRecordings.find((r) => r.id === id);
    if (!entry) return;

    // 1) Flip this recording's Composer-ify flag
    entry.compose = !entry.compose;

    // 2) Persist + rerender UI (same pattern as loop/reverse)
    persistSavedRecordings();
    renderSavedGrid(savedGridEl, savedRecordings);
    applyColorsToSavedTitles();
    applyPlaybackCardHighlight();

    // 3) If THIS card is currently playing, restart playback
    //    with the appropriate (composed or raw) sequence.
    if (isPlayingBack && currentPlaybackId && currentPlaybackId === id) {
      // Start from the raw recorded sequence
      let seq = entry.sequence.slice();

      // Apply composer-ify if the toggle is now ON
      if (entry.compose && seq.length) {
        const song = composeFromText(seq, {
          meter: "4/4",
          restBetweenWords: 3,
          wordContour: "arch",
          maxSpan: 4,
        });
        seq = flattenEventsToStepCodes(song);
      }

      // This will stop the old playback and immediately start
      // the new one using the same label and reverse state.
      playSequence(seq, entry.name, id, !!entry.reverse);
    }

    e.stopPropagation();
    return;
  }

  const card = e.target.closest(".saved-card");
  if (!card) return;

  const id = card.dataset.id;
  const entry = savedRecordings.find((r) => r.id === id);
  if (!entry || !entry.sequence.length) return;

  // If this card is currently playing, treat click as a STOP toggle
  if (isPlayingBack && currentPlaybackId === id) {
    stopPlayback();
    return;
  }

  // Start from the raw code sequence we recorded
  let seq = entry.sequence.slice();

  // If composer-ify is enabled for this card, transform it
  if (entry.compose && seq.length) {
    const song = composeFromText(seq, {
      meter: "4/4",
      restBetweenWords: 3,
      wordContour: "arch",
      maxSpan: 4,
    });
    seq = flattenEventsToStepCodes(song);
  }

  // Start playback of this card
  stopPlayback();
  playSequence(seq, entry.name, id, !!entry.reverse);
}

function handleTypedBackspaceClick() {
  if (isRecording || isPlayingBack) return;
  if (!typedText || typedText.length === 0) return;

  // Remove last character from Spell a Song text
  typedText = typedText.slice(0, -1);
  if (typedCodeSequence.length > 0) {
    typedCodeSequence.pop();
  }

  syncTypedDisplay();
  updateControls();
}

function stopPlayback() {
  if (playbackTimeoutId !== null) {
    clearTimeout(playbackTimeoutId);
    playbackTimeoutId = null;
  }

  isPlayingBack = false;
  playbackSequence = null;
  playbackIndex = 0;
  playbackLabel = "";
  playbackReversed = false;
  playbackStep = 0;
  currentPlaybackId = null;

  nowPlayingChars = setNowPlaying(nowPlayingEl, "");
  updateControls();
  applyPlaybackCardHighlight();
}

function shouldLoopCurrent() {
  if (!currentPlaybackId) return false;
  const rec = savedRecordings.find((r) => r.id === currentPlaybackId);
  return !!(rec && rec.loop);
}

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

  if (typedBackspaceBtn) {
    const canBackspace = hasTyped && !isRecording && !isPlayingBack;
    typedBackspaceBtn.disabled = !canBackspace;
  }
}

function recordKeyStroke(code) {
  if (isRecording && !isPlayingBack) {
    recordedSequence.push(code);
    updateControls();
  }
}

function playSequence(sequence, label, playbackId = null, reversed = false) {
  if (!sequence || !sequence.length) return;

  // Clean start
  stopPlayback();
  resetTypedText();

  isPlayingBack = true;
  isRecording = false;

  playbackSequence = sequence.slice(); // keep as-is, forward
  playbackLabel = label != null ? String(label) : "";
  playbackReversed = !!reversed;
  playbackStep = 0;

  const len = playbackSequence.length;
  playbackIndex = playbackReversed ? len - 1 : 0; // start at end if reversed

  if (playbackId) currentPlaybackId = playbackId;

  nowPlayingChars = setNowPlaying(nowPlayingEl, playbackLabel);
  if (len) {
    updateNowPlayingColors(nowPlayingChars, playbackSequence);
  }

  updateControls();
  applyPlaybackCardHighlight();

  queueNextPlaybackStep();
}

function queueNextPlaybackStep() {
  if (!isPlayingBack || !playbackSequence) {
    stopPlayback();
    return;
  }

  const seqLen = playbackSequence.length;
  if (!seqLen) {
    stopPlayback();
    return;
  }

  // If we're out of bounds, decide whether to loop or end.
  if (playbackIndex < 0 || playbackIndex >= seqLen) {
    if (!shouldLoopCurrent || !shouldLoopCurrent()) {
      const tail = 200 / (tempo || 1);
      playbackTimeoutId = setTimeout(() => {
        stopPlayback();
      }, tail);
      return;
    }

    // Wrap for looping based on current direction
    playbackIndex = playbackReversed ? seqLen - 1 : 0;
  }

  // Use a stable local index for this step
  const currentIndex = playbackIndex;
  const code = playbackSequence[currentIndex];

  // Play this note (keys + audio)
  triggerKey(code, { fromPlayback: true });

  // ----- NOW PLAYING HIGHLIGHT -----
  // Match the visual highlight to the same logical index we're using for notes.
  if (playbackLabel && nowPlayingChars && nowPlayingChars.length) {
    const charCount = nowPlayingChars.length;

    if (charCount > 0) {
      let hi;

      if (seqLen === charCount) {
        // 1:1: note index maps directly to character index
        hi = currentIndex;
      } else {
        // Different lengths: map proportionally so it feels aligned
        const denom = Math.max(seqLen - 1, 1);
        hi = Math.round((currentIndex / denom) * (charCount - 1));
      }

      // Clamp into range
      if (hi < 0) hi = 0;
      if (hi >= charCount) hi = charCount - 1;

      updateNowPlayingColors(nowPlayingChars, playbackSequence);
      highlightNowPlayingIndex(nowPlayingChars, hi);
    }
  }
  // ----- END HIGHLIGHT -----

  // Advance index for the NEXT step based on current direction.
  if (playbackReversed) {
    playbackIndex = currentIndex - 1;
  } else {
    playbackIndex = currentIndex + 1;
  }

  // Schedule next step using live tempo
  const baseStep = 220;
  const stepMs = baseStep / (tempo || 1);
  playbackTimeoutId = setTimeout(queueNextPlaybackStep, stepMs);
}

function autoSaveCurrentRecording() {
  const playSeq = [...recordedSequence];
  if (!playSeq.length) return;

  // Build display sequence: action keys -> spaces, others -> themselves
  const displaySeq = playSeq.map((code) => {
    const ch = mapCodeToCharForTyping(code);
    // If mapCodeToCharForTyping returns null, fall back to the raw code
    // so we don't lose anything unexpectedly.
    return ch !== null && ch !== undefined ? ch : code;
  });

  const rawName = typedText || "";
  const hasNonSpace = rawName.split("").some((ch) => ch !== " ");

  const baseName = hasNonSpace
    ? rawName
    : `Recording ${savedRecordings.length + 1}`;

  const name = makeUniqueName(baseName);

  const entry = {
    id: makeId(),
    name,
    // Human-facing view: what we show on cards, etc.
    sequence: displaySeq,
    // Machine-facing sequence: exact keystrokes used for playback.
    playSequence: playSeq,
    loop: false,
    reverse: false,
    compose: false,
  };

  savedRecordings.push(entry);
  persistSavedRecordings();
  renderSavedGrid(savedGridEl, savedRecordings);
  applyColorsToSavedTitles();

  recordedSequence = [];
}

function loadSavedRecordings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savedRecordings = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      savedRecordings = parsed
        .filter((r) => r && Array.isArray(r.sequence) && r.sequence.length)
        .map((r) => {
          const hasPlay =
            Array.isArray(r.playSequence) && r.playSequence.length;

          // If playSequence is missing, assume old format where sequence was used for playback.
          const playSequence = hasPlay
            ? r.playSequence.slice()
            : r.sequence.slice();

          // For display, prefer existing sequence; if missing, derive from playSequence.
          let displaySequence;
          if (Array.isArray(r.sequence) && r.sequence.length) {
            displaySequence = r.sequence.slice();
          } else {
            displaySequence = playSequence.map((code) => {
              const ch = mapCodeToCharForTyping(code);
              return ch !== null && ch !== undefined ? ch : code;
            });
          }

          return {
            ...r,
            sequence: displaySequence,
            playSequence,
            loop: !!r.loop,
            reverse: !!r.reverse,
          };
        });
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

function resetTypedText() {
  typedText = "";
  typedCodeSequence = [];
  syncTypedDisplay();
  updateControls();
}

function updateTypedTextForUserKey(code) {
  // View-only mapping: what character should appear in "Spell a Song"?
  const ch = mapCodeToCharForTyping(code);

  // If this key contributes a visible character (including " " for action keys),
  // append BOTH the display char and the actual code.
  if (ch !== null && ch !== undefined) {
    typedText += ch;
    typedCodeSequence.push(code);

    if (typedText.length > TYPED_MAX_LENGTH) {
      // Trim from the front to keep the last TYPED_MAX_LENGTH chars in sync
      const overflow = typedText.length - TYPED_MAX_LENGTH;
      typedText = typedText.slice(overflow);
      typedCodeSequence = typedCodeSequence.slice(overflow);
    }
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
  // lighter pastel but more saturated → better separation between hues
  return isNaN(hue) ? "var(--key)" : `hsl(${hue}, 55%, 88%)`;
}

function getBaseKeyBorder(hue) {
  // darker border for contrast against the base fill
  return isNaN(hue) ? "var(--key-border)" : `hsl(${hue}, 55%, 70%)`;
}

function getActiveKeyColor(hue) {
  // vivid active color so pressed keys really pop
  return isNaN(hue) ? "var(--key)" : `hsl(${hue}, 80%, 48%)`;
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
    recordKeyStroke(code);
    updateTypedTextForUserKey(code);
  }

  // Playback:
  // - action keys light up their own key
  // - space (" ") lights the spacebar
  // - echo hits can walk the bass (degreeOffset) and get special visuals
  playTone(code, { degreeOffset });
  flashKey(code, { isEcho });
}

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

function applyPlaybackCardHighlight() {
  if (!savedGridEl) return;
  const cards = savedGridEl.querySelectorAll(".saved-card");
  cards.forEach((card) => {
    const id = card.dataset.id;
    const isPlayingCard = currentPlaybackId && id === currentPlaybackId;
    card.classList.toggle("playing", !!isPlayingCard);
  });
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

  // 🔑 For keys with multiple physical instances (Shift, Ctrl, Alt, etc.),
  //     create a note for EACH DOM element.
  els.forEach((keyEl) => {
    const rect = keyEl.getBoundingClientRect();

    const noteEl = document.createElement("div");
    noteEl.className = isEcho ? "note-float note-float-echo" : "note-float";
    noteEl.textContent = glyph;

    // Color: match the key’s hue if present
    const hue = parseFloat(keyEl.dataset.hue);
    if (!isNaN(hue)) {
      const sat = isEcho ? 96 : 92;
      const light = isEcho ? 60 : 64;
      noteEl.style.color = `hsl(${hue}, ${sat}%, ${light}%)`;
    }

    // Horizontal flutter: small random offset left/right per key
    const dx = (Math.random() * 26 - 13).toFixed(1) + "px";
    noteEl.style.setProperty("--dx", dx);

    // Position at top-center of this specific key
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

// Explicit preferences for some common keys.
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

//maybe later we export the "songs sentneces"
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
  const tempoBpm = typeof tempo === "number" && tempo > 0 ? tempo : 120;

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
