import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localPaths } from '../local/paths';
export interface PrivateStorage {
  put(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function storage(root = localPaths().originals): PrivateStorage {
  const safe = (key: string) => {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key.');
    return path.join(/* turbopackIgnore: true */ root, key);
  };
  return {
    async put(data) {
      const key = randomUUID();
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(safe(key), data, { flag: 'wx', mode: 0o600 });
      return key;
    },
    async read(key) {
      return readFile(/* turbopackIgnore: true */ safe(key));
    },
    async remove(key) {
      try {
        await unlink(safe(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}
