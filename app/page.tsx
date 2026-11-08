import { Suspense } from 'react';
import { getProjects } from '@/lib/projects';
import { getVoteCounts } from '@/lib/votes';
import { directoryView, formatFetchedUtc, type SearchParamsRecord, type Votes } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import Sidebar from '@/app/components/sidebar/Sidebar';
import SearchBox from '@/app/components/directory/SearchBox';
import ProjectCard from '@/app/components/directory/ProjectCard';
import { SortTabs, TrackChips } from '@/app/components/directory/DirectoryControls';
import StaleBanner from '@/app/components/states/StaleBanner';
import EmptyResults from '@/app/components/states/EmptyResults';
import DirectorySkeleton from '@/app/components/states/DirectorySkeleton';
import './directory.css';

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
  const [{ items, fetched_at, account }, params, tally] = await Promise.all([
    getProjects(), searchParams, getVoteCounts(),
  ]);

  // Vote counts by submission_id (NH-33): active `vote/{id}` rows under the vote account, one per
  // voter, counted only for live projects. If the votes read fails the map is empty and the
  // status line says the tally is unavailable; the directory itself still renders.
  const votes: Votes = tally.counts;

  const { state, total, results, chips } = directoryView(items, params, votes);
  const fetched = formatFetchedUtc(fetched_at);
  const noVotesYet = state.sort === 'upvoted' && results.every((p) => !votes[p.submission_id]);

  return (
    <>
      <StaleBanner row />
      <section className="container dir-hero">
        <p className="dir-eyebrow">NEAR Hackathon · 1–14 Nov 2026</p>
        <h1>{total} projects. Upvote the ones you would actually use.</h1>
        <p className="dir-lede">
          Every project is an open record on NEAR. Every upvote is a transaction you sign, and every
          comment is a near.social post you own. Votes are community signals, not official judging.
        </p>
      </section>

      <section className="container dir-controls" aria-label="Find projects">
        <SearchBox q={state.q} track={state.track} sort={state.sort} total={total} />
        <div className="dir-tabs-row">
          <SortTabs state={state} />
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
          </p>

          {results.length > 0 ? (
            <ol className="dir-list">
              {results.map((item, i) => (
                <ProjectCard key={item.submission_id} item={item} rank={i + 1} votes={votes[item.submission_id] ?? 0} />
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
