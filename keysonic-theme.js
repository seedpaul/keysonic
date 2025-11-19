const THEME_PREF_KEY = "keysonic-theme-pref-v1";

const THEMES = [
  {
    id: "daylight",
    label: "Daylight Pop",
    values: {
      "--bg": "#f8fafc",
      "--body-bg-image":
        "linear-gradient(rgba(255,255,255,0.02), rgba(255,255,255,0.02)), url(\"assets/cartoon-style-musical-notes-background.jpg\")",
      "--panel": "rgba(255, 255, 255, 0.96)",
      "--panel-strong": "#ffffff",
      "--panel-shadow": "0 1px 4px rgba(15, 23, 42, 0.12)",
      "--panel-shadow-strong": "0 2px 6px rgba(15, 23, 42, 0.16)",
      "--border": "#d1d5db",
      "--border-soft": "#cbd5e1",
      "--text": "#111827",
      "--muted-text": "#6b7280",
      "--muted-strong": "#475569",
      "--control-bg": "rgba(255, 255, 255, 0.96)",
      "--control-border": "#cbd5e1",
      "--control-text": "#111827",
      "--control-hover-bg": "#e0f2fe",
      "--control-hover-border": "#7dd3fc",
      "--key": "#e5e7eb",
      "--key-border": "#cbd5e1",
      "--accent": "#f97316",
      "--accent-strong": "#ea580c",
      "--danger-bg": "#fee2e2",
      "--danger-border": "#f97316",
      "--danger-text": "#b91c1c",
    },
  },
  {
    id: "midnight",
    label: "Midnight Neon",
    values: {
      "--bg": "#030712",
      "--body-bg-image":
        "linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.95)), url(\"assets/spooky4.jpg\")",
      "--panel": "rgba(3, 7, 18, 0.86)",
      "--panel-strong": "rgba(15, 23, 42, 0.88)",
      "--panel-shadow": "0 8px 22px rgba(2, 6, 23, 0.85)",
      "--panel-shadow-strong": "0 12px 28px rgba(2, 6, 23, 0.9)",
      "--border": "rgba(56, 189, 248, 0.35)",
      "--border-soft": "rgba(56, 189, 248, 0.55)",
      "--text": "#f8fafc",
      "--muted-text": "#cbd5f5",
      "--muted-strong": "#e0e7ff",
      "--control-bg": "rgba(2, 6, 23, 0.85)",
      "--control-border": "rgba(56, 189, 248, 0.45)",
      "--control-text": "#f8fafc",
      "--control-hover-bg": "rgba(59, 130, 246, 0.25)",
      "--control-hover-border": "#38bdf8",
      "--key": "rgba(15, 23, 42, 0.95)",
      "--key-border": "rgba(148, 163, 184, 0.65)",
      "--accent": "#38bdf8",
      "--accent-strong": "#0ea5e9",
      "--danger-bg": "rgba(127, 29, 29, 0.7)",
      "--danger-border": "#f87171",
      "--danger-text": "#fecaca",
    },
  },
  {
    id: "aurora",
    label: "Aurora Mist",
    values: {
      "--bg": "#0f172a",
      "--body-bg-image":
        "linear-gradient(rgba(79,70,229,0.5), rgba(14,165,233,0.35)), url(\"assets/anime-style-clouds.jpg\")",
      "--panel": "rgba(15, 23, 42, 0.72)",
      "--panel-strong": "rgba(30, 41, 59, 0.85)",
      "--panel-shadow": "0 8px 20px rgba(15, 23, 42, 0.5)",
      "--panel-shadow-strong": "0 12px 28px rgba(15, 23, 42, 0.65)",
      "--border": "rgba(226, 232, 240, 0.35)",
      "--border-soft": "rgba(226, 232, 240, 0.45)",
      "--text": "#f8fafc",
      "--muted-text": "#e2e8f0",
      "--muted-strong": "#f8fafc",
      "--control-bg": "rgba(15, 23, 42, 0.78)",
      "--control-border": "rgba(226, 232, 240, 0.45)",
      "--control-text": "#f8fafc",
      "--control-hover-bg": "rgba(248, 250, 252, 0.12)",
      "--control-hover-border": "#f0abfc",
      "--key": "rgba(148, 163, 184, 0.4)",
      "--key-border": "rgba(226, 232, 240, 0.45)",
      "--accent": "#f0abfc",
      "--accent-strong": "#c084fc",
      "--danger-bg": "rgba(244, 114, 182, 0.25)",
      "--danger-border": "#f472b6",
      "--danger-text": "#ffe4e6",
    },
  },
];

function getThemeById(id) {
  return THEMES.find((theme) => theme.id === id) || null;
}

export function getThemeOptions() {
  return THEMES.map(({ id, label }) => ({ id, label }));
}

export function applyTheme(themeId) {
  const fallback = THEMES[0];
  const theme = getThemeById(themeId) || fallback;
  const root = document.documentElement;
  if (!root) return theme.id;

  Object.entries(theme.values).forEach(([cssVar, value]) => {
    root.style.setProperty(cssVar, value);
  });

  if (document.body) {
    document.body.setAttribute("data-theme", theme.id);
  }

  try {
    localStorage.setItem(THEME_PREF_KEY, theme.id);
  } catch (err) {
    // ignore storage errors (e.g., Safari private mode)
  }

  return theme.id;
}

export function initTheme() {
  let savedId;
  try {
    savedId = localStorage.getItem(THEME_PREF_KEY);
  } catch (err) {
    savedId = undefined;
  }
  return applyTheme(savedId);
}
