import { getWebhookId } from "./common.js";
export class Ratelimiter {
    constructor(start) {
        // FIFO queue
        this.queue = [];
        // map of URLs to resetsAt epoch times.
        this.urlResets = {};
        this.start = start !== null && start !== void 0 ? start : this.getTime();
    }
    getTime() {
        return Date.now() / 1000;
    }
    sleep(ms) {
        Utilities.sleep(ms);
    }
    /**
     * Attempt to perform request, returns true if the request should be retried.
     */
    request(ctx, item) {
        if (this.urlResets[item.url]) {
            return true;
        }
        let response;
        try {
            response = ctx.fetch(item.url, {
                method: 'post',
                payload: item.payload,
                contentType: "application/json"
            });
        }
        catch (e) {
            const id = getWebhookId(item.url);
            item.onError(`Unable to make request to "${id}": ${e}`);
            return false;
        }
        const statusCode = response.getResponseCode().toString();
        const headers = response.getHeaders();
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
    tryRequest(ctx, item) {
        if (this.request(ctx, item)) {
            this.queue.push(item);
        }
    }
    addUrl(url, headers) {
        const reset = headers['x-ratelimit-reset'];
        let time = 0;
        if (reset) {
            try {
                time = parseInt(reset);
            }
            catch (e) {
                console.warn(`Discord returned an invalid time: "${reset}"`);
            }
        }
        if (!time) {
            time = Math.ceil(this.getTime()) + 2;
        }
        this.urlResets[url] = time;
    }
    enqueue(ctx, url, payload, onSuccess, onError) {
        this.tryRequest(ctx, {
            url,
            payload,
            onSuccess: onSuccess !== null && onSuccess !== void 0 ? onSuccess : (() => { }),
            onError: onError !== null && onError !== void 0 ? onError : (() => { })
        });
    }
    processQueue(ctx) {
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
    getTime() {
        return this.start + this.ms;
    }
    sleep(ms) {
        this.ms += ms / 1000;
    }
    constructor(start) {
        super(start);
        this.ms = 0;
    }
}
