import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createFetchHandler, type FetchHandlerOptions } from './fetch.js';
import { WebhookSender, type Webhook } from './webhooks.js';

export { view, type QuestionView, type SessionView } from './fetch.js';

export interface HandlerOptions extends Omit<FetchHandlerOptions, 'onEvent'> {
  /** URLs to POST session events to. See {@link Webhook}. */
  webhooks?: Webhook[] | WebhookSender;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/**
 * Creates a Node `http` request handler for the survey API. Pass it to `http.createServer`. It wraps
 * {@link createFetchHandler}, which lists the routes, and sends webhooks.
 */
export function createHandler(options: HandlerOptions): Handler {
  const { webhooks: hooks, ...rest } = options;
  const webhooks = hooks instanceof WebhookSender ? hooks : new WebhookSender(hooks ?? []);
  const handle = createFetchHandler({
    ...rest,
    onEvent: (payload) => {
      webhooks.dispatch(payload);
    },
  });

  return async (req, res) => {
    const method = req.method ?? 'GET';
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    const init: RequestInit & { duplex?: 'half' } = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
      init.duplex = 'half';
    }
    const response = await handle(new Request(new URL(req.url ?? '/', 'http://localhost'), init));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
