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

import { createPadGrid } from "./components/pad-grid.js";

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
let keyboardWrapperEl;
let padGridContainer;
let displayLegend;
let controlsToggleBtn;
let recordBtn;
let stopBtn;
let clearBtn;
let saveTypedBtn;
let importFileInput;
let typedTextEl;
let nowPlayingEl;
let savedGridEl;
let typedBackspaceBtn;
let actionMenuToggle;
let actionMenuList;
let exportModal;
let exportList;
let exportModalClose;
let exportModalExport;
let menuImportBtn;
let menuExportBtn;
let menuThemeBtn;
let menuFullscreenBtn;
let exportSelectAllToggle;

let nowPlayingChars = [];
let tempoSlider;
let tempoValueEl;
let volumeSlider;
let volumeValueEl;
let audioModeSelect;
let layoutSelect;
let lastKeydownTime = null;
const playbackNoteStopTimers = new Map();
let playbackNoteCounter = 0;

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
const VOLUME_PREF_KEY = "keysonic-volume-pref-v1";
const AUDIO_MODE_PREF_KEY = "keysonic-audio-mode-pref-v1";
const LAYOUT_PREF_KEY = "keysonic-layout-mode-pref-v1";
const SONG_STEP_NOTE_VALUE = "eighth"; // all events = 1/8 note by definition
const PAD_GRID_ROWS = 8;
const PAD_GRID_COLS = 10;
let themeSelect;
let instrumentSelect;
let currentLayoutMode = "keyboard";
let padGridInstance = null;
let padKeyElements = {};
let padGridShadowHost = null;

const DEFAULT_KEY_COLOR_SETTINGS = {
  saturation: 55,
  lightness: 88,
  borderSaturation: 55,
  borderLightness: 70,
  activeSaturation: 80,
  activeLightness: 48,
  toneSaturation: 90,
  toneLightness: 55,
  hueShift: 0,
  hueBase: 0,
  hueRange: 360,
};

let keyColorSettings = { ...DEFAULT_KEY_COLOR_SETTINGS };

let keyboardView;
let nowPlayingView;
let savedGridView;
let typedTextView;
const settingsDirtyIds = new Set();
let suppressDirtyMarks = false;
function markPlaybackSettingsDirty() {
  if (suppressDirtyMarks) return;
  const state = getState();
  const id = state?.playback?.id;
  if (!state?.isPlayingBack || !id) return;
  if (settingsDirtyIds.has(id)) return;
  settingsDirtyIds.add(id);
  savedGridView?.setSettingsDirty(id, true);
}

function clearSettingsDirty(id) {
  if (!id) return;
  settingsDirtyIds.delete(id);
  savedGridView?.setSettingsDirty(id, false);
}

const getState = () => store.getState();

function applyInstrument(id) {
  const sanitized = id || "piano";
  if (audioService?.setInstrument) {
    audioService.setInstrument(sanitized === "legacy" ? "sine" : sanitized);
  }
  markPlaybackSettingsDirty();
  try {
    localStorage.setItem(INSTRUMENT_PREF_KEY, sanitized);
  } catch (err) {
    // ignore storage issues
  }
}

function getCurrentInstrumentId() {
  if (instrumentSelect && instrumentSelect.value) {
    return instrumentSelect.value;
  }
  try {
    const saved = localStorage.getItem(INSTRUMENT_PREF_KEY);
    if (saved) return saved;
  } catch (err) {
    // ignore storage issues
  }
  return "piano";
}

function applyEngine(mode) {
  const resolved =
    audioService && typeof audioService.setAudioMode === "function"
      ? audioService.setAudioMode(mode)
      : audioService && typeof audioService.setEngine === "function"
      ? audioService.setEngine(mode)
      : "classic";
  if (resolved === "tone") {
    audioService?.ensureUnlocked();
  }
  markPlaybackSettingsDirty();
  try {
    localStorage.setItem(AUDIO_MODE_PREF_KEY, resolved);
  } catch (err) {
    // ignore storage issues
  }
  return resolved;
}

