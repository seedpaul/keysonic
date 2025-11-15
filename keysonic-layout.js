export function getDomRefs() {
  const titleEl = document.getElementById("word-music-title");
  const wmControls = document.getElementById("wm-controls");
  const mainRowsContainer = document.getElementById("keyboard-main-rows");
  const numpadContainer = document.getElementById("keyboard-numpad");
  const typedTextEl = document.getElementById("typed-text");
  const nowPlayingEl = document.getElementById("now-playing");
  const savedGridEl = document.getElementById("wm-saved-grid");

  const recordBtn =
    wmControls?.querySelector('button[data-action="record"]') || null;
  const stopBtn =
    wmControls?.querySelector('button[data-action="stop"]') || null;
  const clearBtn =
    wmControls?.querySelector('button[data-action="clear"]') || null;

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
    saveTypedBtn,
  };
}

export function buildKeyboards({
  layoutMain,
  layoutNumpadGrid,
  mainRowsContainer,
  numpadContainer,
  getHueForCode,
  onKeyPress,
}) {
  const keyElements = {};

  // ----- Main keyboard -----
  if (mainRowsContainer) {
    mainRowsContainer.innerHTML = "";

    layoutMain.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "row";

      row.forEach((k) => {
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

        keyEl.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          onKeyPress(k.code);
        });
        keyEl.addEventListener(
          "touchstart",
          (ev) => {
            ev.preventDefault();
            onKeyPress(k.code);
          },
          { passive: false }
        );

        if (!keyElements[k.code]) keyElements[k.code] = [];
        keyElements[k.code].push(keyEl);

        rowEl.appendChild(keyEl);
      });

      mainRowsContainer.appendChild(rowEl);
    });
  }

  // ----- Numpad -----
  if (numpadContainer) {
    const wrapper = numpadContainer.closest(".keyboard-wrapper") || null;

    // Create the +/- toggle once, attached to the wrapper
    if (wrapper && !wrapper.querySelector(".numpad-toggle")) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "numpad-toggle";
      toggle.setAttribute("aria-label", "Toggle number pad visibility");
      toggle.textContent = wrapper.classList.contains("numpad-collapsed")
        ? "➕"
        : "➖";

      wrapper.appendChild(toggle);

      toggle.addEventListener("click", () => {
        const collapsed = wrapper.classList.toggle("numpad-collapsed");
        toggle.textContent = collapsed ? "➕" : "➖";
      });
    }

    // Rebuild numpad keys
    numpadContainer.innerHTML = "";

    layoutNumpadGrid.forEach((k) => {
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

      keyEl.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        onKeyPress(k.code);
      });
      keyEl.addEventListener(
        "touchstart",
        (ev) => {
          ev.preventDefault();
          onKeyPress(k.code);
        },
        { passive: false }
      );

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

export function renderSavedGrid(container, recordings) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(recordings) || recordings.length === 0) {
    return;
  }

  recordings.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "saved-card";
    card.dataset.id = entry.id;

    if (entry.loop) {
      card.classList.add("looping");
    }
    if (entry.reverse) {
      card.classList.add("reversed");
    }
    if (entry.compose) {
      card.classList.add("composed");
    }

    const title = document.createElement("div");
    title.className = "saved-card-title";
    title.textContent = entry.name || "";

    const meta = document.createElement("div");
    meta.className = "saved-card-meta";
    const noteCount = Array.isArray(entry.sequence) ? entry.sequence.length : 0;
    meta.textContent = `${noteCount} note${noteCount === 1 ? "" : "s"}`;

    const playIndicator = document.createElement("div");
    playIndicator.className = "saved-card-play-indicator";

    const actions = document.createElement("div");
    actions.className = "saved-card-actions";

    const loopBtn = document.createElement("button");
    loopBtn.type = "button";
    loopBtn.className = "saved-card-loop-toggle";
    loopBtn.title = "Loop this song";
    loopBtn.style.fontSize = "0.9em";
    loopBtn.textContent = "⟳";

    const reverseBtn = document.createElement("button");
    reverseBtn.type = "button";
    reverseBtn.className = "saved-card-reverse-toggle";
    reverseBtn.title = "Play this song backwards";
    reverseBtn.style.fontSize = "0.9em";
    reverseBtn.textContent = "↺";

    const composeBtn = document.createElement("button");
    composeBtn.type = "button";
    composeBtn.className = "saved-card-compose-toggle";
    composeBtn.title = "Funkified";
    composeBtn.style.fontSize = "0.8em";
    composeBtn.textContent = "🔥";
    composeBtn.setAttribute("aria-pressed", entry.compose ? "true" : "false");

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "saved-card-delete";
    delBtn.title = "Delete this song";
    delBtn.style.fontSize = "1.2em";
    delBtn.textContent = "⏏";

    actions.appendChild(loopBtn);
    actions.appendChild(reverseBtn);
    actions.appendChild(composeBtn);
    actions.appendChild(delBtn);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(playIndicator);
    card.appendChild(actions);

    container.appendChild(card);
  });
}
