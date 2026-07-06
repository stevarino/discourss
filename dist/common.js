/**
 * common.js - common interfaces, types, and constants.
 */
import { version } from "./version.js";
/** If test is truthy, return test, otherwise return other (or undefined) */
export const DEFAULT_APP_NAME = 'DiscouRSS';
export function truthy(test, other) {
    if (test) {
        return test;
    }
    return other;
}
export function first(...tests) {
    for (const test of tests) {
        if (test)
            return test;
    }
    return undefined;
}
/**
 * Regex to extract webhook ID.
 * domain = discord | discordapp
 * https://{domain}.com/api/webhooks/{id}/{key}
 */
const DISCORD_URL_RE = new RegExp('^https://discord(?:app)?\\.com/api/webhooks/([^/]+)/.+');
export function getWebhookId(url) {
    var _a;
    return (_a = DISCORD_URL_RE.exec(url)) === null || _a === void 0 ? void 0 : _a[1];
}
export const CONFIG = {
    LOG_TO_STDERR: false,
    LOG_DEBUG: false,
    LIMIT_SAFETY_MARGIN: 0.9,
    RUNTIME: 27,
};
export function renderFeedCounters(counters) {
    const output = [];
    for (const [key, value] of Object.entries(counters)) {
        if (value) {
            output.push(`${value} ${key}`);
        }
    }
    if (output.length === 0) {
        return 'no';
    }
    return output.join('; ') + ' items';
}
export var STATUS;
(function (STATUS) {
    STATUS[STATUS["OK"] = 0] = "OK";
    STATUS[STATUS["SKIP"] = 1] = "SKIP";
    STATUS[STATUS["EMPTY"] = 2] = "EMPTY";
    STATUS[STATUS["ERROR"] = 3] = "ERROR";
    STATUS[STATUS["NONE"] = 4] = "NONE";
})(STATUS || (STATUS = {}));
;
export const SHEET_HEADERS = {
    index: {
        label: 'Index',
        help: '',
    },
    feed: {
        label: 'Feed',
        help: 'RSS URL',
    },
    discord: {
        label: 'Discord',
        help: 'User ID or Name',
    },
    time: {
        label: 'Time',
        help: 'Auto; Set blank for forced rescan',
    },
    guid: {
        label: 'GUID',
        help: 'Latest feed item; set to 0 to push all',
    },
    status: {
        label: 'Status',
        help: 'Last run status',
    },
};
export const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(v => v.help !== '').map(v => v.label);
export const HEADER_LOOKUP = Object.fromEntries(Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k]));
/**
 * Fetcher code
 */
/** Fetcher object for use in context. */
export class Fetcher {
    constructor() {
        var _a;
        this.default_params = {
            muteHttpExceptions: true,
            timeoutSeconds: 5,
        };
        this.default_http_headers = {
            "User-Agent": `DiscouRSS ${version} ${(_a = SpreadsheetApp === null || SpreadsheetApp === void 0 ? void 0 : SpreadsheetApp.getActive()) === null || _a === void 0 ? void 0 : _a.getId()} - https://discourss.stevarino.com`,
        };
    }
    fetch(url, req, log) {
        var _a, _b;
        log = log || (() => { });
        const headers = Object.assign({}, this.default_http_headers, (_a = req.headers) !== null && _a !== void 0 ? _a : {});
        req = Object.assign({}, this.default_params, req, { headers });
        if (CONFIG.LOG_DEBUG) {
            log(`Fetching ${url} - payload(${(_b = req.payload) === null || _b === void 0 ? void 0 : _b.length})`);
        }
        const res = UrlFetchApp.fetch(url, req);
        if (CONFIG.LOG_DEBUG) {
            const bytes = [0, ...res.getBlob().getBytes()].reduce((a, b) => a + b);
            log(`Response: ${res.getResponseCode()} (${bytes} bytes)`);
        }
        return res;
    }
}
