/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.nasa.gov' },
      { protocol: 'https', hostname: 'earthengine.googleapis.com' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' }
    ]
  }
};
module.exports = nextConfig;
