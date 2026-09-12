/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
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
