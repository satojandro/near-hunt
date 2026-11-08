import { descriptionView } from '@/lib/project-view.mjs';
import s from './project.module.css';

export default function AboutCard({ description }: { description: string | null }) {
  const d = descriptionView(description);
  return (
    <section className={s.card} aria-labelledby="about-title">
      <h2 id="about-title" className={s.cardTitle}>About</h2>
      <p className={d.supplied ? s.about : `${s.about} ${s.notSupplied}`}>{d.text}</p>
    </section>
  );
}
