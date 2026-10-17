'use server';
import { redirect } from 'next/navigation';
import { requireLocal } from '@/server/local/context';
import { createBackup } from '@/server/local/backups';
export async function backupNow() {
  await requireLocal();
  let failed = false;
  try {
    await createBackup();
  } catch {
    failed = true;
  }
  redirect(
    failed
      ? '/local?error=Backup%20could%20not%20complete.%20Check%20free%20disk%20space%20and%20original%20files.'
      : '/local?message=Backup%20created.%20Copy%20the%20whole%20backup%20folder%20to%20a%20separate%20drive%20for%20protection%20from%20computer%20failure.',
  );
}
