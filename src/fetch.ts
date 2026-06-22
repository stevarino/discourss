/**
 * fetch.js - Network interfaces and functions.
 */

export class Fetcher {
  fetch(url: string, req: FetchRequest): FetchResponse {
    return UrlFetchApp.fetch(url, req);
  }
}

export interface FetchRequest {
  method?: 'get'|'post',
  payload?: string,
  muteHttpExceptions?: boolean,
  contentType?: string,
}

export interface FetchResponse {
  getResponseCode(): number
  getContentText(): string;
}