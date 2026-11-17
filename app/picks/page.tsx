import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { groupByTrack, judgeTrackSlug, trackSlug, type Pick, type PicksFile } from '@/lib/picks.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import { tintClass, tintIndex } from '@/lib/tints.mjs';
import { getVoteCounts } from '@/lib/votes';
import { getCommentCounts } from '@/lib/comments';
import { getProjects } from '@/lib/projects';
import LiveOnSocial, { LiveOnSocialSkeleton } from '@/app/components/sidebar/LiveOnSocial';
import sb from '@/app/components/sidebar/sidebar.module.css';
import { Suspense } from 'react';
import ProjectAvatar from '@/app/components/ProjectAvatar';
import InlineMarks from '@/app/components/InlineMarks';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
import ds from '@/app/components/discussion/discussion.module.css';
import PICKS_FILE from '@/data/picks.json';
import '../directory.css';
import s from './picks.module.css';

// NH-123: NH Picks. The list is data/picks.json, written by scripts/picks-export.mjs from the AI
// reviewer's table. Rows reuse the directory's card (app/directory.css) so the page reads like the
// home page; each row adds the AI score and the start of the judge memo (owner decision, 17 Nov),
// and the full memo is on the project page. Upvotes and comment counts are live, like the home page.

const DATA = PICKS_FILE as PicksFile;

