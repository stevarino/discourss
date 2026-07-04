import { Context } from "./context.js";
interface RatelimiterItem {
    url: string;
    payload: string;
}
export declare class Ratelimiter {
    queue: RatelimiterItem[];
    urlResets: Record<string, number>;
    getTime: () => number;
    sleep: (ms: number) => void;
    /**
     * Attempt to perform request, returns true if the request should be retried.
     */
    private request;
    private addUrl;
    enqueue(ctx: Context, url: string, payload: string): void;
    processQueue(ctx: Context): void;
}
export {};
