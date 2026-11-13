import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, getProjects } from '@/lib/projects';
import { getVoters } from '@/lib/votes';
import { getProjectComments } from '@/lib/comments';
import { trackLabel } from '@/lib/tracks.mjs';
import { metaDescription } from '@/lib/project-view.mjs';
import { mediaView } from '@/lib/media.mjs';
import ProjectHeader from '@/app/components/project/ProjectHeader';
import ViewCount from '@/app/components/project/ViewCount';
import AboutCard from '@/app/components/project/AboutCard';
import LinksCard from '@/app/components/project/LinksCard';
import MediaCard from '@/app/components/project/MediaCard';
import RecordCard from '@/app/components/project/RecordCard';
import UpvotedBy from '@/app/components/project/UpvotedBy';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
import SimilarProjects from '@/app/components/project/SimilarProjects';
import ClaimCard from '@/app/components/project/ClaimCard';
import StaleBanner from '@/app/components/states/StaleBanner';
import Discussion from '@/app/components/discussion/Discussion';
import s from '@/app/components/project/project.module.css';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ claim?: string | string[] }> };

// No loading.tsx on purpose: a streamed fallback would commit a 200 before notFound() can set 404.
// If the KV API is unreachable and there is no copy to serve, getProject throws and ./error.tsx
// says the project could not be loaded (never "not found").

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id).catch(() => undefined);
  if (project === undefined) return { title: 'Project unavailable', robots: { index: false } };
  if (!project) return { title: 'Project not found', robots: { index: false } };
  const description = metaDescription(project, trackLabel);
  // NH-96: the builder's own image (or video poster) as the share preview, when the record has one.
  const cover = mediaView(project)[0];
  const images = cover ? [{ url: cover.full, alt: cover.alt }] : undefined;
  return {
    title: project.name,
    description,
    alternates: { canonical: `/p/${encodeURIComponent(project.submission_id)}` },
    openGraph: { title: project.name, description, type: 'website', images },
    twitter: { card: cover ? 'summary_large_image' : 'summary', title: project.name, description, images: images?.map((i) => i.url) },
  };
}

/** `/p/{submission_id}` — NH-20 (details), NH-21 (on-chain record), NH-33 (count), NH-22 (voters). */
export default async function ProjectPage({ params, searchParams }: Props) {
  const { id } = await params;
  // NH-119: the claim callback returns here with its outcome in `?claim=`.
  const { claim } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();

  // NH-33: active votes for this project (one per voter account). `available` is false when the
  // votes read failed; the page still renders, without a number.
  const { voters, count, available: votesAvailable, stale: votesStale, fetched_at: votesFetchedAt } = await getVoters(project.submission_id);
  // NH-43: the record card shows the same comment count as the directory card (one cached read,
  // shared with the Discussion card below).
  const comments = await getProjectComments(project.submission_id);
  // NH-23: the same cached list getProject just read.
  const { items: allProjects } = await getProjects();

  return (
    <main className={`container ${s.page}`}>
      <StaleBanner />
      <nav aria-label="Breadcrumb" className={s.crumbs}>
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <span className={s.crumbCurrent} aria-current="page">{project.name}</span>
      </nav>
      <ProjectHeader
        project={project}
        extra={<ViewCount path={`/p/${project.submission_id}`} />}
        actions={
          votesAvailable ? (
            <UpvoteButton projectId={project.submission_id} initialCount={count} variant="page" projectName={project.name} />
          ) : (
            <p className={s.voteCount} title="Upvote counts are unavailable right now">Upvotes unavailable</p>
          )
        }
      />
      <div className={s.grid}>
        <div className={s.main}>
          <AboutCard description={project.description} />
          <MediaCard media={project.media} />
          <LinksCard project={project} />
          <Discussion projectId={project.submission_id} />
        </div>
        <aside className={s.side} aria-label="Record details">
          <RecordCard project={project} comments={comments.count} commentsAvailable={comments.available} />
          <UpvotedBy voters={voters} available={votesAvailable} stale={votesStale} fetchedAt={votesFetchedAt} />
          <SimilarProjects project={project} all={allProjects} />
          <ClaimCard project={project} outcome={typeof claim === 'string' ? claim : undefined} />
        </aside>
      </div>
      {/* NH-71: the same UpvoteButton in a bar pinned to the bottom on phones; hidden on desktop. */}
      {votesAvailable ? (
        <div className={s.stickyVote}>
          <UpvoteButton projectId={project.submission_id} initialCount={count} variant="page" projectName={project.name} />
        </div>
      ) : null}
    </main>
  );
}
