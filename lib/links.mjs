/**
 * Where a person asks NEAR Hunt to fix a listing (NH-107).
 *
 * A GitHub issue form rather than an inbox: it is public, it links the claim to a source, and it
 * leaves a record the owner can act on without a mailbox to monitor. Field ids in the URL must
 * match `.github/ISSUE_TEMPLATE/correction.yml`, which is the form GitHub renders.
 */

export const CORRECTION_ISSUE_URL = 'https://github.com/satojandro/near-hunt/issues/new';

/**
 * @param {{submissionId?: string, name?: string}} [project]
 * @returns {string} a prefilled issue-form URL
 */
export function correctionUrl(project = {}) {
  const params = new URLSearchParams();
  params.set('template', 'correction.yml');
  if (project.name) params.set('title', `Correction: ${project.name}`);
  if (project.submissionId) params.set('project', project.submissionId);
  return `${CORRECTION_ISSUE_URL}?${params.toString()}`;
}

/**
 * Which kind of outbound link a Links-card row is, for the aggregate counter. Kept in one place so
 * the label wording in lib/project-view.mjs and the event taxonomy cannot drift apart.
 *
 * @param {string} label the row label the Links card renders
 */
export function outboundKind(label) {
  const l = String(label).toLowerCase();
  if (l.includes('repository')) return 'repository';
  if (l.includes('demo') || l.includes('launch post')) return 'demo';
  if (l.includes('video')) return 'video';
  if (l.includes('docs')) return 'docs';
  if (l.includes('explorer')) return 'explorer';
  return 'website';
}
