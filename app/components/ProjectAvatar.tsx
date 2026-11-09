// Letter tile used on cards and the project page (mockup boards 1 and 2, themes README §3).
// The colour pair comes from the project's first track (lib/tints.mjs); a project that lists no
// track still gets a stable tile, from a hash of its id.
import { tintIndex } from '@/lib/tints.mjs';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export default function ProjectAvatar({
  id, name, track, size = 48,
}: { id: string; name: string; track?: string | null; size?: number }) {
  const tint = track ? tintIndex(track) : (hash(id) % 6) + 1;
  const letter = (name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`tint-${tint}`}
      style={{
        width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)',
        fontWeight: 'var(--display-weight)', fontSize: Math.round(size * 0.42),
      }}
    >
      {letter}
    </span>
  );
}
