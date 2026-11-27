import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';

let appInstancePromise: Promise<any> | null = null;

async function getExpressApp() {
  if (!appInstancePromise) {
    appInstancePromise = createApp({ serveStatic: false });
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
