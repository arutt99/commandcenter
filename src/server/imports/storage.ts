import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
export interface PrivateStorage {
  put(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function storage(): PrivateStorage {
  const backend = process.env.FILE_STORAGE ?? 'disk';
  if (backend === 'disk') {
    if (process.env.VERCEL)
      throw new Error('Hosted deployments must use private Supabase storage.');
    const root = path.resolve(
      /* turbopackIgnore: true */ process.env.PRIVATE_STORAGE_DIR ??
        './private-storage',
    );
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
  if (backend !== 'supabase')
    throw new Error('Unknown file storage configuration.');
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET ?? 'import-originals';
  const bucket = client.storage.from(bucketName);
  async function ensurePrivate() {
    const { data, error } = await client.storage.getBucket(bucketName);
    if (error || !data || data.public)
      throw new Error('A private import storage bucket is required.');
  }
  return {
    async put(data) {
      await ensurePrivate();
      const key = randomUUID();
      const { error } = await bucket.upload(key, data, {
        contentType: 'application/octet-stream',
        upsert: false,
      });
      if (error) throw new Error('Private file upload failed.');
      return key;
    },
    async read(key) {
      await ensurePrivate();
      const { data, error } = await bucket.download(key);
      if (error || !data) throw new Error('Private file download failed.');
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(key) {
      const { error } = await bucket.remove([key]);
      if (error) throw new Error('Private file removal failed.');
    },
  };
}
