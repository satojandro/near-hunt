import Link from 'next/link';
import s from '@/app/components/project/project.module.css';

export default function ProjectNotFound() {
  return (
    <main className={`container ${s.notFound}`}>
      <h1>Project not found</h1>
      <p>
        There is no project record with this id written by nearhunt.near. The link may be mistyped,
        or the project is not in the hackathon feed.
      </p>
      <Link href="/" className={s.homeBtn}>Browse all projects</Link>
    </main>
  );
}
