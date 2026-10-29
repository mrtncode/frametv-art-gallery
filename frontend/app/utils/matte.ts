// Matte (Samsung's framing border around the artwork) styles and colors, as the
// samsungtvws API expects them combined into one token, e.g. "modernthin_polar".
// "none" is a style on its own and takes no color.

export const MATTE_STYLES = [
  'none', 'modernthin', 'modern', 'modernwide', 'flexible',
  'shadowbox', 'panoramic', 'triptych', 'mix', 'squares',
] as const;

// "burgandy" is the spelling the API expects, not a typo here.
export const MATTE_COLORS = [
  'black', 'neutral', 'antique', 'warm', 'polar', 'sand', 'seafoam', 'sage',
  'burgandy', 'navy', 'apricot', 'byzantine', 'lavender', 'redorange', 'skyblue', 'turquoise',
] as const;

/** Combine a style and color into the API's single token. "none" takes no color. */
export function combineMatte(style: string, color: string): string {
  return !style || style === 'none' ? 'none' : `${style}_${color}`;
}

/** Split a stored token back into a style and color, for pre-filling a picker. */
export function splitMatte(value: string | null | undefined): { style: string; color: string } {
  if (!value || value === 'none') return { style: 'none', color: MATTE_COLORS[0] };
  const separator = value.indexOf('_');
  if (separator === -1) return { style: value, color: MATTE_COLORS[0] };
  return { style: value.slice(0, separator), color: value.slice(separator + 1) };
}

/** Names to show for each style; the tokens above are what the API expects. */
export const MATTE_STYLE_LABELS: Record<string, string> = {
  none: 'No matte',
  modernthin: 'Thin',
  modern: 'Modern',
  modernwide: 'Wide',
  flexible: 'Flexible',
  shadowbox: 'Shadow box',
  panoramic: 'Panoramic',
  triptych: 'Triptych',
  mix: 'Mix',
  squares: 'Squares',
};

/** Names to show for each color. */
export const MATTE_COLOR_LABELS: Record<string, string> = {
  black: 'Black', neutral: 'Neutral', antique: 'Antique', warm: 'Warm', polar: 'Polar',
  sand: 'Sand', seafoam: 'Seafoam', sage: 'Sage', burgandy: 'Burgundy', navy: 'Navy',
  apricot: 'Apricot', byzantine: 'Byzantine', lavender: 'Lavender', redorange: 'Red orange',
  skyblue: 'Sky blue', turquoise: 'Turquoise',
};

/**
 * Approximate on-screen colors of the TV's mattes, for previews only. Samsung does not
 * publish exact values, so these are matched by eye.
 */
export const MATTE_SWATCHES: Record<string, string> = {
  black: '#1c1c1b', neutral: '#d8d4cc', antique: '#e8dfcb', warm: '#e6d6bf', polar: '#f3f3f0',
  sand: '#cdb99a', seafoam: '#a8c5bb', sage: '#99a58b', burgandy: '#6a2632', navy: '#1f2a45',
  apricot: '#e7a97d', byzantine: '#6c3a6d', lavender: '#b8a8cf', redorange: '#c4462e',
  skyblue: '#8db7d6', turquoise: '#3b9ea4',
};
