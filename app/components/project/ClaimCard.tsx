// NH-24: claim call-to-action, copy only. No form and no writes: the builder claim flow (NH-101)
// is out of scope until after the hackathon (docs/PLAN.md).
//
// NH-107: builders arriving now had no route to correct a listing. The correction link goes to a
// public issue form instead of an inbox the owner would have to watch.
import { correctionUrl } from '@/lib/links.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import ExternalLink from './ExternalLink';
import p from './project.module.css';
import s from './similar.module.css';

const PROPOSAL_URL = 'https://github.com/satojandro/near-hunt/blob/main/docs/proposals/social-kv-project.md';

export default function ClaimCard({ project }: { project: ListingItem }) {
  return (
    <section className={`${p.card} ${s.claim}`} aria-labelledby="claim-title">
      <h2 id="claim-title" className={p.cardTitle}>Built this project?</h2>
      <p className={s.claimText}>
        Builder claims are coming after the hackathon: you will publish your own project record from
        your NEAR account, and NEAR Hunt will link it to this listing.
      </p>
      <p className={s.claimText}>
        In the meantime, if the description, repository or links here are wrong or missing,{' '}
        <ExternalLink href={correctionUrl({ submissionId: project.submission_id, name: project.name })}>
          request a correction
        </ExternalLink>{' '}
        and it is fixed in a reviewed change. Records are never deleted from the chain.
      </p>
      <ExternalLink href={PROPOSAL_URL} className={s.claimLink}>Read the proposal</ExternalLink>
    </section>
  );
}
