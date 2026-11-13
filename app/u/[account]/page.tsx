import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjects } from '@/lib/projects';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
import { isAccountId, relativeTime } from '@/lib/social.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import { accountComments, accountUpvotes, fetchAccountProfile, nsToMs, readAccountCommentRows, readAccountVoteRows } from '@/lib/account.mjs';
import { HIDDEN_COMMENTS, getAllCommentRows } from '@/lib/comments';
import { safeVoteRows } from '@/lib/votes';
import { staleCopyText } from '@/lib/freshness.mjs';
import ProfileHeader from '@/app/components/account/ProfileHeader';
import ViewCount from '@/app/components/project/ViewCount';
import UpvotesList, { type UpvoteRow } from '@/app/components/account/UpvotesList';
import CommentsList, { type CommentRow } from '@/app/components/account/CommentsList';
import s from '@/app/components/account/account.module.css';

type Props = {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/** Per-request timeout for the account's vote read: a slow indexer must not hold the page. */
const VOTES_TIMEOUT_MS = 5000;

// No loading.tsx on purpose: a streamed fallback would commit a 200 before notFound() can set 404.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { account } = await params;
  if (!isAccountId(account)) return { title: 'Account not found', robots: { index: false } };
  return {
    title: account,
    description: `Projects ${account} upvoted and comments it wrote on NEAR Hunt. Votes and comments are rows the account wrote on NEAR, read from the public FastData index.`,
    alternates: { canonical: `/u/${account}` },
    robots: { index: false },
  };
}

/**
 * A list for this page, and whether it came from a saved copy. `saved` is true when the account's
 * own rows could not be read and the list was cut from the all-accounts rows instead (the same
 * rows the directory counts come from: the cache, or the stored copy in lib/snapshot.mjs).
 * `savedAt` is when those rows were read.
 */
type Loaded<T> = { rows: T[]; saved: boolean; savedAt: string | null };

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) });

/** The live project list, or null when not even a copy of it exists. */
const liveProjects = () => getProjects().then((list) => list.items, () => null);

/**
 * NH-51: the account's active upvotes on live projects, newest first.
 *
 * When the account's own vote rows cannot be read, the list is cut from the all-accounts vote rows
 * and marked `saved`: the voter is still each row's `predecessor_id` (`accountUpvotes` filters on
 * it), so this is the same list, as of an earlier read. `null` only when there is no copy either,
 * or no project list: the page then says so instead of showing an empty list.
 */
