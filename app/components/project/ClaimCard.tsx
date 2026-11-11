// NH-119: "Claim this project" with GitHub sign-in. The check and what is stored: lib/claims.mjs.
// Replaces NH-24's "coming after the hackathon" copy for listings that have a GitHub repository;
// the others keep the correction route (NH-107), which is also how a repository gets added.
import { correctionUrl } from '@/lib/links.mjs';
import { claimableRepo, outcomeMessage } from '@/lib/claims.mjs';
import Link from 'next/link';
import { claimsConfigured, getPublicClaims } from '@/lib/claims';
import LinkNearAccount from './LinkNearAccount';
import type { ListingItem } from '@/lib/listing.mjs';
import ExternalLink from './ExternalLink';
import p from './project.module.css';
import s from './similar.module.css';

function ClaimForm({ id, action, label, className }: { id: string; action: 'claim' | 'remove'; label: string; className: string }) {
  // A plain form POST: works without JavaScript, and a link (GET) could be sent to someone else.
  return (
    <form method="post" action="/api/claim/start">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}

export default async function ClaimCard({ project, outcome }: { project: ListingItem; outcome?: string }) {
  const repo = claimableRepo(project);
  const { claims } = claimsConfigured ? await getPublicClaims(project.submission_id) : { claims: [] };
  const message = outcomeMessage(outcome);
  const correction = (
    <ExternalLink href={correctionUrl({ submissionId: project.submission_id, name: project.name })}>
      request a correction
    </ExternalLink>
  );

  return (
    <section id="claim" className={`${p.card} ${s.claim}`} aria-labelledby="claim-title">
      <h2 id="claim-title" className={p.cardTitle}>{claims.length ? 'Project contacts' : 'Built this project?'}</h2>
      {message ? <p className={s.claimNotice} role="status">{message}</p> : null}

      {claims.length ? (
        <>
          <p className={s.makerNote}>GitHub accounts that control this project&apos;s repository:</p>
          <ul className={s.makers}>
            {claims.map((c) => (
              <li key={c.github_id}>
                <ExternalLink href={`https://github.com/${c.github_login}`}>@{c.github_login}</ExternalLink>
                <span className={s.makerNote}>
                  {c.basis === 'owner' ? 'owns' : 'can push to'} the repository, checked with GitHub on{' '}
                  <time dateTime={c.verified_at}>{c.verified_at.slice(0, 10)}</time>
                </span>
                {c.near_account ? (
                  <span className={s.makerNote}>
                    NEAR account <Link href={`/u/${c.near_account}`}>{c.near_account}</Link>, linked by a row
                    that account signed
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {claimsConfigured ? <LinkNearAccount projectId={project.submission_id} /> : null}

      {claimsConfigured && repo ? (
        <>
          <p className={s.claimText}>
            {claims.length ? 'Also on the team? ' : ''}Sign in with GitHub to show that you control{' '}
            <strong>{repo}</strong>. NEAR Hunt asks for no permissions beyond your public profile and
            publishes only your GitHub username here.
          </p>
          <ClaimForm id={project.submission_id} action="claim" label="Claim this project" className={s.claimButton} />
          {claims.length ? (
            <ClaimForm id={project.submission_id} action="remove" label="Remove my claim" className={s.claimRemove} />
          ) : null}
        </>
      ) : claimsConfigured ? (
        <p className={s.claimText}>
          Claims are checked against a project&apos;s GitHub repository, and this listing has none
          yet. To add it, {correction}; once it is listed you can claim the project here.
        </p>
      ) : (
        <p className={s.claimText}>
          Builder claims are not switched on yet.
        </p>
      )}

      <p className={s.claimText}>
        {claimsConfigured && repo ? 'If' : 'In the meantime, if'} the description, repository, links
        or a contact shown here are wrong or missing, {correction} and it is fixed in a reviewed change. Records are never
        deleted from the chain.
      </p>
    </section>
  );
}