function getCurrentSettingsSnapshot() {
  return {
    tempo: getState().tempo || 1,
    scaleId: currentScaleId,
    instrument: getCurrentInstrumentId(),
    engine:
      (audioService?.getAudioMode && audioService.getAudioMode()) ||
      (audioService?.getEngine && audioService.getEngine()) ||
      "classic",
    rootFreq,
  };
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
    hueShift: parseCssNumber(
      styles.getPropertyValue("--key-hue-shift"),
      DEFAULT_KEY_COLOR_SETTINGS.hueShift
    ),
    hueBase: parseCssNumber(
      styles.getPropertyValue("--key-hue-base"),
      DEFAULT_KEY_COLOR_SETTINGS.hueBase
    ),
    hueRange: parseCssNumber(
      styles.getPropertyValue("--key-hue-range"),
      DEFAULT_KEY_COLOR_SETTINGS.hueRange
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
  settingsDirtyIds.forEach((id) => savedGridView?.setSettingsDirty(id, true));
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
  if (tempoSlider && parseFloat(tempoSlider.value) !== next) {
    tempoSlider.value = String(next);
  }
}

function updateVolume(value) {
  const next = !isNaN(value) && value >= 0 ? Math.min(value, 1.5) : 0.8;
  if (audioService?.setVolume) {
    audioService.setVolume(next);
  }
  if (volumeValueEl) {
    volumeValueEl.textContent = `${Math.round(next * 100)}%`;
  }
}

function applyScale(nextScaleId) {
  const target = SCALES[nextScaleId] ? nextScaleId : currentScaleId;
  if (!SCALES[target]) return currentScaleId;

  currentScaleId = target;
  markPlaybackSettingsDirty();
  try {
    localStorage.setItem(SCALE_PREF_KEY, target);
  } catch (err) {
    // ignore storage issues
  }

  if (scaleSelect) {
    scaleSelect.value = currentScaleId;
  }

  if (keyElements) {
    Object.entries(keyElements).forEach(([code, els]) => {
      const hue = getHueForCode(code);
      if (isNaN(hue)) return;

      els.forEach((el) => {
        el.dataset.hue = String(hue);
      });
    });

    applyBaseKeyColors();
  }

  applyColorsToSavedTitles();
  syncTypedDisplay();

  const playbackSeq = getState().playback.sequence;
  if (playbackSeq.length) {
    nowPlayingView.tint(playbackSeq, getHueForCode, getToneColor);
  }

  return currentScaleId;
}

// ----- Public Init -----

export function initKeysonic() {
  const dom = getDomRefs();
  ({
    mainRowsContainer,
    numpadContainer,
    keyboardWrapper: keyboardWrapperEl,
    padGridContainer,
    displayLegend,
    controlsToggle: controlsToggleBtn,
    typedTextEl,
    nowPlayingEl,
    savedGridEl,
    recordBtn,
    stopBtn,
    clearBtn,
    saveTypedBtn,
    importFileInput,
    actionMenuToggle,
    actionMenuList,
    layoutSelect,
    menuImportBtn,
    menuExportBtn,
    menuThemeBtn,
    menuFullscreenBtn,
    exportModal,
    exportList,
    exportModalClose,
    exportModalExport,
    exportSelectAllToggle,
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
      applyColorsToSavedTitles();
      syncTypedDisplay();
      const playbackSeq = getState().playback.sequence;
      if (playbackSeq.length) {
        nowPlayingView.tint(playbackSeq, getHueForCode, getToneColor);
      }
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
  volumeSlider = document.getElementById("volume-slider");
  volumeValueEl = document.getElementById("volume-value");
  audioModeSelect = document.getElementById("audio-mode-select");
  typedBackspaceBtn = document.getElementById("typed-backspace-btn");

  if (tempoSlider) {
    const initial = parseFloat(tempoSlider.value) || 1;
    updateTempo(initial);
    tempoSlider.addEventListener("input", () => {
      const val = parseFloat(tempoSlider.value);
      updateTempo(val);
    });
  }

  if (volumeSlider) {
    const savedVol = parseFloat(localStorage.getItem(VOLUME_PREF_KEY));
    const initialVol = !isNaN(savedVol) ? savedVol : parseFloat(volumeSlider.value) || 0.8;
    updateVolume(initialVol);
    volumeSlider.value = initialVol;
    volumeSlider.addEventListener("input", () => {
      const val = parseFloat(volumeSlider.value);
      updateVolume(val);
      try {
        localStorage.setItem(VOLUME_PREF_KEY, String(val));
      } catch (err) {
        // ignore storage failures
      }
    });
  }

  if (typedBackspaceBtn) {
    typedBackspaceBtn.addEventListener("click", handleTypedBackspaceClick);
  }

  if (audioModeSelect) {
    const savedMode = localStorage.getItem(AUDIO_MODE_PREF_KEY) || "classic";
    const active = applyEngine(savedMode);
    audioModeSelect.value = active;
    audioModeSelect.addEventListener("change", () => {
      const resolved = applyEngine(audioModeSelect.value);
      audioModeSelect.value = resolved;
    });
  } else {
    applyEngine("classic");
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
    onKeyRelease: (code) => {
      handleKeyRelease(code);
    },
  });

  const { keyElements: builtKeys, keyboardEls: builtBoards } = keyboardView.mount();
  keyElements = builtKeys;
  keyboardEls = builtBoards;

  nowPlayingView = new NowPlayingView(nowPlayingEl);
  savedGridView = new SavedGridView(savedGridEl);
  typedTextView = new TypedTextView(typedTextEl);

  applyBaseKeyColors();
  setupLayoutSwitcher();
  setupControlsToggle();
  setDisplayLegend("Spell a Song");
  // Use one shared display for typed and now-playing.
  nowPlayingEl = typedTextEl;
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
    applyScale(currentScaleId);

    // react to user changes
    scaleSelect.addEventListener("change", () => {
      applyScale(scaleSelect.value);
    });
  }

  loadSavedRecordings();
  savedGridView.render(store.getState().savedRecordings);
  applyColorsToSavedTitles();
  updateSelectAllToggle();

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
  window.addEventListener("keyup", handleKeyup);
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
  if (importFileInput) {
    importFileInput.addEventListener("change", handleImportFileChange);
  }
  if (actionMenuToggle) {
    actionMenuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleActionMenu();
    });
  }
  if (menuImportBtn) {
    menuImportBtn.addEventListener("click", () => {
      toggleActionMenu(true);
      handleImportClick();
    });
  }
  if (menuExportBtn) {
    menuExportBtn.addEventListener("click", () => {
      toggleActionMenu(true);
      openExportModal();
    });
  }
  if (menuThemeBtn) {
    menuThemeBtn.addEventListener("click", () => {
      toggleActionMenu(true);
      if (themeSelect) {
        themeSelect.focus();
        themeSelect.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
  if (menuFullscreenBtn) {
    menuFullscreenBtn.addEventListener("click", toggleFullscreen);
  }
  if (exportModalClose) {
    exportModalClose.addEventListener("click", closeExportModal);
  }
  if (exportModal) {
    exportModal.addEventListener("click", (e) => {
      if (e.target === exportModal) closeExportModal();
    });
  }
  document.addEventListener("click", (e) => {
    if (actionMenuList && !actionMenuList.hidden) {
      const isInside =
        actionMenuList.contains(e.target) || actionMenuToggle?.contains(e.target);
      if (!isInside) toggleActionMenu(true);
    }
  });
  if (exportModalExport) {
    exportModalExport.addEventListener("click", () => {
      exportSongs(getSelectedExportIds());
      closeExportModal();
    });
  }
  if (exportSelectAllToggle) {
    exportSelectAllToggle.addEventListener("change", handleSelectAllToggle);
  }
  if (savedGridEl) {
    savedGridEl.addEventListener("click", handleSavedGridClick);
  }
  document.querySelectorAll(".panel-hide-btn").forEach((btn) => {
    btn.addEventListener("click", () => setControlsCollapsed(true));
  });
}

function wirePlaybackEvents() {
  playbackService.on("start", handlePlaybackStarted);
  playbackService.on("stop", handlePlaybackStopped);
  playbackService.on("step", handlePlaybackStep);
}

function setupLayoutSwitcher() {
  let savedLayout = "keyboard";
  try {
    const stored = localStorage.getItem(LAYOUT_PREF_KEY);
    if (stored === "pads" || stored === "keyboard") {
      savedLayout = stored;
    }
  } catch (err) {
    // ignore storage failures
  }
  currentLayoutMode = savedLayout;

  if (layoutSelect) {
    layoutSelect.value = savedLayout;
    layoutSelect.addEventListener("change", () => {
      applyLayout(layoutSelect.value);
    });
  }

  applyLayout(savedLayout);
}

function applyLayout(nextLayout) {
  const resolved = nextLayout === "pads" ? "pads" : "keyboard";
  currentLayoutMode = resolved;
  if (layoutSelect && layoutSelect.value !== resolved) {
    layoutSelect.value = resolved;
  }

  try {
    localStorage.setItem(LAYOUT_PREF_KEY, resolved);
  } catch (err) {
    // ignore storage failures
  }

  setBodyLayoutClass(resolved);

  if (resolved === "pads") {
    hideKeyboardLayout();
    showPadLayout();
  } else {
    hidePadLayout();
    showKeyboardLayout();
  }
}

function showKeyboardLayout() {
  if (keyboardWrapperEl) {
    keyboardWrapperEl.style.display = "";
    keyboardWrapperEl.removeAttribute("aria-hidden");
  }
}

function hideKeyboardLayout() {
  if (keyboardWrapperEl) {
    keyboardWrapperEl.style.display = "none";
    keyboardWrapperEl.setAttribute("aria-hidden", "true");
  }
}

function showPadLayout() {
  if (padGridContainer) {
    padGridContainer.hidden = false;
  }
  renderPadGrid();
}

function hidePadLayout() {
  if (padGridContainer) {
    padGridContainer.hidden = true;
  }
  destroyPadGrid();
}

function renderPadGrid() {
  if (!padGridContainer || padGridInstance) {
    if (padGridContainer) padGridContainer.hidden = false;
    attachPadGridShadowHost(padGridInstance?.gridEl || padGridContainer);
    return;
  }

  padGridInstance = createPadGrid({
    container: padGridContainer,
    rows: PAD_GRID_ROWS,
    cols: PAD_GRID_COLS,
    getCodeForIndex: getPadCodeForIndex,
    getHueForCode: (code) => getHueForCode(code),
    onPadDown: ({ index, code, el }) => {
      const resolved = code || getPadCodeForIndex(index);
      if (!resolved) return;
      if (el) el.dataset.padHeld = "1";
      handleFirstInteraction();
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      triggerKey(resolved, { eventTime: now });
    },
    onPadUp: ({ index, code, el }) => {
      const resolved = code || getPadCodeForIndex(index);
      if (el) {
        el.dataset.padHeld = "0";
        resetPadElement(el);
      }
      if (!resolved) return;
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      handleKeyRelease(resolved, now);
    },
  });

  registerPadKeyElements(padGridInstance?.cells || []);
  attachPadGridShadowHost(padGridInstance?.gridEl || padGridContainer);
  applyBaseKeyColors();
}

function destroyPadGrid() {
  detachPadGridShadowHost();
  removePadKeyElements();
  if (padGridInstance?.destroy) {
    padGridInstance.destroy();
  }
  padGridInstance = null;
}

function registerPadKeyElements(cells) {
  padKeyElements = {};
  if (!Array.isArray(cells)) return;
  cells.forEach(({ code, el }) => {
    if (!code || !el) return;
    if (!keyElements[code]) keyElements[code] = [];
    keyElements[code].push(el);
    if (!padKeyElements[code]) padKeyElements[code] = [];
    padKeyElements[code].push(el);
  });
}

function removePadKeyElements() {
  if (!padKeyElements || !keyElements) return;
  Object.entries(padKeyElements).forEach(([code, els]) => {
    if (!Array.isArray(keyElements[code])) return;
    keyElements[code] = keyElements[code].filter((el) => !els.includes(el));
    if (!keyElements[code].length) {
      delete keyElements[code];
    }
  });
  padKeyElements = {};
}

function attachPadGridShadowHost(el) {
  if (!el) return;
  padGridShadowHost = el;
  if (!keyboardEls.includes(el)) {
    keyboardEls = [...keyboardEls, el];
  }
}

function detachPadGridShadowHost() {
  if (padGridShadowHost) {
    keyboardEls = keyboardEls.filter((el) => el !== padGridShadowHost);
  }
  padGridShadowHost = null;
}

function getPadCodeForIndex(idx) {
  if (!Array.isArray(keyOrder) || !keyOrder.length) return null;
  if (!Number.isInteger(idx) || idx < 0) return null;
  return keyOrder[idx % keyOrder.length] || null;
}

function setBodyLayoutClass(layoutMode) {
  const body = document.body;
  if (!body) return;
  body.classList.toggle("layout-pads", layoutMode === "pads");
}

function setControlsCollapsed(collapsed) {
  const shouldCollapse = !!collapsed;
  document.body.classList.toggle("controls-collapsed", shouldCollapse);
  if (controlsToggleBtn) {
    controlsToggleBtn.textContent = shouldCollapse ? "Show Controls" : "Hide Controls";
    controlsToggleBtn.setAttribute("aria-expanded", shouldCollapse ? "false" : "true");
  }
  if (shouldCollapse) {
    toggleActionMenu(true);
  }
}

function toggleFullscreen() {
  toggleActionMenu(true);
  const doc = document;
  const docEl = doc.documentElement;
  const inFullscreen =
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement;

  if (inFullscreen) {
    if (doc.exitFullscreen) doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
    else if (doc.msExitFullscreen) doc.msExitFullscreen();
  } else {
    if (docEl.requestFullscreen) docEl.requestFullscreen();
    else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
    else if (docEl.mozRequestFullScreen) docEl.mozRequestFullScreen();
    else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
  }
}

function setupControlsToggle() {
  if (!controlsToggleBtn) return;
  controlsToggleBtn.addEventListener("click", () => {
    const collapsed = document.body.classList.contains("controls-collapsed");
    setControlsCollapsed(!collapsed);
  });
}

function setDisplayLegend(text) {
  if (displayLegend) {
    displayLegend.textContent = text || "Spell a Song";
  }
}


function handlePlaybackStarted(snapshot) {
  handleFirstInteraction();
  audioService?.ensureToneReady?.();
  clearPlaybackNoteTimers({ stopNotes: true });
  playbackNoteCounter = 0;
  document.body.classList.add("is-playing-back");
  setDisplayLegend("Now Playing");
  const state = getState();
  const label = snapshot?.label || state?.typedText || "";
  nowPlayingChars = nowPlayingView.setLabel(label);
  if (snapshot?.sequence?.length) {
    const seqForTint = snapshot.sequence.map((s) =>
      typeof s === "object" ? s.code : s
    );
    nowPlayingView.tint(seqForTint, getHueForCode, getToneColor);
  }
  if (snapshot?.settings) {
    applyPlaybackSettings(snapshot.settings);
    retintNowPlaying();
  }
  clearSettingsDirty(snapshot?.id);
  applyPlaybackCardHighlight();
  updateControls();
}

function handlePlaybackStopped() {
  clearPlaybackNoteTimers({ stopNotes: true });
  nowPlayingChars = nowPlayingView.setLabel("");
  document.body.classList.remove("is-playing-back");
  setDisplayLegend("Spell a Song");
  syncTypedDisplay();
  applyPlaybackCardHighlight();
  updateControls();
}

function handlePlaybackStep({ code, index, sequence, velocity, durationMs, playbackId }) {
  handleFirstInteraction();
  const hasDuration = Number.isFinite(durationMs);
  const noteId = hasDuration ? `pb-${playbackId || "seq"}-${playbackNoteCounter++}` : null;
  triggerKey(code, {
    fromPlayback: true,
    velocity,
    durationMs: hasDuration ? durationMs : null,
    noteId,
  });
  highlightPlaybackProgress(index, sequence);
}

function applyPlaybackSettings(source) {
  const settings = source && source.settings ? source.settings : source;
  if (!settings || typeof settings !== "object") return;

  if (typeof settings.tempo === "number" && !Number.isNaN(settings.tempo)) {
    updateTempo(settings.tempo);
  }

  if (typeof settings.scaleId === "string" && SCALES[settings.scaleId]) {
    applyScale(settings.scaleId);
  }

  if (typeof settings.instrument === "string" && settings.instrument) {
    applyInstrument(settings.instrument);
    if (instrumentSelect) {
      instrumentSelect.value = settings.instrument;
    }
  }

  if (Number.isFinite(settings.rootFreq)) {
    rootFreq = Number(settings.rootFreq);
  }

  if (typeof settings.engine === "string") {
    const resolved = applyEngine(settings.engine);
    if (audioModeSelect) {
      audioModeSelect.value = resolved;
    }
  }

  retintNowPlaying();
}

function retintNowPlaying() {
  const playbackSeq = getState().playback.sequence || [];
  if (!playbackSeq.length) return;
  const seqForTint = playbackSeq.map((s) => (typeof s === "object" ? s.code : s));
  nowPlayingView.tint(seqForTint, getHueForCode, getToneColor);
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
  handleFirstInteraction();

  const mapped = normalizeEventToCode(e);
  if (!mapped || !keyOrder.includes(mapped)) return;

  const now =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  let velocity = 0.7;
  if (lastKeydownTime !== null) {
    const dt = Math.min(400, Math.max(40, now - lastKeydownTime));
    const t = (400 - dt) / (400 - 40); // 0..1
    velocity = 0.3 + t * (1.0 - 0.3);
  }
  lastKeydownTime = now;

  if (
    mapped === "Tab" ||
    mapped === "Backspace" ||
    mapped === " " ||
    mapped.startsWith("Arrow") ||
    mapped.startsWith("Numpad")
  ) {
    e.preventDefault();
  }

  triggerKey(mapped, { velocity, eventTime: now });
}

function handleKeyRelease(code, eventTime = null) {
  if (!code || !keyOrder.includes(code)) return;
  const ts =
    Number.isFinite(eventTime) && eventTime >= 0
      ? eventTime
      : typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  recordingService.recordKeyRelease(code, { eventTime: ts });
  audioService?.stopHeldNote(code);
}

function handleKeyup(e) {
  const mapped = normalizeEventToCode(e);
  if (!mapped) return;
  handleKeyRelease(mapped);
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

function handleExportClick() {
  openExportModal();
}

function handleImportClick() {
  if (importFileInput) {
    importFileInput.click();
  }
}

function handleImportFileChange(e) {
  const input = e?.target || importFileInput;
  if (!input || !input.files || !input.files[0]) return;

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      importSongPack(data);
    } catch (err) {
      console.error("Failed to import songs", err);
    }
    input.value = "";
  };
  reader.readAsText(file);
}

function handleSaveTypedClick() {
  const state = getState();
  const playSeq = state.typedCodeSequence.slice();
  const timed = state.recordedEvents.slice();
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
    timedEvents: timed,
    settings: getCurrentSettingsSnapshot(),
  });

  setSavedRecordings([...recordings, entry]);

  resetTypedText();
  nowPlayingChars = nowPlayingView.setLabel("");
  updateControls();
}

