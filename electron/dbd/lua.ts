/**
 * Reads the plain-data tables out of a Lua module (the DbD wiki keeps its data as Lua tables).
 * Only literals are understood: tables, strings, numbers, true/false/nil. Anything else (a function call,
 * a string joined with ..) is skipped and reads as undefined. Nothing is ever run.
 */

export type LuaValue = string | number | boolean | null | undefined | LuaTable;
export interface LuaTable {
  /** Entries without a key, in order. */
  list: LuaValue[];
  /** Entries with a name or [key]. */
  map: Record<string, LuaValue>;
}

class Reader {
  i = 0;
  readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  skipSpace(): void {
    const s = this.s;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith('--', this.i)) {
        const long = s.slice(this.i + 2).match(/^\[(=*)\[/);
        if (long) {
          const end = s.indexOf(`]${long[1]}]`, this.i + 2 + long[0].length);
          this.i = end < 0 ? s.length : end + long[1].length + 2;
        } else {
          const nl = s.indexOf('\n', this.i);
          this.i = nl < 0 ? s.length : nl + 1;
        }
        continue;
      }
      return;
    }
  }

  peek(): string {
    this.skipSpace();
    return this.s[this.i] ?? '';
  }

  string(): string {
    const s = this.s;
    const q = s[this.i];
    if (q === '[') {
      const m = s.slice(this.i).match(/^\[(=*)\[/)!;
      const start = this.i + m[0].length;
      const end = s.indexOf(`]${m[1]}]`, start);
      this.i = end < 0 ? s.length : end + m[1].length + 2;
      return s.slice(start, end < 0 ? s.length : end).replace(/^\r?\n/, '');
    }
    this.i++;
    let out = '';
    while (this.i < s.length && s[this.i] !== q) {
      if (s[this.i] === '\\') {
        const c = s[this.i + 1];
        out += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        this.i += 2;
      } else out += s[this.i++];
    }
    this.i++;
    return out;
  }

  /** Skips one expression we don't understand: up to the next , ; or } at this depth. */
  skipExpr(): void {
    const s = this.s;
    let depth = 0;
    while (this.i < s.length) {
      this.skipSpace();
      const c = s[this.i];
      if (c === undefined) return;
      if (c === '"' || c === "'" || (c === '[' && /^\[=*\[/.test(s.slice(this.i, this.i + 8)))) {
        this.string();
        continue;
      }
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') {
        if (depth === 0) return;
        depth--;
      } else if ((c === ',' || c === ';') && depth === 0) return;
      this.i++;
    }
  }

  value(inKey = false): LuaValue {
    const c = this.peek();
    const s = this.s;
    const start = this.i;
    let v: LuaValue;
    if (c === '{') v = this.table();
    else if (c === '"' || c === "'" || (c === '[' && /^\[=*\[/.test(s.slice(this.i, this.i + 8)))) v = this.string();
    else {
      const m = s.slice(this.i, this.i + 64).match(/^(-?(?:0x[0-9a-f]+|\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|true\b|false\b|nil\b)/i);
      if (m) {
        this.i += m[0].length;
        v = m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'nil' ? null : Number(m[0]);
      } else {
        this.skipExpr();
        return undefined;
      }
    }
    // A literal followed by an operator (e.g. "a" .. b) is an expression: skip the rest.
    const next = this.peek();
    if (!inKey && next && next !== ',' && next !== ';' && next !== '}') {
      this.i = start;
      this.skipExpr();
      return undefined;
    }
    return v;
  }

  table(): LuaTable {
    const t: LuaTable = { list: [], map: {} };
    this.i++; // {
    for (;;) {
      const c = this.peek();
      if (!c) return t;
      if (c === '}') {
        this.i++;
        return t;
      }
      if (c === ',' || c === ';') {
        this.i++;
        continue;
      }
      if (c === '[' && !/^\[=*\[/.test(this.s.slice(this.i, this.i + 8))) {
        this.i++;
        const k = this.value(true);
        if (this.peek() === ']') this.i++;
        if (this.peek() === '=') this.i++;
        const key = k === undefined || k === null ? null : String(k);
        const v = this.value();
        if (key !== null) t.map[key] = v;
        continue;
      }
      const name = this.s.slice(this.i).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
      if (name) {
        this.i += name[0].length;
        t.map[name[1]] = this.value();
        continue;
      }
      t.list.push(this.value());
    }
  }
}

/**
 * Every top-level `name = { ... }` / `p.name = { ... }` in a module, by name (without "p.").
 * Later assignments to the same name win.
 */
export function readLuaTables(source: string): Record<string, LuaTable> {
  const out: Record<string, LuaTable> = {};
  const re = /^(?:local\s+)?(?:p\.)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const r = new Reader(source);
    r.i = m.index + m[0].length - 1;
    try {
      out[m[1]] = r.table();
      re.lastIndex = Math.max(re.lastIndex, r.i);
    } catch {
      // A table we can't read is left out.
    }
  }
  return out;
}

// Small helpers for reading parsed tables.
export const isTable = (v: LuaValue): v is LuaTable => typeof v === 'object' && v !== null;
export const str = (v: LuaValue): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
export const num = (v: LuaValue): number | null => (typeof v === 'number' ? v : null);
/** A list of strings (or one string) as an array. */
export function strList(v: LuaValue): string[] {
  if (typeof v === 'string') return [v];
  if (!isTable(v)) return [];
  return v.list.filter((x): x is string => typeof x === 'string');
}
export function numList(v: LuaValue): number[] {
  if (typeof v === 'number') return [v];
  if (!isTable(v)) return [];
  return v.list.filter((x): x is number => typeof x === 'number');
}
