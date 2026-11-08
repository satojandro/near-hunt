import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';

// Placeholder: NH-20/NH-21 replace this.
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <main className="container">
      <h1>{project.name}</h1>
    </main>
  );
}
