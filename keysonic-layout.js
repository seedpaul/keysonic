// keysonic-layout.js

export function getDomRefs() {
  const titleEl = document.getElementById('word-music-title');
  const wmControls = document.getElementById('wm-controls');
  const mainRowsContainer = document.getElementById('keyboard-main-rows');
  const numpadContainer = document.getElementById('keyboard-numpad');
  const typedTextEl = document.getElementById('typed-text');
  const nowPlayingEl = document.getElementById('now-playing');
  const savedGridEl = document.getElementById('wm-saved-grid');

  const recordBtn = wmControls?.querySelector('button[data-action="record"]') || null;
  const stopBtn = wmControls?.querySelector('button[data-action="stop"]') || null;
  const clearBtn = wmControls?.querySelector('button[data-action="clear"]') || null;

  const saveTypedBtn = document.getElementById('save-typed-btn');

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

export class KeyboardView {
  constructor({
    layoutMain,
    layoutNumpadGrid,
    mainRowsContainer,
    numpadContainer,
    getHueForCode,
    onKeyPress,
  }) {
    this.layoutMain = layoutMain;
    this.layoutNumpadGrid = layoutNumpadGrid;
    this.mainRowsContainer = mainRowsContainer;
    this.numpadContainer = numpadContainer;
    this.getHueForCode = getHueForCode;
    this.onKeyPress = onKeyPress;
    this.keyElements = {};
    this.keyboardEls = [];
  }

  mount() {
    this.#buildMainKeyboard();
    this.#buildNumpad();
    const keyboardEls = [];
    const mainKeyboardEl = this.mainRowsContainer?.closest('.keyboard');
    if (mainKeyboardEl) keyboardEls.push(mainKeyboardEl);
    if (this.numpadContainer) keyboardEls.push(this.numpadContainer);
    this.keyboardEls = keyboardEls;
    return { keyElements: this.keyElements, keyboardEls };
  }

  #buildMainKeyboard() {
    if (!this.mainRowsContainer) return;
    this.mainRowsContainer.innerHTML = '';
    this.layoutMain.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      row.forEach((k) => {
        const keyEl = document.createElement('div');
        keyEl.classList.add('key');
        if (k.small) keyEl.classList.add('label-small');
        if (k.space) keyEl.classList.add('space');
        keyEl.textContent = k.label;
        if (k.span) keyEl.style.flex = String(k.span);
        const hue = this.getHueForCode(String(k.code));
        keyEl.dataset.code = k.code;
        keyEl.dataset.hue = String(hue);
        keyEl.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          this.onKeyPress(k.code);
        });
        keyEl.addEventListener(
          'touchstart',
          (ev) => {
            ev.preventDefault();
            this.onKeyPress(k.code);
          },
          { passive: false },
        );
        if (!this.keyElements[k.code]) this.keyElements[k.code] = [];
        this.keyElements[k.code].push(keyEl);
        rowEl.appendChild(keyEl);
      });
      this.mainRowsContainer.appendChild(rowEl);
    });
  }

  #buildNumpad() {
    if (!this.numpadContainer) return;
    const wrapper = this.numpadContainer.closest('.keyboard-wrapper') || null;
    if (wrapper && !wrapper.querySelector('.numpad-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'numpad-toggle';
      toggle.setAttribute('aria-label', 'Toggle number pad visibility');
      toggle.textContent = wrapper.classList.contains('numpad-collapsed') ? '➕' : '➖';
      wrapper.appendChild(toggle);
      toggle.addEventListener('click', () => {
        const collapsed = wrapper.classList.toggle('numpad-collapsed');
        toggle.textContent = collapsed ? '➕' : '➖';
      });
    }
    this.numpadContainer.innerHTML = '';
    this.layoutNumpadGrid.forEach((k) => {
      const keyEl = document.createElement('div');
      keyEl.classList.add('key');
      if (k.small) keyEl.classList.add('label-small');
      keyEl.textContent = k.label;
      keyEl.style.gridRow = String(k.r);
      keyEl.style.gridColumn = String(k.c);
      if (k.rowSpan) keyEl.style.gridRowEnd = `span ${k.rowSpan}`;
      if (k.colSpan) keyEl.style.gridColumnEnd = `span ${k.colSpan}`;
      const hue = this.getHueForCode(String(k.code));
      keyEl.dataset.code = k.code;
      keyEl.dataset.hue = String(hue);
      keyEl.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.onKeyPress(k.code);
      });
      keyEl.addEventListener(
        'touchstart',
        (ev) => {
          ev.preventDefault();
          this.onKeyPress(k.code);
        },
        { passive: false },
      );
      if (!this.keyElements[k.code]) this.keyElements[k.code] = [];
      this.keyElements[k.code].push(keyEl);
      this.numpadContainer.appendChild(keyEl);
    });
  }
}

export class NowPlayingView {
  constructor(el) {
    this.el = el;
    this.chars = [];
  }