function handleSavedGridClick(e) {
  const selectToggle = e.target.closest(".saved-card-select");
  if (selectToggle) {
    e.stopPropagation();
    const card = selectToggle.closest(".saved-card");
    if (card) {
      card.classList.toggle("selected", selectToggle.checked);
    }
    return;
  }

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

  const applySettingsBtn = e.target.closest(".saved-card-apply-settings");
  if (applySettingsBtn) {
    const card = applySettingsBtn.closest(".saved-card");
    if (!card) return;
    const id = card.dataset.id;
    const recordings = getSavedRecordings();
    const entry = recordings.find((r) => r.id === id);
    if (!entry) return;

    const nextSettings = getCurrentSettingsSnapshot();
    updateRecording(id, (rec) => ({ ...rec, settings: nextSettings }));
    clearSettingsDirty(id);

    if (getState().isPlayingBack && getState().playback.id === id) {
      const updatedEntry = getSavedRecordings().find((r) => r.id === id);
      if (updatedEntry) restartPlaybackFromEntry(updatedEntry, { preserveTyped: true });
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
    clearSettingsDirty(id);
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
  // If funkify/compose is enabled, honor that first (timed events are ignored in this mode).
  if (entry.compose) {
    const seq = entry.playSequence.slice();
    if (!seq.length) return seq;
    const song = composeFromText(seq, {
      meter: "4/4",
      restBetweenWords: 3,
      wordContour: "arch",
      maxSpan: 4,
    });
    return flattenEventsToStepCodes(song);
  }

  // Otherwise, prefer high-fidelity timed playback when available.
  if (Array.isArray(entry.timedEvents) && entry.timedEvents.length) {
    return entry.timedEvents.map((ev) => ({
      code: ev.code,
      offsetMs: Math.max(0, Number(ev.offsetMs) || 0),
      ...(Number.isFinite(ev.velocity) ? { velocity: Number(ev.velocity) } : {}),
      ...(Number.isFinite(ev.durationMs) ? { durationMs: Number(ev.durationMs) } : {}),
      ...(entry.settings ? { settings: entry.settings } : {}),
    }));
  }

  // Fallback: original fixed-step sequence.
  return entry.playSequence.slice();
}

function startPlaybackFromEntry(entry, { preserveTyped = false } = {}) {
  const seq = buildPlaybackSequence(entry);
  if (!seq.length) return;
  if (!preserveTyped) {
    resetTypedText();
  }
  audioService?.ensureToneReady?.();
  handleFirstInteraction();
  clearSettingsDirty(entry.id);
  if (entry.settings) {
    applyPlaybackSettings(entry.settings);
  }
  playbackService.play({
    sequence: seq,
    label: entry.name,
    id: entry.id,
    reversed: !!entry.reverse,
    settings: entry.settings || getCurrentSettingsSnapshot(),
  });
}

function restartPlaybackFromEntry(entry, opts = {}) {
  startPlaybackFromEntry(entry, opts);
}

function stopPlayback() {
  playbackService.stop();
  audioService?.stopAllHeldNotes?.();
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
  const timed = getState().recordedEvents.slice();
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
    timedEvents: timed,
    settings: getCurrentSettingsSnapshot(),
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

function updateTypedTextForUserKey(code, meta = {}) {
  recordingService.appendTyped(code, meta);
  syncTypedDisplay();
  updateControls();
}

function syncTypedDisplay() {
  if (!typedTextView) return;
  const state = getState();
  if (state?.isPlayingBack) return;
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

// --- Hue remapping per theme (e.g., Winter Chill blue-only gradient) ---
function mapHue(hue) {
  if (isNaN(hue)) return hue;
  const { hueShift, hueBase, hueRange } = keyColorSettings;
  const shifted = (hue + hueShift + 360) % 360;
  const base = ((hueBase || 0) % 360 + 360) % 360;
  const rangeRaw = Number.isFinite(hueRange) ? hueRange : 360;
  const range = Math.min(360, Math.max(1, rangeRaw || 360));
  // If everything is at defaults, skip remapping to avoid altering other themes.
  if (hueShift === 0 && base === 0 && Math.abs(range - 360) < 0.001) {
    return hue;
  }
  return (base + (shifted / 360) * range) % 360;
}

function getBaseKeyColor(hue) {
  const { saturation, lightness } = keyColorSettings;
  const h = mapHue(hue);
  return isNaN(h) ? "var(--key)" : `hsl(${h}, ${saturation}%, ${lightness}%)`;
}

function getBaseKeyBorder(hue) {
  const { borderSaturation, borderLightness } = keyColorSettings;
  const h = mapHue(hue);
  return isNaN(h)
    ? "var(--key-border)"
    : `hsl(${h}, ${borderSaturation}%, ${borderLightness}%)`;
}

function getToneColor(hue) {
  const { toneSaturation, toneLightness } = keyColorSettings;
  const h = mapHue(hue);
  return isNaN(h)
    ? `hsl(0, ${toneSaturation}%, ${toneLightness}%)`
    : `hsl(${h}, ${toneSaturation}%, ${toneLightness}%)`;
}

function getPadBaseColor(hue) {
  return getBaseKeyColor(hue);
}

function getPadBorderColor(hue) {
  return getBaseKeyBorder(hue);
}

function getActiveKeyColor(hue) {
  const { activeSaturation, activeLightness } = keyColorSettings;
  const h = mapHue(hue);
  return isNaN(h)
    ? "var(--key)"
    : `hsl(${h}, ${activeSaturation}%, ${activeLightness}%)`;
}

function getActivePadColor(hue) {
  return getActiveKeyColor(hue);
}

function getBaseColorForEl(el, hue) {
  if (el?.classList?.contains("pad-cell")) {
    return getPadBaseColor(hue);
  }
  return getBaseKeyColor(hue);
}

function getBorderColorForEl(el, hue) {
  if (el?.classList?.contains("pad-cell")) {
    return getPadBorderColor(hue);
  }
  return getBaseKeyBorder(hue);
}

function getActiveColorForEl(el, hue) {
  if (el?.classList?.contains("pad-cell")) {
    return getActivePadColor(hue);
  }
  return getActiveKeyColor(hue);
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
      el.style.backgroundColor = getBaseColorForEl(el, hue);
      el.style.borderColor = getBorderColorForEl(el, hue);
    });
  });
}

