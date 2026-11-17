import type { Metadata } from 'next';
import Link from 'next/link';
import { groupByTrack, trackSlug, type PicksFile } from '@/lib/picks.mjs';
import PICKS_FILE from '@/data/picks.json';
import s from './picks.module.css';

// NH-123: NH Picks, NEAR Hunt's recommendations, like staff picks in a bookshop. The list is
// data/picks.json, written by scripts/picks-export.mjs from the AI reviewer's table. The page is
// static: no scores, no memos, and the order is track then name so it never reads as a ranking.

const DATA = PICKS_FILE as PicksFile;

export const metadata: Metadata = {
  title: 'NH Picks',
  description:
    'Hackathon projects NEAR Hunt recommends: solid builds that use NEAR in their core design. Not official judging, not a ranking.',
  alternates: { canonical: '/picks' },
  openGraph: {
    title: 'NH Picks · NEAR Hunt',
    description: 'Hackathon projects NEAR Hunt recommends. Not official judging, not a ranking.',
    type: 'website',
    images: [{ url: '/og/picks.png', width: 1200, height: 630, alt: 'NH Picks on NEAR Hunt' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NH Picks · NEAR Hunt',
    description: 'Hackathon projects NEAR Hunt recommends. Not official judging, not a ranking.',
    images: ['/og/picks.png'],
  },
};

const nf = new Intl.NumberFormat('en-US');
const METHOD_URL = 'https://github.com/satojandro/near-hunt/blob/main/lib/picks.mjs';
// A plain issue with a prefilled title: the listing-correction template is about chain records,
// which a pick's AI-written summary is not.
const PICK_ISSUE_URL = 'https://github.com/satojandro/near-hunt/issues/new?title=NH%20Picks%3A%20';

/** Pitches use `backticks` for account names and identifiers; render those as code. */
function Pitch({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <p className={s.pitch}>
      {parts.map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>))}
    </p>
  );
}

export default function PicksPage() {
  const groups = groupByTrack(DATA.picks);
  const updated = new Date(DATA.generated_at).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <main className={`container ${s.page}`}>
      <header className={s.hero}>
        <p className={s.eyebrow}>NH Picks</p>
        <h1>Projects we&apos;d point a friend to</h1>
        <p className={s.lede}>
          Like the staff picks shelf in a bookshop: a short list of hackathon builds that stood out when we
          read their code. Each one works, and puts NEAR at the centre of its design rather than at the
          edge.
        </p>
        <p className={s.disclaimer}>
          <strong>Not official hackathon judging, and not a ranking.</strong> NEAR Hunt is itself a hackathon
          entry and never picks itself. Projects are listed by track, then alphabetically. Picks come from
          AI reviews of the {nf.format(DATA.reviewed)} submissions with a public GitHub repository. Updated{' '}
          {updated}. <a href={METHOD_URL}>How picks are chosen</a>.
        </p>
        <p className={s.note}>
          Each one-line summary is written by AI from the project&apos;s README and has not been checked by
          a person. If yours is wrong, or you would rather not be listed,{' '}
          <a href={PICK_ISSUE_URL}>open an issue</a> and we will fix or remove it.
        </p>
      </header>

      <nav className={s.tracks} aria-label="Tracks">
        {groups.map((g) => (
          <a key={g.track} href={`#${trackSlug(g.track)}`} className={s.trackChip}>
            {g.track} <span className={s.count}>{g.items.length}</span>
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.track} id={trackSlug(g.track)} className={s.group} aria-labelledby={`h-${trackSlug(g.track)}`}>
          <h2 id={`h-${trackSlug(g.track)}`}>{g.track}</h2>
          <ul className={s.grid}>
            {g.items.map((p) => (
              <li key={p.submission_id} className={s.card}>
                <h3>
                  <Link href={`/p/${encodeURIComponent(p.submission_id)}`}>{p.name}</Link>
                </h3>
                {p.pitch ? <Pitch text={p.pitch} /> : null}
                {p.primitives.length ? (
                  <ul className={s.prims} aria-label="NEAR features used">
                    {p.primitives.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {groups.length === 0 ? <p className={s.lede}>No picks yet. The first ones appear once reviews are in.</p> : null}
    </main>
  );
}
