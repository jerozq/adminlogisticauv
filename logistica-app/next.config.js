/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export' eliminado — incompatible con middleware
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  // Incluir archivos estáticos no-JS en el bundle serverless de Vercel
  outputFileTracingIncludes: {
    '/api/generar-cotizacion': ['./templates/**'],
  },
  turbopack: {
    root: require('path').resolve(__dirname, '..'),
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          }
        ],
      },
    ]
  },
}

module.exports = nextConfig
