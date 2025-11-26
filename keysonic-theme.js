const THEME_PREF_KEY = "keysonic-theme-pref-v1";

const THEMES = [
  {
    id: "daylight",
    label: "Daylight Pop",
    values: {
      "--bg": "#f8fafc",
      "--body-bg-image":
        'linear-gradient(rgba(255,255,255,0.02), rgba(255,255,255,0.02)), url("assets/daylight_pop.png")',
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
      "--key-text": "#0f172a",
      "--key-saturation": 80,
      "--key-lightness": 78,
      "--key-border-saturation": 72,
      "--key-border-lightness": 62,
      "--key-active-saturation": 92,
      "--key-active-lightness": 52,
      "--key-hue-base": 0,
      "--key-hue-range": 320,
      "--key-hue-shift": 8,
      "--tone-saturation": 90,
      "--tone-lightness": 58,
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
      "--bg": "#0a0f1f",
      "--body-bg-image":
        'linear-gradient(rgba(6,11,26,0.25), rgba(6,11,26,0.4)), url("assets/midnight_neon.png")',
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
      "--key-text": "#e0f2fe",
      "--key-saturation": 92,
      "--key-lightness": 64,
      "--key-border-saturation": 80,
      "--key-border-lightness": 42,
      "--key-active-saturation": 98,
      "--key-active-lightness": 38,
      "--tone-saturation": 96,
      "--tone-lightness": 62,
      "--accent": "#38bdf8",
      "--accent-strong": "#0ea5e9",
      "--danger-bg": "rgba(127, 29, 29, 0.7)",
      "--danger-border": "#f87171",
      "--danger-text": "#fecaca",
    },
  },
  {
    id: "sands",
    label: "Sonic Sands",
    values: {
      "--bg": "#0f172a",
      "--body-bg-image":
        'linear-gradient(rgba(79,70,229,0.22), rgba(14,165,233,0.18)), url("assets/sonic_sands.png")',
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
      "--key-text": "#f8fafc",
      "--key-saturation": 76,
      "--key-lightness": 74,
      "--key-border-saturation": 68,
      "--key-border-lightness": 52,
      "--key-active-saturation": 92,
      "--key-active-lightness": 44,
      "--tone-saturation": 90,
      "--tone-lightness": 66,
      "--accent": "#f0abfc",
      "--accent-strong": "#c084fc",
      "--danger-bg": "rgba(244, 114, 182, 0.25)",
      "--danger-border": "#f472b6",
      "--danger-text": "#ffe4e6",
    },
  },
  {
    id: "winter",
    label: "Winter Chill",
    values: {
      "--bg": "#0a1834",
      "--body-bg-image":
        'linear-gradient(rgba(15,23,42,0.18), rgba(15,23,42,0.3)), url("assets/winter_chill.png")',
      "--panel": "rgba(15, 23, 42, 0.62)",
      "--panel-strong": "rgba(15, 23, 42, 0.78)",
      "--panel-shadow": "0 10px 24px rgba(15, 23, 42, 0.75)",
      "--panel-shadow-strong": "0 14px 32px rgba(15, 23, 42, 0.9)",
      "--border": "rgba(191, 219, 254, 0.55)", // icy blue
      "--border-soft": "rgba(191, 219, 254, 0.35)",
      "--text": "#e5f2ff",
      "--muted-text": "#cbd5f5",
      "--muted-strong": "#e0f2fe",

      "--control-bg": "rgba(15, 23, 42, 0.85)",
      "--control-border": "rgba(191, 219, 254, 0.55)",
      "--control-text": "#e5f2ff",
      "--control-hover-bg": "rgba(30, 64, 175, 0.45)",
      "--control-hover-border": "#60a5fa",

      // Keys = brighter frost with crisper blue edges
      "--key": "rgba(239, 245, 255, 0.99)",
      "--key-border": "rgba(191, 219, 254, 1)",
      "--key-text": "#0b1430",

      "--key-saturation": 100,
      "--key-lightness": 88,
      "--key-border-saturation": 94,
      "--key-border-lightness": 70,
      "--key-active-saturation": 100,
      "--key-active-lightness": 52,
      "--key-hue-shift": 8,
      "--key-hue-base": 185,
      "--key-hue-range": 200,

      // Tone colors: cool ice-blue scale
      "--tone-saturation": 98,
      "--tone-lightness": 58,

      "--accent": "#bfdbfe", // soft ice blue
      "--accent-strong": "#60a5fa", // stronger winter blue

      "--danger-bg": "rgba(248, 113, 113, 0.16)",
      "--danger-border": "#fecaca",
      "--danger-text": "#fee2e2",
    },
  },
  {
    id: "santa",
    label: "Santa Groove",
    values: {
      "--bg": "#0b0f24",
      "--body-bg-image":
        'linear-gradient(rgba(5,8,22,0.2), rgba(5,8,22,0.32)), url("assets/santas_groove.png")',

      "--panel": "rgba(15, 23, 42, 0.64)",
      "--panel-strong": "rgba(15, 23, 42, 0.8)",
      "--panel-shadow": "0 10px 24px rgba(15, 23, 42, 0.75)",
      "--panel-shadow-strong": "0 14px 32px rgba(15, 23, 42, 0.9)",

      // Borders – candy-cane / frosty mix
      "--border": "rgba(252, 165, 165, 0.55)", // soft red
      "--border-soft": "rgba(190, 242, 100, 0.45)", // soft green

      "--text": "#f9fafb",
      "--muted-text": "#e5e7eb",
      "--muted-strong": "#fef9c3",

      "--control-bg": "rgba(15, 23, 42, 0.88)",
      "--control-border": "rgba(252, 165, 165, 0.7)",
      "--control-text": "#f9fafb",
      "--control-hover-bg": "rgba(239, 68, 68, 0.22)",
      "--control-hover-border": "#facc15",

      // Keys – warm off-white with subtle red/green edges
      "--key": "rgba(255, 248, 240, 0.98)",
      "--key-border": "rgba(252, 165, 165, 1)",
      "--key-text": "#111827",

      "--key-saturation": 100,
      "--key-lightness": 88,
      "--key-border-saturation": 98,
      "--key-border-lightness": 62,
      "--key-active-saturation": 100,
      "--key-active-lightness": 54,
      "--key-hue-shift": 14,
      "--key-hue-base": 310,
      "--key-hue-range": 260,

      // Tone colors – lively Christmas palette
      "--tone-saturation": 98,
      "--tone-lightness": 60,

      "--accent": "#facc15", // golden bell
      "--accent-strong": "#f97316", // warm orange glow

      "--danger-bg": "rgba(239, 68, 68, 0.16)",
      "--danger-border": "#fecaca",
      "--danger-text": "#fee2e2",
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

  // Ensure hue-mapping vars always reset when a theme doesn't define them
  const hueDefaults = {
    "--key-hue-base": "0",
    "--key-hue-range": "360",
    "--key-hue-shift": "0",
  };
  Object.entries(hueDefaults).forEach(([cssVar, fallbackValue]) => {
    if (!(cssVar in theme.values)) {
      root.style.setProperty(cssVar, fallbackValue);
    }
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
