import { createHmac } from 'node:crypto';
import type { SessionState } from 'survey-skipper';

/** Session events a webhook can receive. */
export type WebhookEvent = 'start' | 'answer' | 'complete';

export interface Webhook {
  url: string;
  /** Signs each delivery: `X-Survey-Skipper-Signature: sha256=<hex HMAC of the body>`. */
  secret?: string;
  /** Which events to send. Default `['complete']`. */
  events?: WebhookEvent[];
  /** Only send events for these definition ids. Default all. */
  definitions?: string[];
}

/** The JSON body POSTed to a webhook. */
export interface WebhookPayload {
  event: WebhookEvent;
  /** ISO 8601 time the event happened. */
  at: string;
  sessionId: string;
  definitionId: string | number | undefined;
  definitionVersion: string | number | undefined;
  /** The ending, for `complete`. */
  ending?: string;
  /** The question answered, for `answer`. */
  questionId?: string | number;
  /** The session's saved state after the event. */
  session: SessionState;
}

export interface WebhookOptions {
  /** Attempts per delivery, including the first. Default 3. */
  attempts?: number;
  /** Milliseconds before the first retry; doubles each time. Default 1000. */
  retryDelayMs?: number;
  /** Milliseconds before a delivery attempt times out. Default 10000. */
  timeoutMs?: number;
  /** Called when a delivery fails after every attempt. Default logs to `console.error`. */
  onError?: (error: Error, webhook: Webhook, payload: WebhookPayload) => void;
  fetch?: typeof fetch;
}

/** Signs a body the way deliveries are signed, for checking `X-Survey-Skipper-Signature` on the receiving side. */
export function signWebhook(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/**
 * Sends webhook deliveries in the background, retrying failures (non-2xx responses and network errors) with backoff.
 * `send` returns once every matching webhook has succeeded or used up its attempts.
 */
export class WebhookSender {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly webhooks: Webhook[],
    private readonly options: WebhookOptions = {},
  ) {}

  /** Starts delivering `payload` to every webhook that wants it. Doesn't wait for delivery. */
  dispatch(payload: WebhookPayload): void {
    for (const hook of this.webhooks) {
      if (!(hook.events ?? ['complete']).includes(payload.event)) {
        continue;
      }
      if (hook.definitions && !hook.definitions.includes(String(payload.definitionId))) {
        continue;
      }
      const delivery = this.deliver(hook, payload).finally(() => {
        this.pending.delete(delivery);
      });
      this.pending.add(delivery);
    }
  }

  /** Waits for every delivery in flight. Useful in tests and on shutdown. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  private async deliver(hook: Webhook, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'survey-skipper-server',
      'x-survey-skipper-event': payload.event,
    };
    if (hook.secret) {
      headers['x-survey-skipper-signature'] = signWebhook(body, hook.secret);
    }
    const attempts = Math.max(1, this.options.attempts ?? 3);
    const doFetch = this.options.fetch ?? fetch;
    let delay = this.options.retryDelayMs ?? 1000;
    let lastError: Error = new Error('No attempt made');
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await doFetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000) });
        if (res.ok) {
          return;
        }
        lastError = new Error(`Webhook ${hook.url} answered ${String(res.status)}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    (this.options.onError ?? ((error: Error) => { console.error(`survey-skipper-server: ${error.message}`); }))(lastError, hook, payload);
  }
}