async function loadUpvotes(accountId: string): Promise<Loaded<UpvoteRow> | null> {
  const projects = liveProjects();
  let rows: Parameters<typeof accountUpvotes>[0];
  let saved = false;
  let savedAt: string | null = null;
  try {
    rows = await readAccountVoteRows({ accountId, account: VOTE_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
  } catch (err) {
    console.error('[account] upvotes read failed:', err instanceof Error ? err.message : err);
    const copy = await safeVoteRows();
    if (!copy.available) return null;
    rows = copy.rows;
    saved = true;
    savedAt = copy.fetched_at;
  }
  const items = await projects;
  if (!items) return null;
  const now = Date.now();
  return {
    saved,
    savedAt,
    rows: accountUpvotes(rows, accountId, items).map((v) => {
      const ms = nsToMs(v.block_timestamp);
      return {
        id: v.id,
        name: v.project.name,
        tracks: v.project.tracks.map(trackLabel),
        when: ms ? `Upvoted ${relativeTime(ms, now)}` : null,
        block_height: v.block_height,
      };
    }),
  };
}

/**
 * NH-52: the account's comments on live projects, newest first. Same contract as `loadUpvotes`,
 * falling back to the all-accounts comment rows (the author is each row's `predecessor_id`;
 * `accountComments` filters on it). Hidden comments (repo hide list) and comments on projects no
 * longer in the feed are left out.
 */
async function loadComments(accountId: string): Promise<Loaded<CommentRow> | null> {
  const projects = liveProjects();
  let rows: Parameters<typeof accountComments>[0];
  let saved = false;
  let savedAt: string | null = null;
  try {
    rows = await readAccountCommentRows({ accountId, account: VOTE_ACCOUNT, network: NETWORK, fetchImpl: timedFetch });
  } catch (err) {
    console.error('[account] comments read failed:', err instanceof Error ? err.message : err);
    const copy = await getAllCommentRows();
    if (!copy.available) return null;
    rows = copy.rows;
    saved = true;
    savedAt = copy.fetched_at;
  }
  const items = await projects;
  if (!items) return null;
  const now = Date.now();
  return {
    saved,
    savedAt,
    rows: accountComments(rows, accountId, items, { hidden: HIDDEN_COMMENTS }).map((c) => ({
      id: c.id,
      projectId: c.project_id,
      projectName: c.project.name,
      text: c.text,
      when: c.created_at ? `Commented ${relativeTime(c.created_at, now)}` : null,
      block_height: c.block_height,
      url: c.url,
    })),
  };
}

/** `/u/{account}` — Board 3: NH-50 (header), NH-51 (upvotes), NH-53 (remove), NH-52 (comments tab). */
export default async function AccountPage({ params, searchParams }: Props) {
  const { account } = await params;
  if (!isAccountId(account)) notFound();
  const { tab } = await searchParams;
  const showComments = tab === 'comments';

  const [{ status, profile }, upvotes, comments] = await Promise.all([
    fetchAccountProfile(account),
    loadUpvotes(account),
    showComments ? loadComments(account) : Promise.resolve(null),
  ]);

  return (
    <main className={`container ${s.page}`}>
      <ProfileHeader
        profile={profile}
        profileStatus={status}
        upvoteCount={upvotes ? upvotes.rows.length : null}
        views={<ViewCount path={`/u/${account}`} />}
      />

      <nav className={s.tabs} aria-label="Account activity">
        <Link
          href={`/u/${account}`}
          className={`${s.tab} ${showComments ? '' : s.tabActive}`}
          aria-current={showComments ? undefined : 'page'}
          scroll={false}
        >
          Upvoted
        </Link>
        <Link
          href={`/u/${account}?tab=comments`}
          className={`${s.tab} ${showComments ? s.tabActive : ''}`}
          aria-current={showComments ? 'page' : undefined}
          scroll={false}
        >
          Comments
        </Link>
      </nav>

      {showComments ? (
        <section aria-label="Comments">
          {comments === null ? (
            <p className={s.empty} role="status">
              Comments unavailable right now: the NEAR index could not be read. Try again in a minute.
            </p>
          ) : (
            <>
              {comments.saved ? (
                <p className={s.note} role="status">
                  A saved copy of this list, {staleCopyText(comments.savedAt)}: the NEAR index did not answer.
                  Comments posted since then may not appear yet.
                </p>
              ) : null}
              <CommentsList accountId={account} rows={comments.rows} />
            </>
          )}
          <p className={s.note}>
            Comments are rows this account wrote to {VOTE_ACCOUNT} on NEAR {NETWORK} (keys comment/…).
            Only the author can delete one; comments on projects no longer in the feed, and comments on
            NEAR Hunt&apos;s hide list, are not shown.
          </p>
        </section>
      ) : (
        <section aria-label="Upvoted projects">
          {upvotes === null ? (
            <p className={s.empty} role="status">
              Upvotes unavailable right now: the NEAR index could not be read. Try again in a minute.
            </p>
          ) : (
            <>
              {upvotes.saved ? (
                <p className={s.note} role="status">
                  A saved copy of this list, {staleCopyText(upvotes.savedAt)}: the NEAR index did not answer.
                  Upvotes cast since then may not appear yet.
                </p>
              ) : null}
              <UpvotesList accountId={account} rows={upvotes.rows} />
            </>
          )}
          <p className={s.note}>
            Votes are rows this account wrote to {VOTE_ACCOUNT} on NEAR {NETWORK} (keys vote/…). Votes for
            projects no longer in the feed are not shown.
          </p>
        </section>
      )}
    </main>
  );
}
