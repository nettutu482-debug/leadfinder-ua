import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let appInstancePromise: Promise<any> | null = null;

function findExistingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function resolveServerEntry(): { kind: 'ts' | 'cjs'; filePath: string } {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();

  const tsCandidates = [
    path.resolve(cwd, 'server/app.ts'),
    path.resolve(cwd, 'St/server/app.ts'),
    path.resolve(currentFileDir, '../server/app.ts'),
    path.resolve(currentFileDir, '../../server/app.ts'),
    path.resolve(currentFileDir, '../../../server/app.ts'),
    '/var/task/server/app.ts',
    '/var/task/St/server/app.ts',
  ];

  const foundTs = findExistingFile(tsCandidates);
  if (foundTs) {
    return { kind: 'ts', filePath: foundTs };
  }

  const cjsCandidates = [
    path.resolve(cwd, 'dist/server/app.cjs'),
    path.resolve(cwd, 'dist/server/app.js'),
    path.resolve(currentFileDir, '../dist/server/app.cjs'),
    path.resolve(currentFileDir, '../../dist/server/app.cjs'),
    '/var/task/dist/server/app.cjs',
  ];

  const foundCjs = findExistingFile(cjsCandidates);
  if (foundCjs) {
    return { kind: 'cjs', filePath: foundCjs };
  }

  throw new Error(
    `Could not locate server/app.ts. cwd=${cwd}, dir=${currentFileDir}, checked=${tsCandidates.join(', ')}`
  );
}

async function getExpressApp() {
  if (!appInstancePromise) {
    appInstancePromise = (async () => {
      const entry = resolveServerEntry();
      const require = createRequire(import.meta.url);

      let bundlePath = entry.filePath;
      if (entry.kind === 'ts') {
        bundlePath = '/tmp/leadfinder-server-bundle.cjs';
        await build({
          entryPoints: [entry.filePath],
          bundle: true,
          platform: 'node',
          format: 'cjs',
          outfile: bundlePath,
          external: ['pg-native'],
          logLevel: 'silent',
        });
      }

      delete require.cache[require.resolve(bundlePath)];
      const loaded = require(bundlePath);
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
