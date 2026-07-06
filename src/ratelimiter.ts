import { FetchRequest, FetchResponse, getWebhookId } from "./common.js";
import { IContext } from "./common.js";


interface RatelimiterItem {
  url: string,
  payload: string,
  onSuccess: () => void,
  onError: (msg: string) => void,
}

export class Ratelimiter {
  // FIFO queue
  queue: RatelimiterItem[] = [];
  // map of URLs to resetsAt epoch times.
  urlResets: Record<string, number> = {};
  start: number;

  constructor(start?: number) {
    this.start = start ?? this.getTime();
  }

  getTime(): number {
    return Date.now() / 1000;
  }

  sleep(ms: number): void {
    Utilities.sleep(ms)
  }

  /**
   * Attempt to perform request, returns true if the request should be retried.
   */
  private request(ctx: IContext, item: RatelimiterItem) {
    if (this.urlResets[item.url]) {
      return true;
    }
    let response: FetchResponse;
    try {
      response = ctx.fetch(item.url, {
        method: 'post',
        payload: item.payload,
        contentType: "application/json"
      } as FetchRequest);
    } catch (e) {
      const id = getWebhookId(item.url);
      item.onError(`Unable to make request to "${id}": ${e}`);
      return false;
    }
    
    const statusCode = response.getResponseCode().toString();
    const headers = response.getHeaders() as Record<string, string>;

    if (headers['x-ratelimit-remaining'] === '0') {
      this.addUrl(item.url, headers);
    }

    if (statusCode.startsWith('2')) {
      item.onSuccess();
      return false;
    }
    if (statusCode === '429') {
      this.addUrl(item.url, headers);
      return true;
    }
    item.onError(`Discord returned HTTP Status Code ${response.getResponseCode()}`);
    return false;
  }

  /** Tries an item, enqueuing it on failure and calling onSuccess on success */
  private tryRequest(ctx: IContext, item: RatelimiterItem) {
    if (this.request(ctx, item)) {
      this.queue.push(item);
    }
  }

  private addUrl(url: string, headers: Record<string, string>) {
    const reset = headers['x-ratelimit-reset']
    let time = 0;
    if (reset) {
      try {
        time = parseInt(reset);
      } catch (e) {
        console.warn(`Discord returned an invalid time: "${reset}"`);
      }
    }
    if (!time) {
      time = Math.ceil(this.getTime()) + 2;
    }
    this.urlResets[url] = time;
  }

  enqueue(
    ctx: IContext, url: string, payload: string, onSuccess?: () => void, onError?: (msg: string) => void
  ): void {
    this.tryRequest(ctx, {
      url,
      payload,
      onSuccess: onSuccess ?? (() => {}),
      onError: onError ?? (() => {})
    });
  }

  processQueue(ctx: IContext): boolean {
    const now = this.getTime();
    for (const [url, time] of Array.from(Object.entries(this.urlResets))) {
      if (time < now) {
        delete this.urlResets[url];
      }
    }

    const items = [...this.queue];
    this.queue.length = 0;
    for (const item of items) {
      this.tryRequest(ctx, item);
    }
    if (this.queue.length) {
      this.sleep(100);
    }
    return this.queue.length > 0;
  }
}

export class MockRatelimiter extends Ratelimiter {
  ms = 0;

  override getTime(): number {
    return this.start + this.ms;
  }

  override sleep(ms: number): void {
    this.ms += ms / 1000;
  }

  constructor(start: number){
    super(start);
  }
}
