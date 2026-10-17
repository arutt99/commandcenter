import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import type { Issue, Period, Totals, Raw, Source } from '../importers/types';
const id = () => text('id').primaryKey().$defaultFn(randomUUID);
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());
export const clients = sqliteTable('clients', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  timezone: text('timezone').notNull().default('America/New_York'),
  brandName: text('brand_name').notNull().default('Wayfind'),
});
export const clientSettings = sqliteTable('client_settings', {
  clientId: text('client_id')
    .primaryKey()
    .references(() => clients.id, { onDelete: 'cascade' }),
  settings: text('settings', { mode: 'json' }).notNull().default({}),
});
export type PreviewSummary = {
  totals: Totals;
  warnings: Issue[];
  errors: Issue[];
  detectedPeriod?: Period;
  detectedSnapshot?: string;
};
export const imports = sqliteTable(
  'imports',
  {
    id: id(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    source: text('source').$type<Source>().notNull(),
    fileName: text('file_name').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    periodStart: text('period_start'),
    periodEnd: text('period_end'),
    snapshotDate: text('snapshot_date'),
    status: text('status', {
      enum: ['preview', 'active', 'superseded', 'failed', 'cancelled'],
    }).notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    rowCount: integer('row_count').notNull(),
    summary: text('summary', { mode: 'json' })
      .$type<PreviewSummary>()
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('imports_duplicate').on(t.clientId, t.source, t.sha256),
    uniqueIndex('imports_one_active')
      .on(t.clientId, t.source)
      .where(sql`${t.status} = 'active'`),
    index('imports_history').on(t.clientId, t.createdAt),
  ],
);
const rowBase = () => ({
  id: id(),
  importId: text('import_id')
    .notNull()
    .references(() => imports.id, { onDelete: 'cascade' }),
  rowNo: integer('row_no').notNull(),
  raw: text('raw', { mode: 'json' }).$type<Raw>().notNull(),
});
export const metaRows = sqliteTable(
  'meta_rows',
  {
    ...rowBase(),
    adSetName: text('ad_set_name').notNull(),
    delivery: text('delivery').notNull(),
    results: text('results'),
    resultIndicator: text('result_indicator').notNull(),
    spend: text('spend').notNull(),
    impressions: text('impressions').notNull(),
    reach: text('reach'),
    frequency: text('frequency'),
    uniqueLinkClicks: text('unique_link_clicks'),
    budget: text('budget'),
    budgetType: text('budget_type').notNull(),
    starts: text('starts'),
    ends: text('ends'),
  },
  (t) => [uniqueIndex('meta_import_row').on(t.importId, t.rowNo)],
);
export const indeedRows = sqliteTable(
  'indeed_rows',
  {
    ...rowBase(),
    campaign: text('campaign').notNull(),
    premium: text('premium').notNull(),
    impressions: text('impressions').notNull(),
    clicks: text('clicks').notNull(),
    applyStarts: text('apply_starts').notNull(),
    applies: text('applies').notNull(),
    spend: text('spend').notNull(),
    jobCount: text('job_count').notNull(),
    rowKind: text('row_kind').notNull(),
  },
  (t) => [uniqueIndex('indeed_import_row').on(t.importId, t.rowNo)],
);
export const candidateRows = sqliteTable(
  'candidate_rows',
  {
    ...rowBase(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    appCreated: text('app_created'),
    recruitingStatus: text('recruiting_status'),
    referralSource: text('referral_source'),
    rejectionReason: text('rejection_reason'),
    appStatus: text('app_status'),
    ownerOperator: text('owner_operator'),
    yearsExp: text('years_exp'),
    signedDate: text('signed_date'),
    cdlExp: text('cdl_exp'),
    endorsements: text('endorsements'),
    equipment: text('equipment'),
    startDate: text('start_date'),
    position: text('position'),
    location: text('location'),
    daysInFunnel: integer('days_in_funnel'),
    ambiguousFields: text('ambiguous_fields', { mode: 'json' })
      .$type<string[]>()
      .notNull(),
    values: text('values', { mode: 'json' })
      .$type<Record<string, string[]>>()
      .notNull(),
  },
  (t) => [uniqueIndex('candidate_import_row').on(t.importId, t.rowNo)],
);
export const auditLog = sqliteTable('audit_log', {
  id: id(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  object: text('object').notNull(),
  createdAt: createdAt(),
});
