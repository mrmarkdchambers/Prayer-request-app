import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The app's name and colours live in brand.json. This fills them into
 * index.html and generates the install manifest, so renaming the app means
 * editing that one file.
 */
function brand(): Plugin {
  const load = () => JSON.parse(readFileSync(new URL('./brand.json', import.meta.url), 'utf8'));
  const manifest = () => {
    const b = load();
    return JSON.stringify(
      {
        name: b.name,
        short_name: b.shortName,
        description: b.description,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: b.themeColor,
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      null,
      2,
    );
  };
  return {
    name: 'brand',
    transformIndexHtml(html) {
      const b = load();
      return html
        .replaceAll('%APP_NAME%', b.name)
        .replaceAll('%APP_DESCRIPTION%', b.description)
        .replaceAll('%APP_THEME_COLOR%', b.themeColor);
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
    },
  };
}

/** Which commit this build came from (Netlify sets COMMIT_REF), shown in Settings. */
function buildVersion(): string {
  const fromHost = process.env.COMMIT_REF?.slice(0, 7);
  if (fromHost) return fromHost;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react(), brand()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely; keeping them separate lets browsers reuse them across app updates.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
