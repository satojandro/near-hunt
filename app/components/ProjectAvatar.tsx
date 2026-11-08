// Letter tile used on cards and the project page (mockup boards 1 and 2).
const PALETTE = [
  { bg: '#E6F4EE', fg: '#0A7F5A' },
  { bg: '#EAF0FC', fg: '#2557C7' },
  { bg: '#FDF0E4', fg: '#A04A00' },
  { bg: '#F1ECFB', fg: '#6A3FC1' },
  { bg: '#FCEBEE', fg: '#B42345' },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export default function ProjectAvatar({ id, name, size = 48 }: { id: string; name: string; size?: number }) {
  const { bg, fg } = PALETTE[hash(id) % PALETTE.length];
  const letter = (name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: Math.round(size * 0.42), background: bg, color: fg,
      }}
    >
      {letter}
    </span>
  );
}
