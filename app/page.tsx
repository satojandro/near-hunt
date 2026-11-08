import { getProjects } from '@/lib/projects';

// Placeholder: the directory (NH-12..NH-14) replaces this.
export default async function Home() {
  const { items } = await getProjects();
  return (
    <main className="container">
      <h1>{items.length} projects</h1>
    </main>
  );
}
