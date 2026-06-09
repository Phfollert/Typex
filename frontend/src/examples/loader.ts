import { z } from 'zod';
import { ExampleEntrySchema, type ExampleEntry, type LoadedExample } from './types';

const BASE = '/examples';

const IndexSchema = z.array(ExampleEntrySchema);

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export async function loadIndex(): Promise<ExampleEntry[]> {
  const res = await fetch(`${BASE}/index.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: unknown = await res.json();
  return IndexSchema.parse(data);
}

export async function loadExample(entry: ExampleEntry): Promise<LoadedExample> {
  const contents = await Promise.all(
    entry.files.map(async (path) => {
      const res = await fetch(`${BASE}/${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return res.text();
    })
  );
  const order = entry.files.map(basename);
  const files: Record<string, string> = {};
  order.forEach((name, i) => {
    files[name] = contents[i];
  });
  return { files, order, pythonVersion: entry.pythonVersion };
}
