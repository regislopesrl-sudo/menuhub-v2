const apiTarget = process.env.API_V2_INTERNAL_URL || 'http://menuhub-api-v2-dev:3202';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api-v2/:path*',
        destination: `${apiTarget}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
