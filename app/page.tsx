import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getProjects } from '@/lib/projects';
import { getParticipants } from '@/lib/participants';
import { participantsLabel } from '@/lib/participants.mjs';
import Participants from '@/app/components/Participants';
import { getVoteCounts } from '@/lib/votes';
import { cardCommentCount, directoryView, formatFetchedUtc, type SearchParamsRecord, type Votes } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import Sidebar from '@/app/components/sidebar/Sidebar';
import SearchBox from '@/app/components/directory/SearchBox';
import ProjectCard from '@/app/components/directory/ProjectCard';
import { SortTabs, TrackChips } from '@/app/components/directory/DirectoryControls';
import StaleBanner from '@/app/components/states/StaleBanner';
import EmptyResults from '@/app/components/states/EmptyResults';
import DirectorySkeleton from '@/app/components/states/DirectorySkeleton';
import { getCommentCounts } from '@/lib/comments';
import './directory.css';

// The directory's share card (NH-109). Without this the front page — the URL the demo post links
// — rendered with no og:/twitter: tags at all, while every /p/{id} page had a rich card.
export const metadata: Metadata = {
  title: { absolute: 'NEAR Hunt — the NEAR Hackathon, as open records on NEAR' },
  description:
    'Browse the NEAR Hackathon projects. Every project is an open record on NEAR, and every upvote is a write you sign from your own account. Votes are community signals, not official judging.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'NEAR Hunt — the NEAR Hackathon, as open records',
    description: 'Browse every project. Upvote the ones you would actually use. Records and votes are on NEAR.',
    type: 'website',
    url: '/',
    images: [{ url: '/og/home.png', width: 1200, height: 630, alt: 'NEAR Hunt' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEAR Hunt — the NEAR Hackathon, as open records',
    description: 'Browse every project. Upvote the ones you would actually use. Records and votes are on NEAR.',
    images: ['/og/home.png'],
  },
};

// Directory: search (NH-12), track chips (NH-13), sort (NH-14). All state lives in the URL
// (`?q=&track=&sort=`) and is rendered on the server.
// NH-80: the skeleton shows while the project list loads. A Suspense boundary here rather than
// app/loading.tsx, because a root loading.tsx would also wrap /p/[id] and cost it its 404 status.
// URL-only changes (search, chips, sort) keep the current list on screen instead of the skeleton.
export default function Home(props: { searchParams: Promise<SearchParamsRecord> }) {
  return (
    <Suspense fallback={<DirectorySkeleton />}>
      <Directory {...props} />
    </Suspense>
  );
}

async function Directory({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const [{ items, fetched_at, account }, params, tally, people] = await Promise.all([
    getProjects(), searchParams, getVoteCounts(), getParticipants(),
  ]);

  // Vote counts by submission_id (NH-33): active `vote/{id}` rows under the vote account, one per
  // voter, counted only for live projects. If the votes read fails the map is empty and the
  // status line says the tally is unavailable; the directory itself still renders.
  const votes: Votes = tally.counts;
  // NH-44/NH-43: comment counts from the `comment/` rows on nearhunt.near, for every live project.
  const discussion = await getCommentCounts(items.map((p) => p.submission_id));

  const { state, total, results, chips } = directoryView(items, params, votes, discussion.counts);
  const fetched = formatFetchedUtc(fetched_at);
  const noVotesYet = state.sort === 'upvoted' && results.every((p) => !votes[p.submission_id]);
  const noCommentsYet = state.sort === 'discussed' && results.every((p) => !discussion.counts[p.submission_id]);

  // NH-114: the snapshot card is decorative (aria-hidden) and only drawn by the playful themes
  // (globals.css sets --snapshot-display). It shows the current #1 — the first row of the sort on
  // screen — with a camera-style date stamp.
  const top = results[0];
  const now = new Date();
  const snapshotStamp = `'${String(now.getFullYear()).slice(-2)} `
    + `${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}`;
  const snapshotInitial = (top?.name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();

  return (
    <>
      <StaleBanner row />
      <section className="container dir-hero">
        <div className="dir-hero-copy">
        <p className="dir-eyebrow">NEAR Hackathon · 1–14 Nov 2026</p>
        <h1>{total} projects. Upvote the ones you would actually use.</h1>
        <p className="dir-lede">
          Every project is an open record on NEAR. Every upvote and every comment is a write you sign
          from your own NEAR account. Votes are community signals, not official judging.
        </p>
        {/* NH-112: people who have signed something, with their near.social faces. Hidden when the
            rows cannot be read — never rendered as "0 people". */}
        {people.available && people.items.length > 0 ? (
          <Participants people={people.items} label={participantsLabel(people.items.length) ?? ''} />
        ) : null}
        </div>
        {top ? (
          <figure className="dir-snapshot" aria-hidden="true">
            <div className="dir-snapshot-frame">
              <span className="dir-snapshot-letter">{snapshotInitial}</span>
              <span className="dir-snapshot-stamp">{snapshotStamp}</span>
            </div>
            <figcaption className="dir-snapshot-caption">top of the hunt: {top.name}</figcaption>
          </figure>
        ) : null}
      </section>

      <section className="container dir-controls" aria-label="Find projects">
        <SearchBox q={state.q} track={state.track} sort={state.sort} total={total} />
        <div className="dir-tabs-row">
          <SortTabs state={state} discussed />
          <p className="dir-provenance">
            Read from NEAR mainnet · {account}
            {fetched ? <> · fetched <time dateTime={fetched_at}>{fetched}</time></> : null}
          </p>
        </div>
        <TrackChips state={state} chips={chips} />
      </section>

      <main className="container dir-main">
        <div className="dir-list-col">
          <p className="dir-status" aria-live="polite">
            {results.length === total
              ? `Showing all ${total} projects`
              : `Showing ${results.length} of ${total} projects`}
            {state.track ? ` in ${trackLabel(state.track)}` : ''}
            {state.q ? ` matching “${state.q}”` : ''}
            {!tally.available
              ? ' · upvote counts are unavailable right now'
              : noVotesYet && results.length > 0 ? ' · no votes yet, so this is newest first' : ''}
            {state.sort === 'discussed' && !discussion.available
              ? ' · comment counts are unavailable right now'
              : noCommentsYet && results.length > 0 ? ' · no comments yet, so this is newest first' : ''}
          </p>

          {results.length > 0 ? (
            <ol className="dir-list">
              {results.map((item, i) => (
                <ProjectCard
                  key={item.submission_id}
                  item={item}
                  rank={i + 1}
                  votes={votes[item.submission_id] ?? 0}
                  comments={cardCommentCount(discussion.counts, item.submission_id, discussion.available)}
                />
              ))}
            </ol>
          ) : (
            <EmptyResults state={state} />
          )}
        </div>

        <aside className="dir-aside">
          <Sidebar />
        </aside>
      </main>
    </>
  );
}