  setLabel(label) {
    if (!this.el) return [];
    const text = (label || '').trim();
    this.el.innerHTML = '';
    if (!text) {
      document.body.classList.remove('has-now-playing');
      this.chars = [];
      return this.chars;
    }
    document.body.classList.add('has-now-playing');
    const wrapper = document.createElement('span');
    wrapper.className = 'now-playing-word';
    const spans = [];
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'now-playing-char';
      span.textContent = ch;
      wrapper.appendChild(span);
      spans.push(span);
    }
    this.el.appendChild(wrapper);
    this.chars = spans;
    return spans;
  }

  tint(sequence, getHueForCode) {
    if (!this.chars?.length || !sequence?.length) return;
    this.chars.forEach((span, idx) => {
      const code = sequence[idx % sequence.length];
      const hue = getHueForCode(code);
      if (!isNaN(hue)) {
        span.style.color = `hsl(${hue}, 90%, 55%)`;
      }
      span.style.transform = '';
      span.style.fontWeight = '600';
    });
  }

  highlight(index) {
    if (!this.chars?.length) return;
    this.chars.forEach((span, idx) => {
      if (idx === index) {
        span.style.transform = 'translateY(-1px) scale(1.25)';
        span.style.fontWeight = '800';
      } else {
        span.style.transform = '';
        span.style.fontWeight = '600';
      }
    });
  }
}

export class SavedGridView {
  constructor(container) {
    this.container = container;
  }

  render(recordings = []) {
    if (!this.container) return;
    this.container.innerHTML = '';
    if (!Array.isArray(recordings) || !recordings.length) return;
    recordings.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      card.dataset.id = entry.id;
      if (entry.loop) card.classList.add('looping');
      if (entry.reverse) card.classList.add('reversed');
      if (entry.compose) card.classList.add('composed');
      const title = document.createElement('div');
      title.className = 'saved-card-title';
      title.textContent = entry.name || '';
      const meta = document.createElement('div');
      meta.className = 'saved-card-meta';
      const noteCount = Array.isArray(entry.sequence) ? entry.sequence.length : 0;
      meta.textContent = `${noteCount} note${noteCount === 1 ? '' : 's'}`;
      const playIndicator = document.createElement('div');
      playIndicator.className = 'saved-card-play-indicator';
      const actions = document.createElement('div');
      actions.className = 'saved-card-actions';
      const loopBtn = this.#buildButton('saved-card-loop-toggle', 'Loop this song', '⟳');
      loopBtn.style.fontSize = '0.9em';
      const reverseBtn = this.#buildButton(
        'saved-card-reverse-toggle',
        'Play this song backwards',
        '↺',
      );
      reverseBtn.style.fontSize = '0.9em';
      const composeBtn = this.#buildButton('saved-card-compose-toggle', 'Funkified', '🔥');
      composeBtn.style.fontSize = '0.8em';
      composeBtn.setAttribute('aria-pressed', entry.compose ? 'true' : 'false');
      const delBtn = this.#buildButton('saved-card-delete', 'Delete this song', '⏏');
      delBtn.style.fontSize = '1.2em';
      actions.append(loopBtn, reverseBtn, composeBtn, delBtn);
      card.append(title, meta, playIndicator, actions);
      this.container.appendChild(card);
    });
  }

  #buildButton(cls, title, text) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.title = title;
    btn.textContent = text;
    return btn;
  }

  highlight(playbackId) {
    if (!this.container) return;
    const cards = this.container.querySelectorAll('.saved-card');
    cards.forEach((card) => {
      const id = card.dataset.id;
      card.classList.toggle('playing', !!playbackId && id === playbackId);
    });
  }

  applyTitleColors(recordings, getHueForCode) {
    if (!this.container || !Array.isArray(recordings)) return;
    const cards = this.container.querySelectorAll('.saved-card');
    cards.forEach((card) => {
      const id = card.dataset.id;
      const entry = recordings.find((r) => r.id === id);
      if (!entry) return;
      const titleEl = card.querySelector('.saved-card-title');
      if (!titleEl) return;
      const seq = Array.isArray(entry.playSequence)
        ? entry.playSequence
        : Array.isArray(entry.sequence)
        ? entry.sequence
        : [];
      titleEl.innerHTML = '';
      const name = entry.name || '';
      for (const [index, ch] of [...name].entries()) {
        const span = document.createElement('span');
        span.textContent = ch;
        const code = seq.length ? seq[index % seq.length] : ch.toUpperCase();
        const hue = getHueForCode(code);
        if (!isNaN(hue) && ch.trim() !== '') {
          span.style.color = `hsl(${hue}, 90%, 55%)`;
        }
        titleEl.appendChild(span);
      }
    });
  }
}

export class TypedTextView {
  constructor(el) {
    this.el = el;
  }

  render(text, sequence, getHueForCode) {
    if (!this.el) return;
    this.el.innerHTML = '';
    if (!text) return;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const span = document.createElement('span');
      span.textContent = ch;
      if (ch.trim() !== '') {
        const code = Array.isArray(sequence) ? sequence[i] || ch.toUpperCase() : ch.toUpperCase();
        const hue = getHueForCode(code);
        if (!isNaN(hue)) {
          span.style.color = `hsl(${hue}, 90%, 55%)`;
        }
      }
      this.el.appendChild(span);
    }
  }

  clear() {
    if (this.el) {
      this.el.textContent = '';
      this.el.innerHTML = '';
    }
  }
}

