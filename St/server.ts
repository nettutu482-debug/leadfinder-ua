import 'dotenv/config';
import { createApp } from './server/app.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = await createApp({ serveStatic: true });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LeadFinder server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});