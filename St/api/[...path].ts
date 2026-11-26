import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.ts';

let appPromise: ReturnType<typeof createApp> | null = null;

function getHandler() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getHandler();
  app(req, res);
}