// NH-24: claim call-to-action, copy only. No form and no writes: the builder claim flow (NH-101)
// is out of scope until after the hackathon (docs/PLAN.md).
import ExternalLink from './ExternalLink';
import p from './project.module.css';
import s from './similar.module.css';

const PROPOSAL_URL = 'https://github.com/satojandro/near-hunt/blob/main/docs/proposals/social-kv-project.md';

export default function ClaimCard() {
  return (
    <section className={`${p.card} ${s.claim}`} aria-labelledby="claim-title">
      <h2 id="claim-title" className={p.cardTitle}>Built this project?</h2>
      <p className={s.claimText}>
        Builder claims are coming after the hackathon: you will publish your own project record from
        your NEAR account, and NEAR Hunt will link it to this listing.
      </p>
      <ExternalLink href={PROPOSAL_URL} className={s.claimLink}>Read the proposal</ExternalLink>
    </section>
  );
}
