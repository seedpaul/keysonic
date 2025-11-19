// typing-utils.js
const actionAsSpace = new Set([
  'Backspace',
  'Tab',
  'CapsLock',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'NumLock',
  'ScrollLock',
  'Pause',
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Enter',
  'ContextMenu',
  'Fn',
]);

export function mapCodeToCharForTyping(code) {
  if (code === ' ') return ' ';
  if (actionAsSpace.has(code)) return ' ';
  if (code.startsWith('Arrow')) return ' ';

  if (code.startsWith('Numpad')) {
    const suffix = code.slice('Numpad'.length);
    if (/^[0-9]$/.test(suffix)) return suffix;
    if (suffix === 'Decimal') return '.';
    if (suffix === 'Add') return '+';
    if (suffix === 'Subtract') return '-';
    if (suffix === 'Multiply') return '*';
    if (suffix === 'Divide') return '/';
    return ' ';
  }

  if (code.length === 1 && code >= ' ' && code <= '~') {
    return code;
  }

  return null;
}

