/**
 * LIFE OS Designsystem – plattformneutrale Tokens (Desktop: theme.css, Mobile: NativeWind-Config).
 * Palette: Anthrazit (Flächen), Gold (Fortschritt/Belohnung), Violett (Magie/KI), Elektrisch-Blau (Aktion/Info).
 */
export const colors = {
  bg: "#0d0f14",
  surface: "#151821",
  surface2: "#1c2030",
  border: "#2a3042",
  text: "#e8eaf2",
  muted: "#8b92a8",
  gold: "#e6b450",
  goldDeep: "#b8862b",
  violet: "#8b5cf6",
  violetDeep: "#6d28d9",
  blue: "#38bdf8",
  blueDeep: "#0284c7",
  success: "#34d399",
  danger: "#f87171",
  warning: "#fbbf24",
} as const;

/** Farbe je Attribut – konsistent auf allen Plattformen. */
export const attributeColors = {
  disziplin: "#e6b450",
  staerke: "#f87171",
  ausdauer: "#fb923c",
  intelligenz: "#38bdf8",
  karriere: "#a78bfa",
  finanzen: "#34d399",
  gesundheit: "#4ade80",
  soziales: "#f472b6",
  ordnung: "#94a3b8",
  willenskraft: "#8b5cf6",
} as const;

export const questTypeColors = {
  daily: "#38bdf8",
  weekly: "#60a5fa",
  main: "#e6b450",
  side: "#94a3b8",
  epic: "#8b5cf6",
  legendary: "#f59e0b",
  hidden: "#64748b",
  boss: "#f87171",
} as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;
export const font = { display: "Cinzel", body: "Inter" } as const;
