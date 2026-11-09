/**
 * Parse the importer's dry-run output into counts, so a scheduler can decide whether a new
 * record appeared without re-implementing the feed logic. Pure and testable.
 *
 * @param {string} text stdout of `node scripts/import.mjs`
 * @returns {{feed:number|null, chain:number|null, create:number, changed:number, unchanged:number}|null}
 */
export function parseImportOutput(text) {
  if (typeof text !== 'string') return null;
  const num = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : null;
  };
  const out = {
    feed: num(/fetched:\s*(\d+)\s+projects/),
    chain: num(/chain:\s*(\d+)\s+project rows/),
    create: num(/^\s*new:\s*(\d+)/m),
    changed: num(/^\s*changed:\s*(\d+)/m),
    unchanged: num(/^\s*unchanged:\s*(\d+)/m),
  };
  if (out.create === null || out.changed === null) return null;
  return out;
}

/** True when the feed has records the chain does not (new or changed source fields). */
export function hasPending(parsed) {
  return Boolean(parsed && parsed.create + parsed.changed > 0);
}

/** One-line human summary, or '' when there is nothing to do (a silent cron tick). */
export function pendingMessage(parsed) {
  if (!hasPending(parsed)) return '';
  const parts = [];
  if (parsed.create) parts.push(`${parsed.create} new`);
  if (parsed.changed) parts.push(`${parsed.changed} changed`);
  return (
    `NEAR Hunt feed: ${parts.join(', ')} project record(s) ` +
    `(chain ${parsed.chain ?? '?'}, feed ${parsed.feed ?? '?'}). ` +
    `Next: follow docs/runbooks/new-submissions.md (enrich, then dry-run import); mainnet writes still need owner approval.`
  );
}
