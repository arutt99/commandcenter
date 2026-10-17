import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['exceljs', '@libsql/client', 'libsql'],
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};
export default config;
