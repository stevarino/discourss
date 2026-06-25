/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
export function truthy(test, other) {
    if (test) {
        return test;
    }
    return other;
}
export const CONFIG = {
    LOG_TO_STDERR: false,
};
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
    fetch(url, req) {
        return UrlFetchApp.fetch(url, req);
    }
}
