import { FetchRequest, FetchResponse, getWebhookId } from "./common.js";
import { Context } from "./context.js";

interface RatelimiterItem {
  url: string,
  payload: string,
}

export class Ratelimiter {
  // FIFO queue
  queue: RatelimiterItem[] = [];
  // map of URLs to resetsAt epoch times.
  urlResets: Record<string, number> = {};

  getTime = (): number => new Date().getTime() / 1000;

  sleep = (ms: number): void => Utilities.sleep(ms)

  /**
   * Attempt to perform request, returns true if the request should be retried.
   */
  private request(ctx: Context, item: RatelimiterItem) {
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
      console.warn(`Unable to make request to "${id}": ${e}`);
      return false;
    }
    
    const statusCode = response.getResponseCode().toString();
    const headers = response.getHeaders() as Record<string, string>;

    if (headers['x-ratelimit-remaining'] === '0') {
      this.addUrl(item.url, headers);
    }

    if (statusCode.startsWith('2')) {
      return false;
    }
    if (statusCode === '429') {
      this.addUrl(item.url, headers);
      return true;
    }
    ctx.warn(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`)
    return false;
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

  enqueue(ctx: Context, url: string, payload: string): void {
    const item: RatelimiterItem = {url, payload}
    if (this.request(ctx, item)) {
      this.queue.push(item);
    }
  }

  processQueue(ctx: Context): void {
    const now = this.getTime();
    for (const [url, time] of Array.from(Object.entries(this.urlResets))) {
      if (time < now) {
        delete this.urlResets[url];
      }
    }

    const items = [...this.queue];
    this.queue.length = 0;
    for (const item of items) {
      if (!this.request(ctx, item)) {
        this.queue.push(item);
      }
    }
    if (this.queue.length) {
      this.sleep(100);
    }
  }
}
