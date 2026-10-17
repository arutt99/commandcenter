import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, type Database } from '../db';
import {
  auditLog,
  candidateRows,
  clients,
  clientSettings,
  imports,
  indeedRows,
  metaRows,
} from '../db/schema';
import { assertAdmin, type Actor } from '../permissions';
import {
  candidateMatches,
  stageSettings,
  stageSettingsSchema,
  type CandidateFilter,
  type StageSettings,
} from './metrics';

export class ReportingError extends Error {}
function assertMember(actor: Actor) {
  if (!actor.active || !['admin', 'staff'].includes(actor.role))
    throw new ReportingError('Active staff access is required.');
}
export function sourcePeriod(
  item:
    | {
        source: string;
        snapshotDate: string | null;
        periodStart: string | null;
        periodEnd: string | null;
      }
    | undefined,
): string | null {
  if (!item) return null;
  return item.source === 'driverhub'
    ? `Snapshot ${item.snapshotDate}`
    : `${item.periodStart} – ${item.periodEnd}`;
}
export class ReportingService {
  constructor(private db: Database = getDb()) {}
  async dashboard(actor: Actor, slug: string) {
    assertMember(actor);
    // One consistent snapshot across source selection and row reads, even during activation/revert.
    return this.db.transaction(
      async (tx) => {
        const client = await tx.query.clients.findFirst({
          where: and(eq(clients.slug, slug), eq(clients.active, true)),
        });
        if (!client) throw new ReportingError('Client is unavailable.');
        const active = await tx
          .select()
          .from(imports)
          .where(
            and(eq(imports.clientId, client.id), eq(imports.status, 'active')),
          );
        const setting = await tx.query.clientSettings.findFirst({
          where: eq(clientSettings.clientId, client.id),
        });
        const settings = stageSettings(
          (setting?.settings as { stages?: unknown } | undefined)?.stages,
        );
        const meta = active.find((i) => i.source === 'meta');
        const indeed = active.find((i) => i.source === 'indeed');
        const driverhub = active.find((i) => i.source === 'driverhub');
        return {
          client,
          active,
          settings,
          meta,
          indeed,
          driverhub,
          metaRows: meta
            ? await tx
                .select()
                .from(metaRows)
                .where(eq(metaRows.importId, meta.id))
                .orderBy(asc(metaRows.rowNo))
            : null,
          indeedRows: indeed
            ? await tx
                .select()
                .from(indeedRows)
                .where(eq(indeedRows.importId, indeed.id))
                .orderBy(asc(indeedRows.rowNo))
            : null,
          candidates: driverhub
            ? await tx
                .select()
                .from(candidateRows)
                .where(eq(candidateRows.importId, driverhub.id))
                .orderBy(asc(candidateRows.rowNo))
            : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async candidates(
    actor: Actor,
    slug: string,
    importId: string,
    filter: CandidateFilter,
    requestedPage: number,
    settingsOverride?: StageSettings,
  ) {
    assertMember(actor);
    if (!z.uuid().safeParse(importId).success)
      throw new ReportingError('Snapshot is unavailable.');
    return this.db.transaction(
      async (tx) => {
        const client = await tx.query.clients.findFirst({
          where: and(eq(clients.slug, slug), eq(clients.active, true)),
        });
        if (!client) throw new ReportingError('Client is unavailable.');
        const item = await tx.query.imports.findFirst({
          where: and(
            eq(imports.id, importId),
            eq(imports.clientId, client.id),
            eq(imports.source, 'driverhub'),
            inArray(imports.status, ['active', 'superseded']),
          ),
        });
        if (!item)
          throw new ReportingError('Snapshot is unavailable for this client.');
        const config = await tx.query.clientSettings.findFirst({
          where: eq(clientSettings.clientId, client.id),
        });
        const settings =
          settingsOverride ??
          stageSettings(
            (config?.settings as { stages?: unknown } | undefined)?.stages,
          );
        const rows = await tx
          .select()
          .from(candidateRows)
          .where(eq(candidateRows.importId, item.id))
          .orderBy(asc(candidateRows.rowNo));
        const filtered = rows.filter((row) =>
          candidateMatches(row, filter, settings),
        );
        const pageSize = 25;
        const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
        const page = Math.min(
          pageCount,
          Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
        );
        return {
          client,
          item,
          total: filtered.length,
          page,
          pageCount,
          rows: filtered.slice((page - 1) * pageSize, page * pageSize),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async saveStages(actor: Actor, slug: string, input: unknown) {
    assertAdmin(actor);
    const stages = stageSettingsSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const client = await tx.query.clients.findFirst({
        where: and(eq(clients.slug, slug), eq(clients.active, true)),
      });
      if (!client) throw new ReportingError('Client is unavailable.');
      await tx
        .insert(clientSettings)
        .values({ clientId: client.id, settings: { stages } })
        .onConflictDoUpdate({
          target: clientSettings.clientId,
          set: {
            settings: sql`${clientSettings.settings} || ${JSON.stringify({ stages })}::jsonb`,
          },
        });
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: 'settings.stages.update',
        object: client.id,
      });
    });
  }
}
