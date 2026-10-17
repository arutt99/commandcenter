import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from '../src/server/importers';
import type { CandidateRow } from '../src/server/importers/types';
async function main() {
  const entries = await readdir('local-data', { withFileTypes: true }).catch(
    () => [],
  );
  const files = entries.filter(
    (f) => f.isFile() && /\.(csv|xlsx)$/i.test(f.name),
  );
  if (!files.length) {
    console.log(
      'No real files in local-data/. Appendix C reconciliation has not been run.',
    );
    process.exitCode = 2;
    return;
  }
  for (const file of files) {
    const { source, result } = await parseFile(
      await readFile(path.join('local-data', file.name)),
      file.name,
    );
    // Never print candidate names, raw rows, or real filenames.
    console.log(
      JSON.stringify(
        {
          source,
          period: result.detectedPeriod,
          snapshot: result.detectedSnapshot,
          totals: result.totals,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
        null,
        2,
      ),
    );
    if (source === 'driverhub' && !result.errors.length) {
      const rows = result.rows as CandidateRow[];
      const referralSources: Record<string, number> = {};
      for (const row of rows) {
        const key = row.ambiguousFields.includes('App Referral Source')
          ? 'multi-value'
          : (row.referralSource ?? 'missing');
        referralSources[key] = (referralSources[key] ?? 0) + 1;
      }
      console.log(
        JSON.stringify(
          {
            referralSources,
            attemptingContact: rows.filter(
              (r) => r.recruitingStatus === 'Attempting Contact',
            ).length,
            multiValueStatus: rows.filter((r) =>
              r.ambiguousFields.includes('App Recruiting Status'),
            ).length,
          },
          null,
          2,
        ),
      );
    }
    if (result.errors.length) process.exitCode = 1;
  }
}
main().catch(() => {
  console.error(
    'Reconciliation could not finish. No candidate data was logged.',
  );
  process.exitCode = 1;
});
