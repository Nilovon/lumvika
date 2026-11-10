import * as React from "react";

// Every value below is a solid hex. Email clients built on the Word engine drop `rgba()`
// outright, so the design system's opacity ramps on --foreground are flattened here against
// the surface they sit on rather than expressed as alpha.

function channels(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.replace(/./g, (c) => c + c) : v;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** `ratio` of `fg` laid over `bg`, resolved to a solid hex. */
export function mix(fg: string, bg: string, ratio: number): string {
  const [r1, g1, b1] = channels(fg);
  const [r2, g2, b2] = channels(bg);
  return toHex(
    r2 + (r1 - r2) * ratio,
    g2 + (g1 - g2) * ratio,
    b2 + (b1 - b2) * ratio,
  );
}

const SURFACE = {
  page: "#0a0a0a",
  card: "#171717",
  inset: "#0f0f0f",
  border: "#262626",
} as const;

const BRAND = {
  base: "#0b6e63",
  light: "#7fdccb",
  deep: "#220fa0",
} as const;

export const theme = {
  surface: SURFACE,
  brand: BRAND,
  text: {
    strong: "#fafafa",
    body: "#d4d4d4",
    muted: "#a1a1a1",
    faint: "#737373",
  },
  radius: {
    card: "14px",
    inner: "8px",
    pill: "999px",
  },
  width: {
    card: 520,
  },
  font: {
    // No web font: the only clients that would honour one are the Apple stack, which already
    // resolves to a face close enough to Inter. Inter leads in case it is installed locally.
    sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
} as const;

export type ToneName =
  | "done"
  | "error"
  | "question"
  | "approval"
  | "connector"
  | "info"
  | "brand";

export type Tone = {
  /** The pure tone, as documented on /brand/ui/foundations. Drives the illustration. */
  solid: string;
  /** The tone as text on the card surface. */
  text: string;
  /** Tone at 12% over the card. */
  fill: string;
  /** Tone at 40% over the card. */
  border: string;
  /** Tone at 8% over the inset surface, for framed blocks. */
  insetFill: string;
  /** Tone at 28% over the inset surface. */
  insetBorder: string;
};

function tone(solid: string, text = solid): Tone {
  return {
    solid,
    text,
    fill: mix(solid, SURFACE.card, 0.12),
    border: mix(solid, SURFACE.card, 0.4),
    insetFill: mix(solid, SURFACE.inset, 0.08),
    insetBorder: mix(solid, SURFACE.inset, 0.28),
  };
}

// Status colours come straight from the design system: the isometric board's agent states
// and the semantic set documented next to them.
export const TONES: Record<ToneName, Tone> = {
  done: tone("#34d399"),
  error: tone("#f87171"),
  question: tone("#22d3ee"),
  approval: tone("#f59e0b"),
  connector: tone("#06b6d4"),
  info: tone("#a1a1a1"),
  brand: tone(BRAND.base, BRAND.light),
};

export const text = {
  heading: {
    color: theme.text.strong,
    fontSize: "22px",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: "28px",
    margin: "0 0 10px",
  },
  paragraph: {
    color: theme.text.body,
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  mono: {
    color: theme.text.body,
    fontFamily: theme.font.mono,
    fontSize: "12px",
    lineHeight: "20px",
    margin: 0,
  },
  label: {
    color: theme.text.faint,
    fontFamily: theme.font.mono,
    fontSize: "11px",
    letterSpacing: "0.08em",
    lineHeight: "18px",
    margin: 0,
    textTransform: "uppercase",
  },
  footnote: {
    color: theme.text.faint,
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
  },
} satisfies Record<string, React.CSSProperties>;