export const metadata: Metadata = {
  title: 'NH Picks',
  description:
    'Hackathon projects NEAR Hunt recommends, with the AI reviewer’s score and notes. Not official hackathon judging.',
  alternates: { canonical: '/picks' },
  openGraph: {
    title: 'NH Picks · NEAR Hunt',
    description: 'Hackathon projects NEAR Hunt recommends, with the AI reviewer’s score and notes. Not official judging.',
    type: 'website',
    images: [{ url: '/og/picks.png', width: 1200, height: 630, alt: 'NH Picks on NEAR Hunt' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NH Picks · NEAR Hunt',
    description: 'Hackathon projects NEAR Hunt recommends, with the AI reviewer’s score and notes. Not official judging.',
    images: ['/og/picks.png'],
  },
};

const nf = new Intl.NumberFormat('en-US');
const METHOD_URL = 'https://github.com/satojandro/near-hunt/blob/main/lib/picks.mjs';
// A plain issue with a prefilled title: the listing-correction template is about chain records,
// which a pick's AI-written notes are not.
const PICK_ISSUE_URL = 'https://github.com/satojandro/near-hunt/issues/new?title=NH%20Picks%3A%20';

/** Live counts, like the home page. If a read fails the page still renders, with zeros and no comment counts. */
async function liveCounts(ids: string[]) {
  const [votes, comments, tracks] = await Promise.all([
    getVoteCounts().then((v) => v.counts as Record<string, number>).catch(() => ({}) as Record<string, number>),
    getCommentCounts(ids)
      .then((c) => (c.available ? (c.counts as Record<string, number>) : null))
      .catch(() => null),
    // Each project's own tracks, as on the home page; the judge's single track is the section it sits in.
    getProjects()
      .then(({ items }) => new Map(items.map((p) => [p.submission_id, p.tracks] as const)))
      .catch(() => new Map<string, string[]>()),
  ]);
  return { votes, comments, tracks };
}

function PickRow({ pick, votes, comments, tracks }: { pick: Pick; votes: number; comments?: number; tracks?: string[] }) {
  const slug = judgeTrackSlug(pick.track);
  const tags = tracks?.length ? tracks : [slug];
  return (
    <li className={`dir-card ${s.row}`}>
      <span className="dir-avatar">
        <ProjectAvatar id={pick.submission_id} name={pick.name} track={tags[0]} />
      </span>
      <div className="dir-card-body">
        <Link href={`/p/${encodeURIComponent(pick.submission_id)}`} className="dir-card-link">
          {pick.name}
        </Link>
        {pick.pitch ? <p className={s.pitch}><InlineMarks text={pick.pitch} /></p> : null}
        {pick.memo ? <p className={s.memo}><InlineMarks text={pick.memo} /></p> : null}
        <div className="dir-card-meta">
          <span className="visually-hidden">Tracks:</span>
          {tags.map((t) => (
            <span key={t} className={`dir-pill ${tintClass(t)}`}>{trackLabel(t)}</span>
          ))}
          {typeof comments === 'number' ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={ds.cardCount}>{comments} {comments === 1 ? 'comment' : 'comments'}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className={s.numbers}>
        <span className={s.score} title="Score from NEAR Hunt's AI reviewer, out of 5">
          <span className={s.scoreValue}>{pick.score.toFixed(2)}</span>
          <span className={s.scoreLabel}>AI score</span>
        </span>
        <UpvoteButton projectId={pick.submission_id} initialCount={votes} variant="card" projectName={pick.name} />
      </div>
    </li>
  );
}

/** The selection, in the home sidebar's dark card style. Mirrors lib/picks.mjs; keep the two in step. */
function HowWePicked({ reviewed, cutoff, picks }: { reviewed: number; cutoff: number; picks: number }) {
  return (
    <section className={`${sb.card} ${sb.cardDark} ${sb.cardFeature}`} aria-labelledby="how-we-picked-title">
      <div className={sb.sprocket} aria-hidden="true" />
      <div className={sb.featureInner}>
        <h2 className={sb.title} id="how-we-picked-title" style={{ marginBottom: 12 }}>How we picked</h2>
        <ol className={sb.steps}>
          <li>
            <strong>Read every repo.</strong> Our AI reviewer read the README and files of all {nf.format(reviewed)}{' '}
            submissions with a public GitHub repository.
          </li>
          <li>
            <strong>Scored each one</strong> on whether it works, how deeply it uses NEAR, originality and fit to its
            track, real-world use, and docs and demo. A second pass compared the leaders in each track side by side.
          </li>
          <li>
            <strong>Kept the standouts:</strong> passed the screening check and scored {cutoff.toFixed(2)} or more, plus
            the top project in every track. {nf.format(picks)} made it. NEAR Hunt never picks itself.
          </li>
        </ol>
        <a href={METHOD_URL} className={sb.code}>lib/picks.mjs</a>
      </div>
      <div className={sb.sprocket} aria-hidden="true" />
    </section>
  );
}

export default async function PicksPage() {
  await connection(); // Live upvote and comment counts, like the home page.
  const groups = groupByTrack(DATA.picks);
  const { votes, comments, tracks } = await liveCounts(DATA.picks.map((p) => p.submission_id));
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
          Like the staff picks shelf in a bookshop: {nf.format(DATA.picks.length)} hackathon builds that stood out
          when our AI reviewer read their code. Each one works, and puts NEAR at the centre of its design. Open a
          project to read why we picked it.
        </p>
        <p className={s.disclaimer}>
          <strong>Not official hackathon judging.</strong> Scores and notes come from NEAR Hunt&apos;s AI reviewer,
          which read the {nf.format(DATA.reviewed)} submissions with a public GitHub repository; the notes are
          written to each team and have not been checked by a person. NEAR Hunt is itself a hackathon entry and
          never picks itself. Upvotes are the community&apos;s. Updated {updated}.{' '}
          <a href={METHOD_URL}>How picks are chosen</a>.
        </p>
        <p className={s.note}>
          Something wrong about your project, or would you rather not be listed?{' '}
          <a href={PICK_ISSUE_URL}>Open an issue</a> and we will fix or remove it.
        </p>
      </header>

      <nav className={`dir-chips ${s.chips}`} aria-label="Tracks">
        {groups.map((g) => (
          <a key={g.track} href={`#${trackSlug(g.track)}`} className={`dir-chip chip-tint-${tintIndex(judgeTrackSlug(g.track))}`}>
            {trackLabel(judgeTrackSlug(g.track))} <span className="dir-chip-count">{g.items.length}</span>
          </a>
        ))}
      </nav>

      <div className="dir-main">
        <div className="dir-list-col">
      {groups.map((g) => (
        <section key={g.track} id={trackSlug(g.track)} className={s.group} aria-labelledby={`h-${trackSlug(g.track)}`}>
          <h2 id={`h-${trackSlug(g.track)}`}>
            {g.track} <span className={s.groupCount}>{g.items.length}</span>
          </h2>
          <ol className="dir-list">
            {g.items.map((p) => (
              <PickRow
                key={p.submission_id}
                pick={p}
                votes={votes[p.submission_id] ?? 0}
                comments={comments ? (comments[p.submission_id] ?? 0) : undefined}
                tracks={tracks.get(p.submission_id)}
              />
            ))}
          </ol>
        </section>
      ))}

      {groups.length === 0 ? <p className={s.lede}>No picks yet. The first ones appear once reviews are in.</p> : null}
        </div>
        <aside className="dir-aside">
          <div className={sb.stack}>
            <Suspense fallback={<LiveOnSocialSkeleton />}>
              <LiveOnSocial />
            </Suspense>
            <HowWePicked reviewed={DATA.reviewed} cutoff={DATA.method.cutoff} picks={DATA.picks.length} />
          </div>
        </aside>
      </div>
    </main>
  );
}
