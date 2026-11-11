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
    ];
  },
};

export default nextConfig;