function resetPadElement(el) {
  if (!el) return;
  el.classList.remove("active", "pad-cell--active", "pad-cell--held");
  const h = parseFloat(el.dataset.hue);
  el.style.backgroundColor = getBaseColorForEl(el, h);
  el.style.borderColor = getBorderColorForEl(el, h);
  el.style.transform = "";
  el.style.filter = "";
}

function setKeyboardShadowHue(hue) {
  if (!keyboardEls.length || isNaN(hue)) return;
  const h = mapHue(hue);
  const shadow = `0 8px 32px hsla(${h}, 90%, 55%, 0.75)`;
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
  const {
    degreeOffset = 0,
    velocity = null,
    fromPlayback = false,
    durationMs = null,
    noteId = null,
  } = opts;
  const isTone = audioService?.getAudioMode?.() === "tone";
  if (fromPlayback && isTone) {
    audioService.ensureToneReady?.();
    audioService.ensureUnlocked?.();
  }
  const freq = getFrequencyForCode(code, degreeOffset);
  if (!freq || !audioService) return;
  const id = noteId || code;
  if (fromPlayback) {
    const hold = Number.isFinite(durationMs) ? durationMs : null;
    // Use one-shot playback for reliable output in both engines.
    audioService.playFrequency(freq, velocity, hold);
    return;
  }
  audioService.startHeldNote(freq, velocity, id);
}

