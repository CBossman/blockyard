/**
 * The interface's little pictures, drawn here (16 by 16) rather than left to whatever symbols the
 * player's fonts happen to have, which on some machines come out as empty boxes. Each is found by
 * the character the game's definitions name it with.
 */

function gear(): string {
  const pts: string[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    // (Eight teeth, each four steps round: two out, two in.)
    const r = i % 4 < 2 ? 7.6 : 5.6;
    pts.push(`${(8 + Math.cos(a + 0.1) * r).toFixed(2)} ${(8 + Math.sin(a + 0.1) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}ZM8 5.6a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 0 0 0-4.8Z`;
}

const BURST = 'M8 0 9.5 5 14 2 11 6.5 16 8 11 9.5 14 14 9.5 11 8 16 6.5 11 2 14 5 9.5 0 8 5 6.5 2 2 6.5 5Z';
const SHIELD = 'M8 1 14 3V8C14 11.5 11.5 14 8 15.4 4.5 14 2 11.5 2 8V3Z';

const PATHS: Record<string, string> = {
  // A bell (the alarm).
  '⍾': 'M8 1.2c-2.7 0-4.4 2.1-4.4 4.8v3.3L1.8 11.7V13h12.4v-1.3L12.4 9.3V6c0-2.7-1.7-4.8-4.4-4.8ZM6.2 13.9a1.8 1.8 0 0 0 3.6 0Z',
  '✕': 'M3 1.6 8 6.6 13 1.6 14.4 3 9.4 8 14.4 13 13 14.4 8 9.4 3 14.4 1.6 13 6.6 8 1.6 3Z',
  '⟳': 'M8 2a6 6 0 0 1 5.7 4.1L15 5v4.5h-4.4l1.6-1.7A4 4 0 1 0 12 10.4l1.8.8A6 6 0 1 1 8 2Z',
  '▲': 'M8 2 15 14H1Z',
  '⚙': gear(),
  '⇪': 'M8 1 13 6H10V10H6V6H3ZM2 12H14V15H2Z',
  '⌖': 'M7 0h2v3H7zM7 13h2v3H7zM0 7h3v2H0zM13 7h3v2h-3zM8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm0 2a3 3 0 1 0 0 6A3 3 0 0 0 8 5ZM7 7h2v2H7z',
  '⇄': 'M1 5 5 1.5V4H15V6H5V8.5ZM15 11 11 7.5V10H1V12H11V14.5Z',
  '↩': 'M6 1 1 5.5 6 10V7H10A2.5 2.5 0 0 1 10 12H4V14.5H10A5 5 0 0 0 10 4.5H6Z',
  '★': 'M8 .8 10.2 5.6 15.4 6.2 11.5 9.7 12.6 14.9 8 12.3 3.4 14.9 4.5 9.7.6 6.2 5.8 5.6Z',
  '■': 'M3 3H13V13H3Z',
  '✈': 'M8 .5C8.8.5 9.2 1.6 9.2 3V6L15.5 10V11.8L9.2 9.8V13L11 14.4V15.5L8 14.6 5 15.5V14.4L6.8 13V9.8L.5 11.8V10L6.8 6V3C6.8 1.6 7.2.5 8 .5Z',
  '⛨': SHIELD,
  '⛉': `${SHIELD}M8 3.2 4 4.5V8C4 10.4 5.6 12.2 8 13.3 10.4 12.2 12 10.4 12 8V4.5Z`,
  '◉': 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 2a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  '▣': 'M4.5 4H11.5L15 12H1Z',
  '●': 'M8 1C10.5 4.6 13 7.4 13 10A5 5 0 0 1 3 10C3 7.4 5.5 4.6 8 1Z',
  '⚒': 'M6 1H12L15 4 13 6 11.5 4.8 10.6 5.7 4 13.6C3.2 14.6 2 14.6 1.4 14 .8 13.4.9 12.2 1.8 11.5L9.3 4.6 8.4 3.6 6 3Z',
  '⛏': 'M4 2.5C8 .8 12.8 2.3 14.6 7.2L12.9 8C11.6 4.6 8.4 3.4 5 4.2ZM10.5 4.6 12.1 6 3.4 15.2 1.6 13.6Z',
  '⚔': BURST,
  '✺': BURST,
  zz: 'M2 2H8V3.6L4.6 7H8V8.8H2V7.2L5.4 3.8H2ZM9 8H15V9.6L11.6 13H15V14.8H9V13.2L12.4 9.8H9Z',
  '✋': 'M4 7V3.2a1 1 0 0 1 2 0V6.5h.4V2a1 1 0 0 1 2 0v4.5h.4V2.8a1 1 0 0 1 2 0V7h.4V4.6a1 1 0 0 1 2 0V10c0 3-2 5-4.6 5C6 15 4.6 14 3.6 12.4L1.4 9c-.5-.8 1-1.8 1.7-.9Z',
  '✸': 'M8 1l1.2 3 3-1.2L11 6l3 2-3 2 1.2 3.2-3-1.2L8 15l-1.2-3-3 1.2L5 10 2 8l3-2-1.2-3.2 3 1.2Z',
  '✹': 'M6 1h4v2H6zM8 4a5.5 5.5 0 1 1 0 11A5.5 5.5 0 0 1 8 4Z',
  '✦': 'M8 0 10 6 16 8 10 10 8 16 6 10 0 8 6 6Z',
  '⚓': 'M7 1h2v8h3L8 13.5 4 9h3ZM2 14h12v1.5H2Z',
  '☁': 'M4.5 13A3.5 3.5 0 0 1 4 6a4.5 4.5 0 0 1 8.6-.8A3.9 3.9 0 0 1 12 13Z',
  '☄': 'M3 1h2v5h2L4 10 1 6h2ZM11 1h2v5h2l-3 4-3-4h2ZM7 6h2v5h2l-3 4-3-4h2Z',
  '➹': 'M14.5 1.5 14 8 11.5 6 4 13.5 2.5 12 10 4.5 8 2Z',
  '♥': 'M8 14.5 2 8.6A3.7 3.7 0 0 1 7.2 3.4L8 4.2l.8-.8A3.7 3.7 0 0 1 14 8.6Z',
  '⏱': 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 2a5 5 0 1 0 0 10A5 5 0 0 0 8 3ZM7 4.5h2V8l2.4 1.6-1 1.5L7 9Z',
};

/** The shape of a glyph (undefined: not one of the drawn ones). */
export const iconPath = (glyph: string): string | undefined => PATHS[glyph];

/** A glyph as a picture for a page, the size of the text round it. */
export function iconHtml(glyph: string): string {
  const d = PATHS[glyph];
  return d ? `<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" fill-rule="evenodd" style="position:static;display:inline-block;width:1em;height:1em;vertical-align:-0.12em"><path d="${d}"/></svg>` : glyph;
}

const ANY = new RegExp([...Object.keys(PATHS)].filter((k) => k !== 'zz').join('|'), 'gu');

/** Text with every glyph in it swapped for its picture. */
export const withIcons = (html: string): string => html.replace(ANY, (g) => iconHtml(g));
