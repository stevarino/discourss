/**
 * fetch.js - Network interfaces and functions.
 */
export class Fetcher {
    fetch(url, req) {
        return UrlFetchApp.fetch(url, req);
    }
}
