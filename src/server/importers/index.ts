import { csvTable } from './common';
import { parseDriverhub } from './driverhub';
import { INDEED_HEADERS, parseIndeed } from './indeed';
import { META_HEADERS, parseMeta } from './meta';
import { MAX_BYTES, type Source, type ParseResult } from './types';
export function detectSource(buffer: Buffer): Source | null {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    return 'driverhub';
  const { headers } = csvTable(buffer.toString('utf8').split(/\r?\n/, 1)[0]);
  if (META_HEADERS.every((h) => headers.includes(h))) return 'meta';
  if (INDEED_HEADERS.every((h) => headers.includes(h))) return 'indeed';
  return null;
}
export async function parseFile(
  buffer: Buffer,
  filename: string,
  source?: Source,
): Promise<{ source: Source | null; result: ParseResult }> {
  const selected = source ?? detectSource(buffer);
  const invalid = (message: string) => ({
    source: selected,
    result: { rows: [], totals: {}, warnings: [], errors: [{ message }] },
  });
  if (buffer.length > MAX_BYTES) return invalid('Limit is 10 MB.');
  if (!selected)
    return invalid(
      'Unrecognized headers. Select a source and use its supported export format.',
    );
  if (selected === 'driverhub') {
    if (!/\.xlsx$/i.test(filename))
      return invalid('DriverHub requires an XLSX file.');
    return { source: selected, result: await parseDriverhub(buffer) };
  }
  if (!/\.csv$/i.test(filename))
    return invalid('Meta and Indeed require a CSV file.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return invalid('CSV must be UTF-8 encoded.');
  }
  return {
    source: selected,
    result: selected === 'meta' ? parseMeta(text) : parseIndeed(text, filename),
  };
}
