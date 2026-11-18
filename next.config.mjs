/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // NH-116: the headers that cannot break a page. A full Content-Security-Policy is left out on
  // purpose: the wallet selector, X's embed and the analytics script each load from other origins,
  // and a wrong policy would break signing days before the deadline.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Nobody may put NEAR Hunt in a frame: a framed "Upvote" button is a clickjacking target.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // NH-127: let the CDN answer repeat visitors without invoking a function.
      //
      // Why it matters for money, not just speed: the listing copy in Upstash is 1,091,521 B stored
      // at 2,356 rows, and a *cold* function instance downloads all of it. Upstash's free plan is
      // 10 GB of bandwidth a month, so ~9,000 cold reads (~300/day) is the whole allowance — the
      // number that got the database suspended on 18 Nov. Caching the HTML at the edge means a
      // repeat request never starts a function at all, so it never pays that read.
      //
      // The cache is honest with the site's own rules: the walker refreshes the listing every 60 s
      // and anything older than 180 s is labelled, so a 60 s HTML lifetime can never present a page
      // older than one walk as current. `stale-while-revalidate` keeps the visitor off the critical
      // path while the CDN refreshes in the background.
      //
      // Every query string is its own cache entry, so `?sort=`, `?q=`, `?track=` and the claim
      // callback's `?claim=` never share a body. Nothing on these pages is per-visitor: the wallet
      // and the upvote button are client components, and the server render is identical for
      // everyone.
      {
        source: '/',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' }],
      },
      {
        source: '/p/:id',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' }],
      },
      {
        source: '/u/:account',
        headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' }],
      },
    ];
  },
};

export default nextConfig;
