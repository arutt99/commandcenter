import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  date,
  integer,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import type { Issue, Period, Totals, Raw, Source } from '../importers/types';
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['admin', 'staff'] }).notNull(),
  active: boolean('active').notNull().default(true),
}).enableRLS();
export const clients = pgTable('clients', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  active: boolean('active').notNull().default(true),
  timezone: text('timezone').notNull().default('America/New_York'),
  brandName: text('brand_name').notNull().default('Wayfind'),
}).enableRLS();
export const clientSettings = pgTable('client_settings', {
  clientId: uuid('client_id')
    .primaryKey()
    .references(() => clients.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').notNull().default({}),
}).enableRLS();
export type PreviewSummary = {
  totals: Totals;
  warnings: Issue[];
  errors: Issue[];
  detectedPeriod?: Period;
  detectedSnapshot?: string;
};
export const imports = pgTable(
  'imports',
  {
    id: id(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    source: text('source').$type<Source>().notNull(),
    fileName: text('file_name').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    snapshotDate: date('snapshot_date'),
    status: text('status', {
      enum: ['preview', 'active', 'superseded', 'failed', 'cancelled'],
    }).notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    rowCount: integer('row_count').notNull(),
    summary: jsonb('summary').$type<PreviewSummary>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('imports_duplicate').on(t.clientId, t.source, t.sha256),
    uniqueIndex('imports_one_active')
      .on(t.clientId, t.source)
      .where(sql`${t.status} = 'active'`),
    index('imports_history').on(t.clientId, t.createdAt),
  ],
).enableRLS();
const rowBase = () => ({
  id: id(),
  importId: uuid('import_id')
    .notNull()
    .references(() => imports.id, { onDelete: 'cascade' }),
  rowNo: integer('row_no').notNull(),
  raw: jsonb('raw').$type<Raw>().notNull(),
});
export const metaRows = pgTable(
  'meta_rows',
  {
    ...rowBase(),
    adSetName: text('ad_set_name').notNull(),
    delivery: text('delivery').notNull(),
    results: numeric('results'),
    resultIndicator: text('result_indicator').notNull(),
    spend: numeric('spend').notNull(),
    impressions: numeric('impressions').notNull(),
    reach: numeric('reach'),
    frequency: numeric('frequency'),
    uniqueLinkClicks: numeric('unique_link_clicks'),
    budget: numeric('budget'),
    budgetType: text('budget_type').notNull(),
    starts: date('starts'),
    ends: date('ends'),
  },
  (t) => [uniqueIndex('meta_import_row').on(t.importId, t.rowNo)],
).enableRLS();
export const indeedRows = pgTable(
  'indeed_rows',
  {
    ...rowBase(),
    campaign: text('campaign').notNull(),
    premium: text('premium').notNull(),
    impressions: numeric('impressions').notNull(),
    clicks: numeric('clicks').notNull(),
    applyStarts: numeric('apply_starts').notNull(),
    applies: numeric('applies').notNull(),
    spend: numeric('spend').notNull(),
    jobCount: numeric('job_count').notNull(),
    rowKind: text('row_kind').notNull(),
  },
  (t) => [uniqueIndex('indeed_import_row').on(t.importId, t.rowNo)],
).enableRLS();
export const candidateRows = pgTable(
  'candidate_rows',
  {
    ...rowBase(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    appCreated: date('app_created'),
    recruitingStatus: text('recruiting_status'),
    referralSource: text('referral_source'),
    rejectionReason: text('rejection_reason'),
    appStatus: text('app_status'),
    ownerOperator: text('owner_operator'),
    yearsExp: numeric('years_exp'),
    signedDate: date('signed_date'),
    cdlExp: date('cdl_exp'),
    endorsements: text('endorsements'),
    equipment: text('equipment'),
    startDate: date('start_date'),
    position: text('position'),
    location: text('location'),
    daysInFunnel: integer('days_in_funnel'),
    ambiguousFields: jsonb('ambiguous_fields').$type<string[]>().notNull(),
    values: jsonb('values').$type<Record<string, string[]>>().notNull(),
  },
  (t) => [uniqueIndex('candidate_import_row').on(t.importId, t.rowNo)],
).enableRLS();
export const auditLog = pgTable('audit_log', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  object: text('object').notNull(),
  createdAt: createdAt(),
}).enableRLS();
