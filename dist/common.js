/**
 * common.js - common interfaces, types, and constants.
 */
export const DEFAULT_APP_NAME = 'DiscouRSS';
export var STATUS;
(function (STATUS) {
    STATUS[STATUS["OK"] = 0] = "OK";
    STATUS[STATUS["SKIP"] = 1] = "SKIP";
    STATUS[STATUS["EMPTY"] = 2] = "EMPTY";
    STATUS[STATUS["ERROR"] = 3] = "ERROR";
    STATUS[STATUS["NONE"] = 4] = "NONE";
})(STATUS || (STATUS = {}));
;
export var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
})(LOG_LEVEL || (LOG_LEVEL = {}));
;
export function errorToString(e) {
    // LOG_RECORD
    if (Array.isArray(e) && typeof e[2] === 'string') {
        return e[2];
    }
    if (e instanceof Error) {
        if (e.stack) {
            return `${e.message}\n${e.stack}`;
        }
        return e.message;
    }
    return `${e}`;
}
export function errorToLogRecord(e, level) {
    return [new Date().getTime(), level !== null && level !== void 0 ? level : LOG_LEVEL.ERROR, errorToString(e)];
}
export function log(logs, message, level) {
    if (!Array.isArray(message)) {
        message = errorToLogRecord(message, level !== null && level !== void 0 ? level : LOG_LEVEL.INFO);
    }
    logs.push(message);
}
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
        help: 'Latest review; set to 0 to push all',
    },
    status: {
        label: 'Status',
        help: 'Last run status',
    },
};
export const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(v => v.help !== '').map(v => v.label);
export const HEADER_LOOKUP = Object.fromEntries(Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k]));
