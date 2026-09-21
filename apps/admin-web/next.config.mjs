/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Import menu ze zdjęć wysyła kilka kadrów naraz w jednym wywołaniu akcji serwerowej;
      // domyślny limit 1 MB ucinał je błędem 400 jeszcze przed dotarciem do API.
      bodySizeLimit: '24mb',
    },
  },
  async rewrites() {
    const apiUrl = process.env.ADMIN_API_URL || 'http://localhost:3001'
    return [
      {
        source: '/v1/storage/:path*',
        destination: `${apiUrl.replace(/\/$/, '')}/v1/storage/:path*`,
      },
    ]
  },
}

export default nextConfig
