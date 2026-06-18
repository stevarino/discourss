export const DEFAULT_APP_NAME = 'Sheets RSS to Discord';
export const FEEDS_TAB = 'feeds';
export const SETTINGS_TAB = 'settings';
export const LOGS_TAB = 'logs';
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
export var SETTINGS_FIELDS;
(function (SETTINGS_FIELDS) {
    SETTINGS_FIELDS["appname"] = "appname";
    SETTINGS_FIELDS["avatar_url"] = "avatar_url";
    SETTINGS_FIELDS["webhook"] = "webhook";
    SETTINGS_FIELDS["signature"] = "signature";
    SETTINGS_FIELDS["image_format"] = "image_format";
    SETTINGS_FIELDS["bundle"] = "bundle";
    SETTINGS_FIELDS["feed_pattern"] = "feed_pattern";
    SETTINGS_FIELDS["feed_limit"] = "feed_limit";
    SETTINGS_FIELDS["feed_frequency"] = "feed_frequency";
})(SETTINGS_FIELDS || (SETTINGS_FIELDS = {}));
export const DEFAULT_SETTINGS = {
    now: 0,
    appname: 'Sheets RSS',
    signature: '%s Posted:',
    feed_pattern: '^https://',
    feed_limit: 5,
    feed_frequency: 3600,
    image_format: 'image',
    bundle: false,
    feed_pattern_re: new RegExp('^https://'),
    fetch: (url, params) => UrlFetchApp.fetch(url, params),
    logs: [],
    log: function (level, message) { this.logs.push([new Date().getTime(), level, message]); },
    error: function (message) { this.log(LOG_LEVEL.ERROR, message); },
    warn: function (message) { this.log(LOG_LEVEL.WARNING, message); },
    info: function (message) { this.log(LOG_LEVEL.INFO, message); },
};
export function getDefaultSettings() {
    // return a new Settings object.
    return {
        ...DEFAULT_SETTINGS,
        now: new Date().getTime(),
    };
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
