import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Enable React strict mode for better performance and error detection
  reactStrictMode: true,
  
  // Optimize production builds
  poweredByHeader: false,

  // Allow WalletConnect / RainbowKit popups (fixes COOP 404)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
  
  // Set workspace root to silence lockfile warning
  outputFileTracingRoot: path.join(__dirname, '..'),
  
  // Optimize page loading
  experimental: {
    optimizeCss: true,
  },
  
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies we don't use
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    
    // Optimize bundle size
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          default: false,
          vendors: false,
        },
      };
    }
    
    return config;
  },
}

export default nextConfig
