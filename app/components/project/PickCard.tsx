import Link from 'next/link';
import InlineMarks from '@/app/components/InlineMarks';
import { findPick, type PicksFile } from '@/lib/picks.mjs';
import PICKS_FILE from '@/data/picks.json';
import s from './project.module.css';
import ps from './pick.module.css';

// NH-123: on a picked project's page, say why it is an NH Pick: the AI score, the one-line pitch
// and the judge memo as written (owner decision, 17 Nov). Renders nothing for other projects.

const DATA = PICKS_FILE as PicksFile;

export default function PickCard({ projectId }: { projectId: string }) {
  const pick = findPick(DATA.picks, projectId);
  if (!pick) return null;
  return (
    <section className={`${s.card} ${ps.card}`} aria-labelledby="pick-title">
      <div className={ps.head}>
        <div>
          <p className={ps.eyebrow}>
            <Link href="/picks">NH Pick</Link> · {pick.track}
          </p>
          <h2 id="pick-title" className={s.cardTitle}>Why we picked it</h2>
        </div>
        <span className={ps.score} title="Score from NEAR Hunt's AI reviewer, out of 5">
          <span className={ps.scoreValue}>{pick.score.toFixed(2)}</span>
          <span className={ps.scoreLabel}>AI score / 5</span>
        </span>
      </div>
      {pick.pitch ? <p className={ps.pitch}><InlineMarks text={pick.pitch} /></p> : null}
      {pick.memo ? <p className={ps.memo}><InlineMarks text={pick.memo} /></p> : null}
      <p className={ps.foot}>
        Written by NEAR Hunt&apos;s AI reviewer from this project&apos;s public repository, addressed to the team.
        Not official hackathon judging. <Link href="/picks">See all NH Picks</Link>.
      </p>
    </section>
  );
}
