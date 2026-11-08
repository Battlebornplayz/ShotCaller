/**
 * Parser for Valve's binary KeyValues format, used by Steam's local stats cache
 * (appcache/stats/UserGameStats*.bin and UserGameStatsSchema_*.bin).
 *
 * Each entry is: type byte, null-terminated key, value. A nested object ends with 0x08.
 */

export type BinKv = { [key: string]: BinKvValue };
export type BinKvValue = BinKv | string | number | bigint;

const T_NESTED = 0x00;
const T_STRING = 0x01;
const T_INT32 = 0x02;
const T_FLOAT32 = 0x03;
const T_POINTER = 0x04;
const T_WSTRING = 0x05;
const T_COLOR = 0x06;
const T_UINT64 = 0x07;
const T_END = 0x08;
const T_INT64 = 0x0a;
const T_END_ALT = 0x0b;

export function parseBinKv(buf: Buffer): BinKv {
  let pos = 0;

  const readCString = (): string => {
    const end = buf.indexOf(0, pos);
    if (end < 0) throw new Error('Unterminated string');
    const s = buf.toString('utf8', pos, end);
    pos = end + 1;
    return s;
  };

  const readObject = (): BinKv => {
    const obj: BinKv = {};
    while (pos < buf.length) {
      const type = buf[pos++];
      if (type === T_END || type === T_END_ALT) return obj;
      const key = readCString();
      switch (type) {
        case T_NESTED:
          obj[key] = readObject();
          break;
        case T_STRING:
          obj[key] = readCString();
          break;
        case T_INT32:
        case T_POINTER:
        case T_COLOR:
          obj[key] = buf.readInt32LE(pos);
          pos += 4;
          break;
        case T_FLOAT32:
          obj[key] = buf.readFloatLE(pos);
          pos += 4;
          break;
        case T_UINT64:
          obj[key] = buf.readBigUInt64LE(pos);
          pos += 8;
          break;
        case T_INT64:
          obj[key] = buf.readBigInt64LE(pos);
          pos += 8;
          break;
        case T_WSTRING: {
          // UTF-16LE, terminated by two zero bytes.
          let end = pos;
          while (end + 1 < buf.length && (buf[end] !== 0 || buf[end + 1] !== 0)) end += 2;
          obj[key] = buf.toString('utf16le', pos, end);
          pos = end + 2;
          break;
        }
        default:
          throw new Error(`Unknown KeyValues type 0x${type.toString(16)} at ${pos}`);
      }
    }
    return obj;
  };

  return readObject();
}

export function isKv(v: BinKvValue | undefined): v is BinKv {
  return !!v && typeof v === 'object';
}

/** Case-insensitive child lookup. */
export function kvGet(obj: BinKvValue | undefined, key: string): BinKvValue | undefined {
  if (!isKv(obj)) return undefined;
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

export function kvStr(obj: BinKvValue | undefined, key: string): string | undefined {
  const v = kvGet(obj, key);
  return typeof v === 'string' ? v : undefined;
}

export function kvNum(obj: BinKvValue | undefined, key: string): number | undefined {
  const v = kvGet(obj, key);
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
