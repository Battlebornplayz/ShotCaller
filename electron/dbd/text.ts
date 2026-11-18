/**
 * Turns the wiki's rendered text (HTML + leftover wiki links) and Steam's BBCode patch notes into a few safe tags
 * (b, i, br, ul, li) the hub can show. Everything else is dropped: no attributes, links, images or scripts survive.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ALLOWED = new Set(['b', 'i', 'br', 'ul', 'li']);

/**
 * Keeps only allowed tags (without attributes), escapes all text. Input may contain any tags and entities.
 * Lines starting with * become list items.
 */
function toSafe(input: string): string {
  // Wiki list lines → <li>, grouped into <ul>.
  const lines = input.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const m = raw.match(/^\s*\*+\s*(.*)$/);
    if (m) {
      if (!inList) out.push('<ul>');
      inList = true;
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) out.push('</ul>');
      inList = false;
      out.push(raw.trim() === '' ? '<br>' : `${raw}<br>`);
    }
  }
  if (inList) out.push('</ul>');
  const joined = out.join('');

  // Walk tags vs text.
  let html = '';
  const re = /<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    html += escapeHtml(decodeEntities(joined.slice(last, m.index)));
    last = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (tag === 'p' || tag === 'div') html += m[1] ? '' : '<br>';
    else if (ALLOWED.has(tag)) html += tag === 'br' ? '<br>' : `<${m[1]}${tag}>`;
  }
  html += escapeHtml(decodeEntities(joined.slice(last)));

  return html
    .replace(/(<b>|<i>)\s*(<\/b>|<\/i>)/g, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(\s|<br>)+|(\s|<br>)+$/g, '')
    .replace(/<br>\s*(<\/?ul>)/g, '$1')
    .replace(/(<\/?ul>)\s*<br>/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Plain text from safe html. */
export function plainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<li>/g, ' • ')
      .replace(/<br>|<\/?ul>/g, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** First sentence of a text, kept short. */
export function oneLine(text: string, max = 140): string {
  const t = text.replace(/^[•\s]+/, '');
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  let s = (m ? m[1] : t).trim();
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return s;
}

export interface WikiText {
  html: string;
  quote: string | null;
  summary: string;
}

/** A wiki description (perk, add-on, item, offering, power). */
export function cleanWikiText(raw: string): WikiText {
  let s = raw.replace(/\r/g, '');
  // Flavour quotes (beige text) are kept apart.
  const quotes: string[] = [];
  s = s.replace(/<i>\s*<span class="luaClr clr clr9"[^>]*>([\s\S]*?)<\/span>\s*<\/i>/g, (_m, q: string) => {
    quotes.push(plainText(toSafe(q)));
    return '';
  });
  // Pictures and wiki links.
  s = s.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/'''(.+?)'''/g, '<b>$1</b>').replace(/''(.+?)''/g, '<i>$1</i>');
  // "activates:While" → "activates: While".
  s = s.replace(/:(?=[A-Z])/g, ': ');
  const html = toSafe(s);
  const text = plainText(html);
  // A Hex's opening quote is really its summary when it's the only thing before the text.
  const quote = quotes.length ? quotes[quotes.length - 1] : null;
  return { html, quote, summary: oneLine(text) };
}

/** Steam's BBCode (patch notes) → safe html. */
export function cleanBbcode(raw: string): string {
  let s = raw.replace(/\r/g, '');
  s = s.replace(/\[img\][\s\S]*?\[\/img\]/gi, '').replace(/\{STEAM_CLAN_IMAGE\}[^\s\]]*/g, '');
  s = s.replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, '');
  s = s.replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1');
  s = s.replace(/\[h[1-6]\]([\s\S]*?)\[\/h[1-6]\]/gi, '\n<b>$1</b>\n');
  s = s.replace(/\[(\/?)(b|i)\]/gi, '<$1$2>').replace(/\[\/?(u|strike|spoiler|noparse|code|quote[^\]]*)\]/gi, '');
  // Lists: [list][*]a[*]b[/list] → "* a" lines.
  s = s.replace(/\[\/?(list|olist)\]/gi, '\n').replace(/\[\*\]/g, '\n* ');
  s = s.replace(/\[\/?(table|tr|td|th)[^\]]*\]/gi, ' ');
  s = s.replace(/\[p\]/gi, '').replace(/\[\/p\]/gi, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return toSafe(s);
}
