import { IContext } from "./common.js";
interface RatelimiterItem {
    url: string;
    payload: string;
    onSuccess: () => void;
    onError: (msg: string) => void;
}
export declare class Ratelimiter {
    queue: RatelimiterItem[];
    urlResets: Record<string, number>;
    start: number;
    constructor(start?: number);
    getTime(): number;
    sleep(ms: number): void;
    /**
     * Attempt to perform request, returns true if the request should be retried.
     */
    private request;
    /** Tries an item, enqueuing it on failure and calling onSuccess on success */
    private tryRequest;
    private addUrl;
    enqueue(ctx: IContext, url: string, payload: string, onSuccess?: () => void, onError?: (msg: string) => void): void;
    processQueue(ctx: IContext): boolean;
}
export declare class MockRatelimiter extends Ratelimiter {
    ms: number;
    getTime(): number;
    sleep(ms: number): void;
    constructor(start: number);
}
export {};
