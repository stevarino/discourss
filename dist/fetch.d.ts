/**
 * fetch.js - Network interfaces and functions.
 */
export declare class Fetcher {
    fetch(url: string, req: FetchRequest): FetchResponse;
}
export interface FetchRequest {
    method?: 'get' | 'post';
    payload?: string;
    muteHttpExceptions?: boolean;
    contentType?: string;
}
export interface FetchResponse {
    getResponseCode(): number;
    getContentText(): string;
}
