import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

let appInstancePromise: Promise<any> | null = null;

function resolveEntryPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'server/app.ts'),
    path.resolve(process.cwd(), 'St/server/app.ts'),
    path.resolve(__dirname, '../server/app.ts'),
    path.resolve(__dirname, '../../server/app.ts'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not locate server/app.ts. Checked: ${candidates.join(', ')}`);
}

async function getExpressApp() {
  if (!appInstancePromise) {
    appInstancePromise = (async () => {
      const entry = resolveEntryPath();
      const outfile = '/tmp/leadfinder-server-bundle.cjs';

      await build({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        external: ['pg-native'],
        logLevel: 'silent',
      });

      const require = createRequire(import.meta.url);
      delete require.cache[require.resolve(outfile)];
      const loaded = require(outfile);
      const createApp =
        loaded?.createApp ||
        loaded?.default?.createApp ||
        (typeof loaded?.default === 'function' ? loaded.default : null);

      if (typeof createApp !== 'function') {
        throw new Error('createApp function was not exported from server/app.ts');
      }

      return await createApp({ serveStatic: false });
    })();
  }
  return appInstancePromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getExpressApp();
    return app(req, res);
  } catch (err: any) {
    console.error('API serverless handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Server initialization failed',
        details: err?.message || String(err),
      })
    );
  }
}
