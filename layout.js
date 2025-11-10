// layout.js

export function getDomRefs() {
  const titleEl = document.getElementById("word-music-title");
  const wmControls = document.getElementById("wm-controls");
  const mainRowsContainer = document.getElementById("keyboard-main-rows");
  const numpadContainer = document.getElementById("keyboard-numpad");
  const typedTextEl = document.getElementById("typed-text");
  const nowPlayingEl = document.getElementById("now-playing");
  const savedGridEl = document.getElementById("wm-saved-grid");

  const recordBtn = wmControls?.querySelector('button[data-action="record"]') || null;
  const stopBtn   = wmControls?.querySelector('button[data-action="stop"]') || null;
  const clearBtn  = wmControls?.querySelector('button[data-action="clear"]') || null;

  const saveTypedBtn = document.getElementById("save-typed-btn");

  return {
    titleEl,
    wmControls,
    mainRowsContainer,
    numpadContainer,
    typedTextEl,
    nowPlayingEl,
    savedGridEl,
    recordBtn,
    stopBtn,
    clearBtn,
    saveTypedBtn
  };
}

/**
 * Build keyboards and return:
 *  - keyElements: { code: [elements] }
 *  - keyboardEls: [mainKeyboardEl, numpadEl]
 */
export function buildKeyboards({
  layoutMain,
  layoutNumpadGrid,
  mainRowsContainer,
  numpadContainer,
  getHueForCode,
  onKeyPress
}) {
  const keyElements = {};

  // ----- Main keyboard -----
  if (mainRowsContainer) {
    mainRowsContainer.innerHTML = "";

    layoutMain.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.className = "row";

      row.forEach(k => {
        const keyEl = document.createElement("div");
        keyEl.classList.add("key");
        if (k.small) keyEl.classList.add("label-small");
        if (k.space) keyEl.classList.add("space");

        keyEl.textContent = k.label;

        if (k.span) {
          keyEl.style.flex = String(k.span);
        }

        const hue = getHueForCode(String(k.code));
        keyEl.dataset.code = k.code;
        keyEl.dataset.hue = String(hue);

        keyEl.addEventListener("mousedown", ev => {
          ev.preventDefault();
          onKeyPress(k.code);
        });
        keyEl.addEventListener("touchstart", ev => {
          ev.preventDefault();
          onKeyPress(k.code);
        }, { passive: false });

        if (!keyElements[k.code]) keyElements[k.code] = [];
        keyElements[k.code].push(keyEl);

        rowEl.appendChild(keyEl);
      });

      mainRowsContainer.appendChild(rowEl);
    });
  }

  // ----- Numpad -----
  if (numpadContainer) {
    numpadContainer.innerHTML = "";

    layoutNumpadGrid.forEach(k => {
      const keyEl = document.createElement("div");
      keyEl.classList.add("key");
      if (k.small) keyEl.classList.add("label-small");

      keyEl.textContent = k.label;

      keyEl.style.gridRow = String(k.r);
      keyEl.style.gridColumn = String(k.c);
      if (k.rowSpan) keyEl.style.gridRowEnd = `span ${k.rowSpan}`;
      if (k.colSpan) keyEl.style.gridColumnEnd = `span ${k.colSpan}`;

      const hue = getHueForCode(String(k.code));
      keyEl.dataset.code = k.code;
      keyEl.dataset.hue = String(hue);

      keyEl.addEventListener("mousedown", ev => {
        ev.preventDefault();
        onKeyPress(k.code);
      });
      keyEl.addEventListener("touchstart", ev => {
        ev.preventDefault();
        onKeyPress(k.code);
      }, { passive: false });

      if (!keyElements[k.code]) keyElements[k.code] = [];
      keyElements[k.code].push(keyEl);

      numpadContainer.appendChild(keyEl);
    });
  }

  const keyboardEls = [];
  const mainKeyboardEl = mainRowsContainer?.closest(".keyboard");
  if (mainKeyboardEl) keyboardEls.push(mainKeyboardEl);
  if (numpadContainer) keyboardEls.push(numpadContainer);

  return { keyElements, keyboardEls };
}

/**
 * Set "Now Playing" label text and spans.
 * Returns array of span elements for later highlighting.
 */
export function setNowPlaying(nowPlayingEl, label) {
  if (!nowPlayingEl) return [];

  const body = document.body;
  const text = (label || "").trim();

  nowPlayingEl.innerHTML = "";

  if (!text) {
    body.classList.remove("has-now-playing");
    return [];
  }

  body.classList.add("has-now-playing");

  const wrapper = document.createElement("span");
  wrapper.className = "now-playing-word";

  const spans = [];
  for (const ch of text) {
    const span = document.createElement("span");
    span.className = "now-playing-char";
    span.textContent = ch;
    wrapper.appendChild(span);
    spans.push(span);
  }

  nowPlayingEl.appendChild(wrapper);
  return spans;
}

/**
 * Render saved recordings grid.
 * Each entry: { id, name, sequence }
 */
export function renderSavedGrid(container, savedRecordings) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(savedRecordings) || savedRecordings.length === 0) {
    return;
  }

  savedRecordings.forEach(entry => {
    const card = document.createElement("div");
    card.className = "saved-card";
    card.dataset.id = entry.id;

    const header = document.createElement("div");
    header.className = "saved-card-header";

    const title = document.createElement("div");
    title.className = "saved-card-title";
    title.textContent = entry.name || "Recording";

    const delBtn = document.createElement("button");
    delBtn.className = "saved-card-delete";
    delBtn.type = "button";
    delBtn.textContent = "×";

    header.appendChild(title);
    header.appendChild(delBtn);

    const meta = document.createElement("div");
    meta.className = "saved-card-meta";
    meta.textContent = `${entry.sequence.length} key(s)`;

    card.appendChild(header);
    card.appendChild(meta);

    container.appendChild(card);
  });
}