function flashKey(code, { isEcho = false, velocity = null } = {}) {
  const els = keyElements[code];
  if (!els || !els.length) return;

  const hue = parseFloat(els[0].dataset.hue);
  const hueForShadow = isNaN(hue) ? null : hue;

  if (!isNaN(hueForShadow)) {
    setKeyboardShadowHue(hueForShadow);
  }

  const vel = Number.isFinite(velocity) ? velocity : 1;
  const scaleAmt = 1 + Math.min(0.2, Math.max(0, (vel - 0.3) * 0.25));
  const brightAmt = 1 + Math.min(0.25, Math.max(0, (vel - 0.3) * 0.35));

  els.forEach((el) => {
    const elHue = parseFloat(el.dataset.hue);
    const activeBg = getActiveColorForEl(el, elHue);
    el.classList.add("active");
    if (el.classList.contains("pad-cell")) {
      el.classList.add("pad-cell--active");
    }
    el.style.backgroundColor = activeBg;
    el.style.transform = `scale(${scaleAmt})`;
    el.style.filter = `brightness(${brightAmt})`;
  });

  // Use the existing particle system, but let it know if this is an echo hit
  spawnNoteParticleForKey(code, { isEcho });

  setTimeout(() => {
    els.forEach((el) => {
      if (el.dataset.padHeld === "1") {
        return;
      }
      el.classList.remove("active");
      if (el.classList.contains("pad-cell")) {
        el.classList.remove("pad-cell--active");
      }
      const h = parseFloat(el.dataset.hue);
      el.style.backgroundColor = getBaseColorForEl(el, h);
      el.style.borderColor = getBorderColorForEl(el, h);
      el.style.transform = "";
      el.style.filter = "";
    });
    resetKeyboardShadow();
  }, 140);
}

