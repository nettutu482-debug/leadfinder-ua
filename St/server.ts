import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './server/app.ts';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  const distIndex = path.resolve(process.cwd(), 'dist', 'index.html');
  const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(distIndex);

  const app = await createApp({ serveStatic: !isDev });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LeadFinder server listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
