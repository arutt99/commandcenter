import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['exceljs', 'pg'],
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};
export default config;
