import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const securityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const previewSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; connect-src 'self' https: wss:; font-src 'self' data: https://fonts.gstatic.com; form-action 'self' https:; frame-ancestors 'none'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
};

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  envDir: '..',
  plugins: [react()],
  server: { headers: securityHeaders },
  preview: { headers: previewSecurityHeaders },
});
