'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireLocal } from '@/server/local/context';
import { ReportingService } from '@/server/reporting/service';
import { stageSettingsSchema } from '@/server/reporting/metrics';

export async function saveStages(slug: string, form: FormData) {
  const actor = await requireLocal();
  const split = (name: string) =>
    String(form.get(name) ?? '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  const parsed = stageSettingsSchema.safeParse({
    interviewStatuses: split('interviewStatuses'),
    onboardingStatuses: split('onboardingStatuses'),
  });
  const base = `/c/${encodeURIComponent(slug)}/settings`;
  if (!parsed.success)
    redirect(
      `${base}?error=Enter%201–20%20statuses%20per%20stage%2C%20one%20per%20line%20%28max%20120%20characters%20each%29.`,
    );
  await new ReportingService().saveStages(actor, slug, parsed.data);
  revalidatePath(`/c/${slug}`, 'layout');
  redirect(`${base}?message=Stage%20mapping%20saved.`);
}