function parseCodeToken(rawCode) {
  const out = {
    code: rawCode && typeof rawCode === "object" ? rawCode.code : rawCode,
    isEcho: false,
    degreeOffset: 0,
  };

  if (rawCode === "__REST__") return out;
  if (rawCode && typeof rawCode === "object") {
    if (Number.isFinite(rawCode.degreeOffset)) out.degreeOffset = rawCode.degreeOffset;
    if (rawCode.echo) out.isEcho = true;
  }
  if (typeof out.code !== "string") return out;

  if (out.code.includes(":")) {
    const parts = out.code.split(":");
    out.code = parts[parts.length - 1];
    const tags = parts.slice(0, parts.length - 1);

    tags.forEach((tag) => {
      if (tag === "ECHO") {
        out.isEcho = true;
      } else if (tag.startsWith("B")) {
        const n = parseInt(tag.slice(1), 10);
        if (Number.isFinite(n)) out.degreeOffset = n;
      }
    });
  }

  return out;
}

function triggerKey(
  rawCode,
  {
    fromPlayback = false,
    velocity = null,
    eventTime = null,
    durationMs = null,
    noteId = null,
  } = {}
) {
  const parsed = parseCodeToken(rawCode);
  const code = parsed.code;

  // REST tokens from the composer: advance time but do nothing visually
  if (!code || code === "__REST__") {
    return;
  }

  // Allow recorded codes and the explicit space character
  if (!keyOrder.includes(code) && code !== " ") {
    return;
  }

  if (!fromPlayback) {
    // Live typing / recording:
    // - store the real code in recordedSequence
    // - update Spell a Song text (which maps action keys -> spaces)
    recordingService.recordKey(code, { velocity, eventTime });
    updateTypedTextForUserKey(code, { velocity, eventTime });
  }

  // Playback:
  // - action keys light up their own key
  // - space (" ") lights the spacebar
  // - echo hits can walk the bass (degreeOffset) and get special visuals
  playTone(code, {
    degreeOffset: parsed.degreeOffset,
    velocity,
    fromPlayback,
    durationMs,
    noteId,
  });
  flashKey(code, { isEcho: parsed.isEcho, velocity });
}

