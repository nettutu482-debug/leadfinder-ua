import type { Express } from 'express';

export interface CreateAppOptions {
  serveStatic?: boolean;
}

export function createApp(options?: CreateAppOptions): Promise<Express>;
