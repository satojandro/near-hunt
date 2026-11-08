import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject, getProjects } from '@/lib/projects';
import { getVoters } from '@/lib/votes';
import { trackLabel } from '@/lib/tracks.mjs';
import { metaDescription } from '@/lib/project-view.mjs';
import ProjectHeader from '@/app/components/project/ProjectHeader';
import AboutCard from '@/app/components/project/AboutCard';
import LinksCard from '@/app/components/project/LinksCard';
import RecordCard from '@/app/components/project/RecordCard';
import UpvotedBy from '@/app/components/project/UpvotedBy';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
import SimilarProjects from '@/app/components/project/SimilarProjects';
import ClaimCard from '@/app/components/project/ClaimCard';
import s from '@/app/components/project/project.module.css';

type Props = { params: Promise<{ id: string }> };

// No loading.tsx on purpose: a streamed fallback would commit a 200 before notFound() can set 404.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return { title: 'Project not found', robots: { index: false } };
  const description = metaDescription(project, trackLabel);
  return {
    title: project.name,
    description,
    alternates: { canonical: `/p/${encodeURIComponent(project.submission_id)}` },
    openGraph: { title: project.name, description, type: 'website' },
  };
}

/** `/p/{submission_id}` — NH-20 (details), NH-21 (on-chain record), NH-33 (count), NH-22 (voters). */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  // NH-33: active votes for this project (one per voter account). `available` is false when the
  // votes read failed; the page still renders, without a number.
  const { voters, count, available: votesAvailable } = await getVoters(project.submission_id);
  // NH-23: the same cached list getProject just read.
  const { items: allProjects } = await getProjects();

  return (
    <main className={`container ${s.page}`}>
      <nav aria-label="Breadcrumb" className={s.crumbs}>
        <Link href="/">Projects</Link>
        <span aria-hidden="true">/</span>
        <span className={s.crumbCurrent} aria-current="page">{project.name}</span>
      </nav>
      <ProjectHeader
        project={project}
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
          <LinksCard project={project} />
          {/* NH-41/42: discussion thread goes here. */}
        </div>
        <aside className={s.side} aria-label="Record details">
          <RecordCard project={project} />
          <UpvotedBy voters={voters} available={votesAvailable} />
          <SimilarProjects project={project} all={allProjects} />
          <ClaimCard />
        </aside>
      </div>
    </main>
  );
}