function applyPlaybackCardHighlight() {
  savedGridView?.highlight(getState().playback.id);
}

function exportSongs(selectedIds = null) {
  const recordings = getSavedRecordings();
  if (!Array.isArray(recordings) || !recordings.length) return;

  const idSet =
    selectedIds && selectedIds.size
      ? selectedIds
      : new Set(
          Array.from(document.querySelectorAll(".saved-card-select:checked")).map(
            (el) => el.closest(".saved-card")?.dataset.id
          )
        );

  const listToExport =
    idSet.size > 0 ? recordings.filter((r) => idSet.has(r.id)) : recordings;
  if (!listToExport.length) return;

  const payload = {
    version: 1,
    app: "keysonic",
    exportedAt: new Date().toISOString(),
    stepNoteValue: SONG_STEP_NOTE_VALUE,
    recordings: [],
  };

  listToExport.forEach((entry) => {
    const playbackSequence = buildPlaybackSequence(entry);
    const songMeta = buildSongExportFromEntry(entry, playbackSequence);
    payload.recordings.push({
      id: entry.id,
      name: entry.name,
      loop: !!entry.loop,
      reverse: !!entry.reverse,
      compose: !!entry.compose,
      settings: entry.settings || null,
      sequence: Array.isArray(entry.sequence) ? entry.sequence.slice() : [],
      playSequence: Array.isArray(entry.playSequence)
        ? entry.playSequence.slice()
        : Array.isArray(entry.sequence)
        ? entry.sequence.slice()
        : [],
      playbackSequence,
      events: songMeta?.events || [],
      notes:
        songMeta?.events?.map((ev) => ev.note).filter(Boolean) || [],
    });
  });

  const stamp = buildTimestampLabel();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/vnd.keysonic+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keysonic-songs-${stamp}.keysonic`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

function getSelectedExportIds() {
  const ids = new Set();
  if (exportList) {
    exportList.querySelectorAll('input[type="checkbox"]:checked').forEach((el) => {
      if (el.value) ids.add(el.value);
    });
  }
  return ids;
}

function openExportModal() {
  if (!exportModal || !exportList) return;
  const recordings = getSavedRecordings();
  exportList.innerHTML = "";
  if (!recordings.length) {
    const p = document.createElement("p");
    p.textContent = "No saved songs to export.";
    exportList.appendChild(p);
  } else {
    recordings.forEach((rec) => {
      const wrap = document.createElement("label");
      wrap.className = "export-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = rec.id;
      checkbox.checked = false;
      const title = document.createElement("span");
      title.textContent = rec.name || "Recording";
      const meta = document.createElement("small");
      meta.textContent = `${(rec.sequence || []).length} notes`;
      const textWrap = document.createElement("div");
      textWrap.appendChild(title);
      textWrap.appendChild(meta);
      wrap.appendChild(checkbox);
      wrap.appendChild(textWrap);
      exportList.appendChild(wrap);
    });
  }
  updateSelectAllToggle();
  exportModal.classList.remove("hidden");
}

function closeExportModal() {
  if (exportModal) {
    exportModal.classList.add("hidden");
  }
}

function toggleActionMenu(forceClose = false) {
  if (!actionMenuList) return;
  const nextOpen = forceClose ? false : actionMenuList.hidden;
  actionMenuList.hidden = !nextOpen;
  if (actionMenuToggle) {
    actionMenuToggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }
}

function handleSelectAllToggle() {
  const shouldCheck = !!exportSelectAllToggle?.checked;
  const checkboxes = exportList
    ? Array.from(exportList.querySelectorAll('input[type="checkbox"]'))
    : [];
  checkboxes.forEach((cb) => {
    cb.checked = shouldCheck;
  });
}

function updateSelectAllToggle() {
  if (!exportSelectAllToggle) return;
  const boxes = exportList
    ? Array.from(exportList.querySelectorAll('input[type="checkbox"]'))
    : [];
  if (!boxes.length) {
    exportSelectAllToggle.checked = false;
    exportSelectAllToggle.indeterminate = false;
    exportSelectAllToggle.disabled = true;
    return;
  }
  exportSelectAllToggle.disabled = false;
  const checked = boxes.filter((cb) => cb.checked).length;
  exportSelectAllToggle.checked = checked === boxes.length;
  exportSelectAllToggle.indeterminate = checked > 0 && checked < boxes.length;
}

function importSongPack(data) {
  if (!data || typeof data !== "object") return;

  const incoming = Array.isArray(data.recordings) ? data.recordings : [];
  if (!incoming.length) return;

  const existing = getSavedRecordings().slice();
  const next = existing.slice();

  incoming.forEach((raw) => {
    const playSeq =
      Array.isArray(raw.playSequence) && raw.playSequence.length
        ? raw.playSequence
        : Array.isArray(raw.sequence) && raw.sequence.length
        ? raw.sequence
        : [];
    if (!playSeq.length) return;

    const displaySeq =
      Array.isArray(raw.sequence) && raw.sequence.length
        ? raw.sequence
        : recordingRepo.toDisplaySequence(playSeq);
    const timedEvents =
      Array.isArray(raw.timedEvents) && raw.timedEvents.length
        ? raw.timedEvents
        : Array.isArray(raw.playbackSequence) && raw.playbackSequence.length
        ? raw.playbackSequence
        : null;

    const baseName = raw.name || "Recording";
    const name = recordingRepo.makeUniqueName(baseName, next);

    const entry = recordingRepo.createRecording({
      name,
      playSequence: playSeq,
      displaySequence: displaySeq,
      timedEvents: timedEvents || undefined,
      settings: raw.settings || undefined,
    });

    next.push({
      ...entry,
      loop: !!raw.loop,
      reverse: !!raw.reverse,
      compose: !!raw.compose,
    });
  });

  if (next.length !== existing.length) {
    setSavedRecordings(next);
  }
}

function buildTimestampLabel() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
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

  const visibleEls =
    Array.isArray(els) && els.length
      ? els.filter((el) => {
          const r = el?.getBoundingClientRect();
          return r && r.width > 0 && r.height > 0;
        })
      : [];

  const targetEls = visibleEls.length ? visibleEls : els;

  targetEls.forEach((keyEl) => {
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

function buildSongExportFromEntry(entry, playbackSequence) {
  if (!entry) return null;

  const baseSeq =
    Array.isArray(playbackSequence) && playbackSequence.length
      ? playbackSequence
      : buildPlaybackSequence(entry);

  if (!baseSeq.length || typeof getFrequencyForCode !== "function") {
    return null;
  }

  const events = [];

  for (let i = 0; i < baseSeq.length; i++) {
    const rawCode = baseSeq[i];
    const parsed = parseCodeToken(rawCode);
    const code = parsed.code === "Space" ? " " : parsed.code;

    if (!code) continue;

    if (code === "__REST__") {
      events.push({ step: i, type: "rest" });
      continue;
    }

    const freq = getFrequencyForCode(code, parsed.degreeOffset);
    if (!freq || !isFinite(freq) || freq <= 0) {
      continue; // skip non-tonal / invalid
    }

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    if (!isFinite(midi)) continue;

    const name = noteNameFromMidi_Strict(midi);
    if (!name || name === "?T?") continue;

    const ev = {
      step: i, // discrete position (0,1,2,...) at SONG_STEP_NOTE_VALUE each
      code,
      midi,
      note: name, // e.g. "C?T_4" or "B?T-3"
      freq: Number(freq.toFixed(3)),
    };
    if (parsed.degreeOffset) ev.degreeOffset = parsed.degreeOffset;
    if (parsed.isEcho) ev.echo = true;
    if (rawCode && typeof rawCode === "object" && Number.isFinite(rawCode.durationMs)) {
      ev.durationMs = Math.max(0, Math.round(rawCode.durationMs));
    }

    events.push(ev);
  }

  if (!events.length) return null;

  return {
    id: entry.id,
    name: entry.name,
    settings: entry.settings || null,
    key: getScaleContextId() || null,
    tempo: getState().tempo || 1,
    stepNoteValue: SONG_STEP_NOTE_VALUE,
    events,
  };
}

function schedulePlaybackNoteStop(noteId, durationMs) {
  if (!noteId || !Number.isFinite(durationMs)) return;
  const tempo = getState().tempo || 1;
  const delayMs = Math.max(0, durationMs) / (tempo || 1);
  const existing = playbackNoteStopTimers.get(noteId);
  if (existing) clearTimeout(existing);
  const timeoutId = setTimeout(() => {
    playbackNoteStopTimers.delete(noteId);
    audioService?.stopHeldNote(noteId);
  }, delayMs);
  playbackNoteStopTimers.set(noteId, timeoutId);
}

function clearPlaybackNoteTimers({ stopNotes = false } = {}) {
  playbackNoteStopTimers.forEach((timeoutId, noteId) => {
    clearTimeout(timeoutId);
    if (stopNotes) {
      audioService?.stopHeldNote(noteId);
    }
  });
  playbackNoteStopTimers.clear();
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
