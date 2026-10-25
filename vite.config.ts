import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error plain JS helper
import { adminEmails } from './scripts/admin-emails.mjs';

export default defineConfig({
  plugins: [react()],
  define: {
    __ADMIN_EMAILS__: JSON.stringify((adminEmails() as string[]).join(',')),
  },
});
