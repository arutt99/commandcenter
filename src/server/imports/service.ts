import { createHash } from 'node:crypto';
import path from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db';
import {
  auditLog,
  candidateRows,
  clients,
  imports,
  indeedRows,
  metaRows,
} from '../db/schema';
import { validISODate } from '../importers/common';
import { parseFile } from '../importers';
import {
  MAX_BYTES,
  type CandidateRow,
  type IndeedRow,
  type MetaRow,
  type Source,
} from '../importers/types';
import { assertAdmin, type Actor } from '../permissions';
import { storage, type PrivateStorage } from './storage';

type Dependencies = { db: Database; files: PrivateStorage };
export class ImportError extends Error {}
export class ImportService {
  constructor(private deps: Dependencies = { db: getDb(), files: storage() }) {}
  private async client(clientId: string) {
    if (
      !(await this.deps.db.query.clients.findFirst({
        where: and(eq(clients.id, clientId), eq(clients.active, true)),
      }))
    )
      throw new ImportError('Client is unavailable.');
  }
  async history(actor: Actor, clientId: string) {
    assertAdmin(actor);
    await this.client(clientId);
    return this.deps.db
      .select()
      .from(imports)
      .where(eq(imports.clientId, clientId))
      .orderBy(desc(imports.createdAt));
  }
  async get(actor: Actor, clientId: string, id: string) {
    assertAdmin(actor);
    await this.client(clientId);
    const item = await this.deps.db.query.imports.findFirst({
      where: and(eq(imports.id, id), eq(imports.clientId, clientId)),
    });
    if (!item) throw new ImportError('Import not found for this client.');
    return item;
  }
  async download(actor: Actor, clientId: string, id: string) {
    const item = await this.get(actor, clientId, id);
    const data = await this.deps.files.read(item.storagePath);
    await this.deps.db
      .insert(auditLog)
      .values({ userId: actor.id, action: 'import.download', object: item.id });
    return { item, data };
  }
  async preview(
    actor: Actor,
    clientId: string,
    fileName: string,
    buffer: Buffer,
    source?: Source,
  ) {
    assertAdmin(actor);
    await this.client(clientId);
    if (buffer.length > MAX_BYTES) throw new ImportError('Limit is 10 MB.');
    const parsed = await parseFile(buffer, fileName, source);
    if (!parsed.source) throw new ImportError(parsed.result.errors[0].message);
    const selected = parsed.source;
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    let stored: string | undefined;
    try {
      return await this.deps.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${clientId + ':' + selected}))`,
        );
        const duplicate = await tx.query.imports.findFirst({
          where: and(
            eq(imports.clientId, clientId),
            eq(imports.source, selected),
            eq(imports.sha256, sha256),
          ),
        });
        if (duplicate)
          throw new ImportError(
            'Already imported for this client and source. Open its history entry.',
          );
        stored = await this.deps.files.put(buffer);
        const { rows, ...summary } = parsed.result;
        const [item] = await tx
          .insert(imports)
          .values({
            clientId,
            source: selected,
            fileName:
              path
                .basename(fileName.replaceAll('\\', '/'))
                .replace(/[\x00-\x1F\x7F]/g, '')
                .slice(0, 180) || 'export',
            sha256,
            storagePath: stored,
            status: summary.errors.length ? 'failed' : 'preview',
            uploadedBy: actor.id,
            rowCount: rows.length,
            summary,
          })
          .returning();
        await tx.insert(auditLog).values({
          userId: actor.id,
          action: 'import.preview',
          object: item.id,
        });
        return item;
      });
    } catch (error) {
      if (stored) await this.deps.files.remove(stored);
      throw error;
    }
  }
  async confirm(
    actor: Actor,
    clientId: string,
    id: string,
    metadata: {
      periodStart?: string;
      periodEnd?: string;
      snapshotDate?: string;
      confirmed: boolean;
      expectedActiveId: string;
    },
  ) {
    assertAdmin(actor);
    const original = await this.get(actor, clientId, id);
    return this.deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${clientId + ':' + original.source}))`,
      );
      const item = await tx.query.imports.findFirst({
        where: and(eq(imports.id, id), eq(imports.clientId, clientId)),
      });
      if (!item || item.status !== 'preview')
        throw new ImportError('Only a valid preview can be confirmed.');
      const active = await tx.query.imports.findFirst({
        where: and(
          eq(imports.clientId, clientId),
          eq(imports.source, item.source),
          eq(imports.status, 'active'),
        ),
      });
      if ((active?.id ?? '') !== metadata.expectedActiveId)
        throw new ImportError(
          'The active import changed. Reload the preview and review what will be replaced.',
        );
      if (!metadata.confirmed)
        throw new ImportError('Confirm the reporting dates or snapshot date.');
      const buffer = await this.deps.files.read(item.storagePath);
      if (createHash('sha256').update(buffer).digest('hex') !== item.sha256)
        throw new ImportError('Original file integrity check failed.');
      const { result } = await parseFile(buffer, item.fileName, item.source);
      if (result.errors.length)
        throw new ImportError(
          'The file has validation errors. Active data was not changed.',
        );
      let periodStart: string | null = null;
      let periodEnd: string | null = null;
      let snapshotDate: string | null = null;
      if (item.source === 'driverhub') {
        snapshotDate = metadata.snapshotDate ?? '';
        if (
          !validISODate(snapshotDate) ||
          (result.detectedSnapshot && snapshotDate < result.detectedSnapshot)
        )
          throw new ImportError(
            'Choose a valid snapshot date on or after the newest App Created date.',
          );
      } else {
        periodStart = metadata.periodStart ?? '';
        periodEnd = metadata.periodEnd ?? '';
        if (
          !validISODate(periodStart) ||
          !validISODate(periodEnd) ||
          periodStart > periodEnd
        )
          throw new ImportError('Choose a valid reporting start and end date.');
        if (
          item.source === 'meta' &&
          result.detectedPeriod &&
          (periodStart !== result.detectedPeriod.start ||
            periodEnd !== result.detectedPeriod.end)
        )
          throw new ImportError(
            'Meta dates must match the reporting dates in the file.',
          );
      }
      for (let offset = 0; offset < result.rows.length; offset += 500) {
        const rows = result.rows.slice(offset, offset + 500);
        if (item.source === 'meta')
          await tx.insert(metaRows).values(
            (rows as MetaRow[]).map((r) => ({
              ...r,
              importId: id,
              results: r.results?.toString() ?? null,
              impressions: r.impressions.toString(),
              reach: r.reach?.toString() ?? null,
              uniqueLinkClicks: r.uniqueLinkClicks?.toString() ?? null,
            })),
          );
        else if (item.source === 'indeed')
          await tx.insert(indeedRows).values(
            (rows as IndeedRow[]).map((r) => ({
              ...r,
              importId: id,
              impressions: r.impressions.toString(),
              clicks: r.clicks.toString(),
              applyStarts: r.applyStarts.toString(),
              applies: r.applies.toString(),
              jobCount: r.jobCount.toString(),
            })),
          );
        else
          await tx
            .insert(candidateRows)
            .values(
              (rows as CandidateRow[]).map((r) => ({ ...r, importId: id })),
            );
      }
      if (active)
        await tx
          .update(imports)
          .set({ status: 'superseded' })
          .where(eq(imports.id, active.id));
      await tx
        .update(imports)
        .set({ status: 'active', periodStart, periodEnd, snapshotDate })
        .where(eq(imports.id, id));
      await tx
        .insert(auditLog)
        .values({ userId: actor.id, action: 'import.confirm', object: id });
    });
  }
  async revert(actor: Actor, clientId: string, id: string) {
    assertAdmin(actor);
    const original = await this.get(actor, clientId, id);
    await this.deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${clientId + ':' + original.source}))`,
      );
      const target = await tx.query.imports.findFirst({
        where: and(eq(imports.id, id), eq(imports.clientId, clientId)),
      });
      if (target?.status !== 'superseded')
        throw new ImportError('Only a superseded import can be restored.');
      await tx
        .update(imports)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(imports.clientId, clientId),
            eq(imports.source, target.source),
            eq(imports.status, 'active'),
          ),
        );
      await tx
        .update(imports)
        .set({ status: 'active' })
        .where(eq(imports.id, id));
      await tx
        .insert(auditLog)
        .values({ userId: actor.id, action: 'import.revert', object: id });
    });
  }
  async cancel(actor: Actor, clientId: string, id: string) {
    assertAdmin(actor);
    const original = await this.get(actor, clientId, id);
    await this.deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${clientId + ':' + original.source}))`,
      );
      const item = await tx.query.imports.findFirst({
        where: and(eq(imports.id, id), eq(imports.clientId, clientId)),
      });
      if (!item || !['preview', 'failed'].includes(item.status))
        throw new ImportError(
          'Only a preview or failed import can be cancelled.',
        );
      await tx.delete(imports).where(eq(imports.id, id));
      await tx
        .insert(auditLog)
        .values({ userId: actor.id, action: 'import.cancel', object: id });
    });
    await this.deps.files.remove(original.storagePath);
  }
}
