// EMBERLINE look plan, in one place. Ember-industrial palette: dark iron, hot ember
// orange as the single accent, warm bone ink, cool ash muted. Lighting makes the shades.
export const PALETTE = {
  canvas: '#171310',
  surface: '#241c17',
  hairline: '#3a2f28',
  ink: '#efe6d8',
  muted: '#9a8d80',
  accent: '#ff7a1a',
  ember: '#ff4d00',
  steel: '#4a5560',
  rust: '#8a4a26',
  moss: '#5a6b4a',
};

export function shade(name) {
  return PALETTE[name];
}
