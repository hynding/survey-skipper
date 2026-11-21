#!/usr/bin/env node
import { createServer } from 'node:http';
import { MemoryStore } from 'survey-skipper';
import { FileStore } from './file-store.js';
import { createHandler } from './handler.js';
import type { WebhookEvent } from './webhooks.js';

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR;
const store = dataDir ? new FileStore(dataDir) : new MemoryStore();
const handler = createHandler({
  store,
  apiKey: process.env.API_KEY,
  corsOrigin: process.env.CORS_ORIGIN,
  webhooks: (process.env.WEBHOOK_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({
      url,
      secret: process.env.WEBHOOK_SECRET,
      events: (process.env.WEBHOOK_EVENTS ?? 'complete').split(',').map((e) => e.trim()) as WebhookEvent[],
    })),
});

createServer((req, res) => {
  void handler(req, res);
}).listen(port, () => {
  console.log(`survey-skipper-server on http://localhost:${String(port)} (${dataDir ? `data in ${dataDir}` : 'in-memory store'})`);
});
