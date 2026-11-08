import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { trackLabel } from '@/lib/tracks.mjs';
import { metaDescription } from '@/lib/project-view.mjs';
import ProjectHeader from '@/app/components/project/ProjectHeader';
import AboutCard from '@/app/components/project/AboutCard';
import LinksCard from '@/app/components/project/LinksCard';
import RecordCard from '@/app/components/project/RecordCard';
import UpvoteButton from '@/app/components/vote/UpvoteButton';
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

/** `/p/{submission_id}` — NH-20 (project details) and NH-21 (on-chain record). */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

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
          // TODO(NH-33): pass the tally count
          <UpvoteButton projectId={project.submission_id} initialCount={0} variant="page" projectName={project.name} />
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
          {/* NH-22 (Upvoted by), NH-23 (Similar projects), NH-24 (Claim) go here. */}
        </aside>
      </div>
    </main>
  );
}
