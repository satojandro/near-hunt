import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjects } from '@/lib/projects';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
import { isAccountId, relativeTime } from '@/lib/social.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import { accountComments, accountUpvotes, fetchAccountProfile, nsToMs, readAccountCommentRows, readAccountVoteRows } from '@/lib/account.mjs';
import { HIDDEN_COMMENTS } from '@/lib/comments';
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
 * NH-51: the account's active upvotes on live projects, newest first. `null` when the vote rows
 * or the project list could not be read: the page then says so instead of showing an empty list.
 */
async function loadUpvotes(accountId: string): Promise<UpvoteRow[] | null> {
  try {
    const [rows, { items }] = await Promise.all([
      readAccountVoteRows({
        accountId,
        account: VOTE_ACCOUNT,
        network: NETWORK,
        fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) }),
      }),
      getProjects(),
    ]);
    const now = Date.now();
    return accountUpvotes(rows, accountId, items).map((v) => {
      const ms = nsToMs(v.block_timestamp);
      return {
        id: v.id,
        name: v.project.name,
        tracks: v.project.tracks.map(trackLabel),
        when: ms ? `Upvoted ${relativeTime(ms, now)}` : null,
        block_height: v.block_height,
      };
    });
  } catch (err) {
    console.error('[account] upvotes read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * NH-52: the account's comments on live projects, newest first. Same contract as `loadUpvotes`:
 * `null` when the rows or the project list could not be read, so the page says so instead of
 * pretending the account has no comments. Hidden comments (repo hide list) and comments on
 * projects no longer in the feed are left out.
 */
async function loadComments(accountId: string): Promise<CommentRow[] | null> {
  try {
    const [rows, { items }] = await Promise.all([
      readAccountCommentRows({
        accountId,
        account: VOTE_ACCOUNT,
        network: NETWORK,
        fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) }),
      }),
      getProjects(),
    ]);
    const now = Date.now();
    return accountComments(rows, accountId, items, { hidden: HIDDEN_COMMENTS }).map((c) => ({
      id: c.id,
      projectId: c.project_id,
      projectName: c.project.name,
      text: c.text,
      when: c.created_at ? `Commented ${relativeTime(c.created_at, now)}` : null,
      block_height: c.block_height,
      url: c.url,
    }));
  } catch (err) {
    console.error('[account] comments read failed:', err instanceof Error ? err.message : err);
    return null;
  }
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
    showComments ? loadComments(account) : Promise.resolve([]),
  ]);

  return (
    <main className={`container ${s.page}`}>
      <ProfileHeader
        profile={profile}
        profileStatus={status}
        upvoteCount={upvotes ? upvotes.length : null}
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
            <CommentsList accountId={account} rows={comments} />
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
            <UpvotesList accountId={account} rows={upvotes} />
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
