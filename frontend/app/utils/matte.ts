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
