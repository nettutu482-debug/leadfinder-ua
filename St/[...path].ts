import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './_app.mjs';

export const config = {
  api: {
    bodyParser: false,
  },
};

let appPromise: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveStatic: false }).catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  return app(req, res);
}
