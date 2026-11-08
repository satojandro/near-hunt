import s from './states.module.css';

const ROWS = 7;
const CHIPS = 6;

/**
 * NH-80: directory placeholder while the project list loads (mockup States.png, first panel).
 * Same outer layout as the directory so nothing jumps when the real page replaces it.
 */
export default function DirectorySkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="visually-hidden">Loading projects…</p>
      <div className={`container ${s.skHero}`} aria-hidden="true">
        <span className={s.bone} style={{ height: 14, width: 220 }} />
        <span className={s.bone} style={{ height: 36, width: 'min(560px, 90%)' }} />
        <span className={s.boneSoft} style={{ height: 16, width: 'min(680px, 100%)' }} />
      </div>
      <div className={`container ${s.skControls}`} aria-hidden="true">
        <span className={`${s.boneSoft} ${s.skSearch}`} />
        <div className={s.skRow}>
          {Array.from({ length: CHIPS }, (_, i) => <span key={i} className={`${s.boneSoft} ${s.skChip}`} />)}
        </div>
      </div>
      <div className={`container ${s.skMain}`} aria-hidden="true">
        <ul className={s.skList}>
          {Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className={s.skCard}>
              <span className={`${s.bone} ${s.skAvatar}`} />
              <span className={s.skLines}>
                <span className={s.bone} style={{ height: 12, width: `${80 - (i % 3) * 12}%` }} />
                <span className={s.boneSoft} style={{ height: 10, width: '50%' }} />
              </span>
              <span className={`${s.boneSoft} ${s.skVote}`} />
            </li>
          ))}
        </ul>
        <span className={`${s.boneSoft} ${s.skAside}`} />
      </div>
    </div>
  );
}
