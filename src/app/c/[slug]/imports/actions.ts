'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireLocal } from '@/server/local/context';
import { getClient } from '@/server/clients';
import { ImportError, ImportService } from '@/server/imports/service';
import { MAX_BYTES, SOURCES, type Source } from '@/server/importers/types';
import { z } from 'zod';
const idSchema = z.uuid();
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
function safeError(e: unknown) {
  return e instanceof ImportError
    ? e.message
    : 'The operation could not finish. Check configuration or try again. Active data was not changed by an incomplete activation.';
}
export async function upload(slugValue: string, form: FormData) {
  const slug = slugSchema.parse(slugValue);
  let id: string | undefined;
  let message: string | undefined;
  try {
    const actor = await requireLocal();
    const client = await getClient(slug);
    const file = form.get('file');
    const choice = String(form.get('source') ?? 'auto');
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
      throw new ImportError('Choose a CSV or XLSX file up to 10 MB.');
    if (choice !== 'auto' && !SOURCES.includes(choice as Source))
      throw new ImportError('Choose a supported source.');
    const item = await new ImportService().preview(
      actor,
      client.id,
      file.name,
      Buffer.from(await file.arrayBuffer()),
      choice === 'auto' ? undefined : (choice as Source),
    );
    id = item.id;
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    message = safeError(e);
  }
  revalidatePath(`/c/${slug}/imports`);
  redirect(
    id
      ? `/c/${slug}/imports/${id}`
      : `/c/${slug}/imports?error=${encodeURIComponent(message!)}`,
  );
}
export async function mutate(
  slugValue: string,
  idValue: string,
  operation: 'confirm' | 'cancel' | 'revert',
  form: FormData,
) {
  const slug = slugSchema.parse(slugValue);
  const id = idSchema.parse(idValue);
  let message: string | undefined;
  try {
    const actor = await requireLocal();
    const client = await getClient(slug);
    const service = new ImportService();
    if (operation === 'confirm')
      await service.confirm(actor, client.id, id, {
        confirmed: form.get('confirmed') === 'on',
        periodStart: String(form.get('periodStart') ?? ''),
        periodEnd: String(form.get('periodEnd') ?? ''),
        snapshotDate: String(form.get('snapshotDate') ?? ''),
        expectedActiveId: String(form.get('expectedActiveId') ?? ''),
      });
    else if (operation === 'cancel') await service.cancel(actor, client.id, id);
    else if (operation === 'revert') await service.revert(actor, client.id, id);
    else throw new ImportError('Unknown import action.');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    message = safeError(e);
  }
  revalidatePath(`/c/${slug}/imports`);
  redirect(
    message
      ? `/c/${slug}/imports/${id}?error=${encodeURIComponent(message)}`
      : `/c/${slug}/imports?message=${encodeURIComponent(operation === 'cancel' ? 'Preview deleted.' : operation === 'revert' ? 'Previous import restored.' : 'Import activated. Previous data was replaced.')}`,
  );
}
