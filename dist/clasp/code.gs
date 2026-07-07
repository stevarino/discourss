/**
 * Given a spreadsheet with a set of letterboxd RSS feeds, read the
 * feed and ping discord with any updates.
 * 
 * To manually test, run the function onTimer()
 * 
 * Requires library Cheerio: 1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0
 * 
 * Spreadsheet requirements:
 * 
 * A sheet called "feeds" with the headers listed below (Feed, Time, Discord,
 * GUID, Status). Order does not matter and you can have other columns. The
 * actual rows for each feed can be equations.
 * 
 * A sheet called "settings" with each row being a setting (no header needed).
 * See the Settings typedef below for what can be set.
 * 
 * Set this script up to run with the following triggers:
 * 
 *  - From Spreadsheet - On Open: 
 *    - function: onOpen
 *  - Time Based:
 *    - function: onTimer
 *    - frequency: recommend "Every 5 Minutes", script will rate limit itself
 *      through settings such as feed_limit and feed_frequency.
 */


const version = '1-783-406-812-042';

/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
const DEFAULT_APP_NAME = 'DiscouRSS';
function first(...tests) {
    for (const test of tests) {
        if (test)
            return test;
    }
    return undefined;
}
/** Returns "[SheetName:RowNum]" for a given feed. */
function renderLogHeader(feed) {
    const ws = feed.settings.worksheet;
    return `[${ws.getName()}:${feed.index + 1}]`;
}
/**
 * Regex to extract webhook ID.
 * domain = discord | discordapp
 * https://{domain}.com/api/webhooks/{id}/{key}
 */
const DISCORD_URL_RE = new RegExp('^https://discord(?:app)?\\.com/api/webhooks/([^/]+)/.+');
function getWebhookId(url) {
    var _a;
    return (_a = DISCORD_URL_RE.exec(url)) === null || _a === void 0 ? void 0 : _a[1];
}
const CONFIG = {
    LOG_TO_STDERR: false,
    LOG_DEBUG: false,
    LIMIT_SAFETY_MARGIN: 0.9,
    RUNTIME: 345, // 6 minutes, 15 seconds of safety
};
function renderFeedCounters(counters) {
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
var STATUS;
(function (STATUS) {
    STATUS[STATUS["OK"] = 0] = "OK";
    STATUS[STATUS["SKIP"] = 1] = "SKIP";
    STATUS[STATUS["EMPTY"] = 2] = "EMPTY";
    STATUS[STATUS["ERROR"] = 3] = "ERROR";
    STATUS[STATUS["NONE"] = 4] = "NONE";
})(STATUS || (STATUS = {}));
const SHEET_HEADERS = {
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
const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(v => v.help !== '').map(v => v.label);
const HEADER_LOOKUP = Object.fromEntries(Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k]));
/**
 * Fetcher code
 */
/** Fetcher object for use in context. */
class Fetcher {
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

class Ratelimiter {
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

/**
 * context.js - Context and Logging infrastructure.
 */
/** Purge logs every 10s */
const PURGE_INTERVAL = 5000;
var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
    LOG_LEVEL[LOG_LEVEL["DEBUG"] = 3] = "DEBUG";
})(LOG_LEVEL || (LOG_LEVEL = {}));
function errorToString(e) {
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
function errorToLogRecord(e, level) {
    return [Date.now(), level !== null && level !== void 0 ? level : LOG_LEVEL.ERROR, errorToString(e)];
}
function log(logs, message, level) {
    if (level === LOG_LEVEL.DEBUG && !CONFIG.LOG_DEBUG) {
        return;
    }
    if (!Array.isArray(message)) {
        message = errorToLogRecord(message, level !== null && level !== void 0 ? level : LOG_LEVEL.INFO);
    }
    if (CONFIG.LOG_TO_STDERR) {
        switch (message[1]) {
            case LOG_LEVEL.ERROR:
                console.error(LOG_LEVEL[message[1]], message[2]);
                break;
            case LOG_LEVEL.WARNING:
                console.warn(LOG_LEVEL[message[1]], message[2]);
                break;
            case LOG_LEVEL.INFO:
                console.info(LOG_LEVEL[message[1]], message[2]);
                break;
            case LOG_LEVEL.DEBUG:
                // no console.debug in AppsScript
                console.log(LOG_LEVEL[message[1]], message[2]);
                break;
            default:
                console.info(LOG_LEVEL[message[1]], message[2]);
        }
    }
    logs.push(message);
}
class Setting {
    constructor(value, validators) {
        this.value = value;
        this.validators = validators !== null && validators !== void 0 ? validators : [];
    }
    toString() {
        return JSON.stringify(this.value);
    }
    set(value) {
        if (typeof value !== typeof this.value) {
            return `Expected ${typeof this.value}, got ${typeof value}.`;
        }
        this.value = value;
        return this.validate();
    }
    get() {
        return this.value;
    }
    validate(value) {
        if (value === undefined) {
            value = this.value;
        }
        for (const [test, msg] of this.validators) {
            try {
                if (!test(value)) {
                    return msg;
                }
            }
            catch (e) {
                return errorToString(e);
            }
        }
        return undefined;
    }
}
/** Settings specific to a single sheet. */
class SheetSettings {
    constructor(worksheet) {
        this.feedHeaders = [];
        this.isSet = false;
        this.worksheet = worksheet;
        this.webhook = new Setting('', [
            [v => v !== '', 'Webhook must be set.'],
            [v => getWebhookId(v) !== undefined, 'Invalid discord hook URL'],
        ]);
        this.appname = new Setting('');
        this.avatar_url = new Setting('');
        this.signature = new Setting('%s Posted:');
        this.feed_pattern = new Setting('^https://');
        this.feed_limit = new Setting(5);
        this.feed_frequency = new Setting(3600);
        this.image_format = new Setting('image', [
            [(v) => ["image", "thumbnail", "none"].includes(v),
                'Value must be "image", "thumbnail", or "none".'],
        ]);
        this.bundle = new Setting(false);
        this.feedPatternRe = new RegExp(this.feed_pattern.value);
        this.settings = Object.fromEntries(Object.entries(this).filter(([_, v]) => v instanceof Setting));
        this.feedCount = this.feed_limit.value;
        this.loadSettings();
    }
    loadSettings() {
        var _a, _b;
        const json = (_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.getValue();
        if (!json) {
            return;
        }
        const settings = JSON.parse(json);
        const errors = this.validateSettings(settings);
        if (errors.length) {
            const msg = `Errors occurred during startup: ${errors.join('; ')}`;
            console.error(msg);
            return msg;
        }
        for (const [name, setting] of Object.entries(settings)) {
            (_b = this.settings[name]) === null || _b === void 0 ? void 0 : _b.set(setting);
        }
        this.isSet = true;
        return;
    }
    getSettings() {
        return Object.entries(this)
            .filter(([_, v]) => v instanceof Setting)
            .map(([k, v]) => [k, v.value]);
    }
    validateSettings(record) {
        const errors = [];
        // validate
        for (const [name, setting] of Object.entries(this)) {
            if (!(setting instanceof Setting)) {
                continue;
            }
            // testing each value regardless of if its trying to be set.
            const error = setting.validate(record[name]);
            if (error) {
                errors.push(`${name}: ${error}`);
            }
        }
        return errors;
    }
    setSettings(settings) {
        var _a, _b;
        const record = Object.fromEntries(settings);
        const errors = this.validateSettings(record);
        if (errors.length) {
            return errors;
        }
        const json = JSON.stringify(record);
        if (!((_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.setValue(json))) {
            (_b = this.worksheet) === null || _b === void 0 ? void 0 : _b.addDeveloperMetadata(DEFAULT_APP_NAME, json);
        }
        // set new settings (needed for tests?)
        this.loadSettings();
        return errors;
    }
    deleteSettings() {
        var _a;
        (_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.remove();
    }
    getMetadata() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.worksheet) === null || _a === void 0 ? void 0 : _a.createDeveloperMetadataFinder()) === null || _b === void 0 ? void 0 : _b.withKey(DEFAULT_APP_NAME).find()) === null || _c === void 0 ? void 0 : _c[0];
    }
}
class Context {
    constructor(spreadsheet, logs) {
        this.sheetSettings = {};
        this.logs = [];
        this.rateLimiter = new Ratelimiter();
        // https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
        this.limits = {
            CONTENT_LENGTH: 2000,
            DESC_LENGTH: 4096,
            EMBED_COUNT: 10,
            PAYLOAD_LENGTH: 6000,
        };
        this.defaults = [];
        this.fetcher = new Fetcher();
        this.now = Date.now() / 1000;
        this.purgedAt = Date.now() / 1000;
        this.spreadsheet = spreadsheet;
        if (logs !== undefined) {
            this.logs = logs;
        }
        this.defaults = new SheetSettings().getSettings();
        this.loadSettings();
    }
    loadSettings() {
        for (const sheet of this.spreadsheet.getSheets()) {
            this.sheetSettings[sheet.getSheetId()] = new SheetSettings(sheet);
        }
    }
    getSettings() {
        const settings = {};
        for (const [sheetId, value] of Object.entries(this.sheetSettings)) {
            settings[sheetId] = {
                sheetId: sheetId,
                name: value.worksheet.getName(),
                isSet: value.isSet,
                settings: value.getSettings(),
            };
        }
        return settings;
    }
    getSheetData(sheetId) {
        const record = this.sheetSettings[sheetId];
        if (!record) {
            throw new Error(`Sheet "${sheetId}" not found.`);
        }
        return {
            sheetId: sheetId,
            name: record.worksheet.getName(),
            isSet: record.isSet,
            settings: record.getSettings(),
        };
    }
    getWorksheet(sheetId) {
        var _a;
        return (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.worksheet;
    }
    setSettings(sheetId, values) {
        var _a, _b;
        return (_b = (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.setSettings(values)) !== null && _b !== void 0 ? _b : [`Unrecognized sheet: "${sheetId}"`];
    }
    deleteSettings(sheetId) {
        var _a;
        (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.deleteSettings();
    }
    reset(spreadsheet) {
        if (spreadsheet) {
            this.spreadsheet = spreadsheet;
        }
        this.sheetSettings = {};
        this.loadSettings();
    }
    fetch(url, params) {
        return this.fetcher.fetch(url, params !== null && params !== void 0 ? params : {}, (msg) => this.log(LOG_LEVEL.DEBUG, msg));
    }
    log(level, message) {
        log(this.logs, message, level);
        if (Date.now() / 1000 - this.purgedAt > PURGE_INTERVAL) {
            if (this.logger)
                this.logger(this.logs);
            this.logs.length = 0;
        }
    }
    error(message) {
        log(this.logs, message, LOG_LEVEL.ERROR);
    }
    warn(message) {
        log(this.logs, message, LOG_LEVEL.WARNING);
    }
    info(message) {
        log(this.logs, message, LOG_LEVEL.INFO);
    }
    debug(message) {
        log(this.logs, message, LOG_LEVEL.DEBUG);
    }
}

/**
 * sheets.js - functions related to processing the spreadsheet.
 */
const LOGS_TAB = 'Logs';
function newTextStyle() {
    return SpreadsheetApp.newTextStyle();
}
function setupFeedsTab(worksheet) {
    // Creates the Feeds tab and adds any missing columns.
    let lastCol = worksheet.getLastColumn();
    let range = worksheet.getDataRange();
    let values = range.getValues();
    // row A is identifier, row B is help text
    while (values.length < 2) {
        values.push([]);
    }
    // extend values array.
    for (let i = 0; i < values[0].length; i++) {
        for (let j = 0; j < 2; j++) {
            if (values[j].length == i) {
                values[j][i] = '';
            }
        }
    }
    // add missing columns
    const newData = [[], []];
    for (const header of EXPECTED_HEADERS) {
        if (!values[0].includes(header)) {
            const index = values[0].length;
            const { label, help } = SHEET_HEADERS[HEADER_LOOKUP[header]];
            values[0][index] = label;
            values[1][index] = help;
            newData[0].push(label);
            newData[1].push(help);
        }
    }
    if (newData[0].length > 0) {
        worksheet
            .getRange(1, lastCol + 1, 2, newData[0].length)
            .setValues(newData)
            .setBackground('#FF6600')
            .setTextStyle(newTextStyle()
            .setFontSize(16)
            .setBold(true)
            .setForegroundColor('#ffffff')
            .build());
        worksheet.getRange(2, lastCol + 1, 1, newData[0].length).setTextStyle(newTextStyle().setFontSize(10).setBold(false).build());
        worksheet.autoResizeColumns(lastCol + 1, newData[0].length);
        const columnWidthMults = [
            [SHEET_HEADERS.feed.label, 4],
            [SHEET_HEADERS.discord.label, 2],
            [SHEET_HEADERS.status.label, 8],
        ];
        for (const [label, mult] of columnWidthMults) {
            const feedIndex = newData[0].indexOf(label) + 1;
            if (feedIndex) {
                const width = worksheet.getColumnWidth(feedIndex + lastCol);
                worksheet.setColumnWidth(feedIndex + lastCol, width * mult + 5);
            }
        }
    }
}
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
function writeLogs(sheet, logs, logger) {
    if (!logger)
        logger = () => { };
    const header = ['epoch', 'DateTime (UTC)', 'Level', 'Message'];
    try {
        // let rows: CELL_VALUE[][] = [['epoch', 'DateTime (UTC)', 'Level', 'Message']];
        let tab = sheet.getSheetByName(LOGS_TAB);
        const colCount = header.length;
        let rowCount = 0;
        if (tab === null) {
            tab = sheet.insertSheet(LOGS_TAB);
            tab.getRange(1, 1, 1, colCount).setValues([header]);
            tab.autoResizeColumns(1, colCount);
            // expand the last columnn
            tab.setColumnWidth(colCount, tab.getColumnWidth(colCount) * 8);
        }
        const newRows = [header];
        // reverse and format logs
        for (let i = logs.length - 1; i >= 0; i--) {
            const log = logs[i];
            let isoTime = new Date(log[0]).toISOString().replace('T', ' ').split('.')[0];
            newRows.push([log[0], isoTime, LOG_LEVEL[log[1]], log[2]]);
        }
        const oldRange = tab.getDataRange();
        const oldRows = oldRange.getValues();
        rowCount = oldRows.length + 1;
        oldRange.clear();
        let cutoffTime = Date.now() - (7 * 24 * 3600);
        for (let i = 1; i < oldRows.length; i++) {
            const time = oldRows[i][0];
            if (typeof time === 'number' && cutoffTime < time) {
                newRows.push(oldRows[i]);
            }
        }
        // write values;
        tab.getRange(1, 1, newRows.length, newRows[0].length).setValues(newRows);
        tab.autoResizeRows(1, Math.max(newRows.length, rowCount));
        // wrap text logs
        tab.getRange(1, colCount, newRows.length, 1).setWrap(true).setVerticalAlignment('top');
    }
    catch (e) {
        // possibly no context
        logger(errorToString(e));
    }
}
function getFeedColumn(feedHeaders, header) {
    return feedHeaders.indexOf(header);
}
function readFeedsTabs(ctx) {
    const feeds = [];
    const webhooks = new Set();
    for (const settings of Object.values(ctx.sheetSettings)) {
        if (!settings.isSet || !settings.worksheet)
            continue;
        webhooks.add(settings.webhook.get());
        const values = settings.worksheet.getDataRange().getValues();
        for (let i = 0; i < values.length; i++) {
            // setup columns for dict-like lookup.
            if (values[i].includes(SHEET_HEADERS.feed.label)) {
                settings.feedHeaders.length = 0;
                settings.feedHeaders.push(...values[i]);
                const missing = [];
                for (const v of EXPECTED_HEADERS) {
                    if (!settings.feedHeaders.includes(v)) {
                        missing.push(v);
                    }
                }
                if (missing.length !== 0) {
                    throw new Error(`Missing required headers: ${JSON.stringify(missing)}`);
                }
                continue;
            }
            const feed = { index: i, settings };
            // iterate across the columns, using the header to map the value to the Feed object
            for (const [j, header] of settings.feedHeaders.entries()) {
                if (typeof header === 'string' && HEADER_LOOKUP[header] !== undefined) {
                    feed[HEADER_LOOKUP[header]] = values[i][j];
                }
            }
            if (!feed.feed) {
                continue;
            }
            if (typeof feed.time !== 'number') {
                feed.time = 0;
            }
            // skip feed that is not obvious feed url
            if (!settings.feedPatternRe.test(feed.feed)) {
                // entries with spaces are likely descriptions
                if (!feed.feed.includes(' ')) {
                    ctx.warn(`"${renderLogHeader(feed)}" failed to match ${settings.feedPatternRe.source}`);
                }
                continue;
            }
            feeds.push({
                ...feed,
                feed: feed.feed,
                time: feed.time,
                counters: { successful: 0, error: 0, unprocessed: 0, invalid: 0 }
            });
        }
    }
    const webhookIds = Array.from(webhooks).map(s => { var _a; return (_a = getWebhookId(s)) !== null && _a !== void 0 ? _a : '?'; });
    console.log(`webhookMap = ${JSON.stringify({ sheet: ctx.spreadsheet.getId(), webhookIds })}`);
    // earliest first
    feeds.sort((a, b) => a.time - b.time);
    return feeds;
}
function setFeedStatus(feed, ctx, status, guid) {
    const sheet = feed.settings.worksheet;
    const timeCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.time.label);
    const statusCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.status.label);
    const guidCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.guid.label);
    const maxCol = Math.max(timeCol, statusCol, guidCol);
    const range = sheet.getRange(feed.index + 1, 1, 1, maxCol + 1);
    if (!range) {
        throw new Error(`${renderLogHeader(feed)} could not get feed range: [${feed.index + 1}][1:${maxCol + 1}]`);
    }
    const msg = `${renderLogHeader(feed)} ${status}`;
    if (status.startsWith('ERROR')) {
        ctx.error(msg);
    }
    else {
        ctx.info(msg);
    }
    const data = range.getValues();
    data[0][timeCol] = Math.floor(ctx.now);
    data[0][statusCol] = status;
    if (guid !== undefined) {
        data[0][guidCol] = guid;
    }
    range.setValues(data);
}

/** Types of elements found in htmlparser2's DOM */
var ElementType;
(function (ElementType) {
    /** Type for the root element of a document */
    ElementType["Root"] = "root";
    /** Type for Text */
    ElementType["Text"] = "text";
    /** Type for <? ... ?> */
    ElementType["Directive"] = "directive";
    /** Type for <!-- ... --> */
    ElementType["Comment"] = "comment";
    /** Type for <script> tags */
    ElementType["Script"] = "script";
    /** Type for <style> tags */
    ElementType["Style"] = "style";
    /** Type for Any tag */
    ElementType["Tag"] = "tag";
    /** Type for <![CDATA[ ... ]]> */
    ElementType["CDATA"] = "cdata";
    /** Type for <!doctype ...> */
    ElementType["Doctype"] = "doctype";
})(ElementType || (ElementType = {}));
/**
 * Tests whether an element is a tag or not.
 * @param element Element to test
 * @param element.type Node type discriminator to check.
 */
function isTag$1(element) {
    return (element.type === ElementType.Tag ||
        element.type === ElementType.Script ||
        element.type === ElementType.Style);
}
// Exports for backwards compatibility
/** Type for the root element of a document */
// eslint-disable-next-line prefer-destructuring
ElementType.Root;
/** Type for Text */
// eslint-disable-next-line prefer-destructuring
ElementType.Text;
/** Type for <? ... ?> */
// eslint-disable-next-line prefer-destructuring
ElementType.Directive;
/** Type for <!-- ... --> */
// eslint-disable-next-line prefer-destructuring
ElementType.Comment;
/** Type for <script> tags */
// eslint-disable-next-line prefer-destructuring
ElementType.Script;
/** Type for <style> tags */
// eslint-disable-next-line prefer-destructuring
ElementType.Style;
/** Type for Any tag */
// eslint-disable-next-line prefer-destructuring
ElementType.Tag;
/** Type for <![CDATA[ ... ]]> */
// eslint-disable-next-line prefer-destructuring
ElementType.CDATA;
/** Type for <!doctype ...> */
// eslint-disable-next-line prefer-destructuring
ElementType.Doctype;

/**
 * Checks if `node` is an element node.
 * @param node Node to check.
 * @returns `true` if the node is an element node.
 */
function isTag(node) {
    return isTag$1(node);
}
/**
 * Checks if `node` is a CDATA node.
 * @param node Node to check.
 * @returns `true` if the node is a CDATA node.
 */
function isCDATA(node) {
    return node.type === ElementType.CDATA;
}
/**
 * Checks if `node` is a text node.
 * @param node Node to check.
 * @returns `true` if the node is a text node.
 */
function isText(node) {
    return node.type === ElementType.Text;
}

/**
 * markdown.js - Converts RSS HTML to Discord Markdown
 *
 * Odd things:
 *  - removes empty hyperlinks `[](https://...)`
 *  - does not render images
 *  - does not handle tables
 */
/** characters that need to be escaped. */
const TO_ESCAPE = /\*|_|\[/g;
/** String wrapper used to preserve whitespace */
class Markdown {
    constructor(text) {
        this.text = text;
    }
    toString() {
        return this.text;
    }
    replace(searchValue, replaceValue) {
        return new Markdown(this.text.replace(searchValue, replaceValue));
    }
}
/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
function nodeToMarkdown(doc) {
    return walkNodes(...doc.root().children());
}
function walkNodes(...nodes) {
    const parts = [];
    nodes.forEach(n => parts.push(...walkNode(n)));
    return flattenSeries(parts);
}
/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node, path) {
    path = path !== null && path !== void 0 ? path : [];
    if (isTag(node)) {
        // console.log({tag: node.tagName, path, pre, post});
        const txt = [];
        for (const child of node.childNodes) {
            txt.push(...walkNode(child, [...path, node.tagName]));
        }
        return elementToMarkdown(node, path, txt);
    }
    if (isCDATA(node)) {
        // untested - unsure if this is actually a thing?
        const children = [];
        for (const child of node.childNodes) {
            children.push(...walkNode(child, [...path, 'CDATA']));
        }
        return children;
    }
    if (isText(node)) {
        return [node.data
                .replace(TO_ESCAPE, m => `\\${m}`)
                .replace(/[ \n\t]+/mg, ' ')];
    }
    return [];
}
function flattenSeries(series) {
    // accumulator of continuous strings
    const strings = [];
    // final output markdown
    const markdown = [];
    // clears the strings array while returning the merged and normalized output.
    const mergeStrings = () => {
        const str = strings.join('')
            // collapse spaces around newlines
            .replace(/[ ]*\n[ ]*/g, '\n')
            // collapse spaces
            .replace(/[ ]{2,}/g, ' ');
        strings.length = 0;
        return str;
    };
    for (const part of series) {
        if (part instanceof Markdown) {
            markdown.push(mergeStrings(), part.toString());
        }
        else if (typeof part === 'string') {
            strings.push(part);
        }
    }
    markdown.push(mergeStrings());
    return markdown.join('')
        // trim beginnning newlines
        .replace(/^\s*\n/, '')
        // trim end whitespace
        .trimEnd()
        // trim end-of-line spaces
        .replace(/[ ]+\n/g, '\n')
        // collapse more than two newlines
        .replace(/\n{2,}/g, '\n\n');
}
// lists should have a double-newline if not embedded, but a
// single newline if embedded within another list. The first
// newline is optional, from the <ul> or <ol>, and the second
// is from the enclosed <li>..
const LIST_NL = (_, path) => {
    const lists = path.filter(p => p === 'ul' || p === 'ol');
    const nl = lists.length ? '' : '\n';
    return nl;
};
/** mapping of tag names to end bits. */
const elementParts = {
    br: ['', '\n'],
    p: ['\n\n', '\n\n'],
    b: ['**', '**'],
    i: ['*', '*'],
    u: ['__', '__'],
    a: [
        // if there's no child content, skip the link.
        el => walkNodes(...el.childNodes) === '' ? '' : '[',
        el => walkNodes(...el.childNodes) === '' ? '' : `](${el.attribs['href']})`
    ],
    ul: [LIST_NL, LIST_NL],
    ol: [LIST_NL, LIST_NL],
    li: [
        (_, path) => {
            // lists are indented by how deeply they are nested
            const lists = path.filter(p => p === 'ul' || p === 'ol');
            const depth = Math.max(0, lists.length - 1);
            const marker = lists[lists.length - 1] === 'ol'
                ? ' 1. ' : ' - ';
            return new Markdown('\n' + '  '.repeat(depth) + marker);
        }, '',
    ],
    blockquote: [
        '\n\n', '\n\n', (children) => {
            return [new Markdown(flattenSeries([new Markdown(' > '), ...children]).replace(/\n/g, '\n > '))];
        }
    ]
};
/**
 * given an element, return the pre and post bits
 */
function elementToMarkdown(node, path, children) {
    var _a;
    const [pre, post, content] = (_a = elementParts[node.tagName.toLocaleLowerCase()]) !== null && _a !== void 0 ? _a : [];
    const evalTerm = (term) => {
        if (typeof term === 'function') {
            return term(node, path, children);
        }
        return term !== null && term !== void 0 ? term : '';
    };
    return [
        evalTerm(pre),
        ...(content ? content(children) : children),
        evalTerm(post),
    ];
}

/**
 * rss.js - functions related to processing RSS feeds.
 */
/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
function processFeed(feed, ctx) {
    // skip feed that has recently been scanned
    const diff = ctx.now - feed.time;
    if (diff < feed.settings.feed_frequency.value) {
        ctx.info(`${renderLogHeader(feed)} - hit frequency limit of ${feed.settings.feed_frequency} seconds (${diff / 1000}s) - skipping`);
        return { status: STATUS.SKIP, status_text: '' };
    }
    ctx.info(`${renderLogHeader(feed)} - fetching`);
    const res = ctx.fetch(feed.feed);
    if (!String(res.getResponseCode()).startsWith('2')) {
        return {
            status: STATUS.ERROR,
            status_text: `HTTP Response code: ${res.getResponseCode()}`
        };
    }
    const text = res.getContentText();
    ctx.debug(`Received ${text.length} bytes`);
    return parseRssXml(text, feed, ctx);
}
function parseRssXml(content, feed, ctx) {
    var _a;
    const embeds = [];
    const doc = XmlService.parse(content.trim());
    const root = doc.getRootElement();
    if (!root) {
        throw Error('Failed to parse feed');
    }
    const channel = root.getChild('channel');
    if (!channel) {
        throw Error('channel element not found');
    }
    let firstGuid = '';
    let foundLast = false;
    let status = 'ok';
    const items = channel.getChildren("item");
    ctx.debug(`Loaded RSS: ${items.length} items`);
    if (items.length === 0) {
        firstGuid = '0';
        status = 'no items';
    }
    for (const item of items) {
        const guid = (_a = item.getChild('guid')) === null || _a === void 0 ? void 0 : _a.getText();
        // ctx.debug(`Found item: ${guid}`);
        if (!guid) {
            ctx.warn(`GUID not specified on feed item. Skipping.`);
            continue;
        }
        if (!firstGuid) {
            firstGuid = guid;
        }
        if (guid === feed.guid) {
            foundLast = true;
            break;
        }
        try {
            embeds.push(buildEmbed(ctx, feed.settings, item));
        }
        catch (e) {
            ctx.warn(`${renderLogHeader(feed)} [${guid}] Could not process embed: "${e}"`);
        }
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(feed.guid) !== '0') {
        status = 'new feed';
        embeds.length = 0;
    }
    else {
        status = `found ${embeds.length}`;
    }
    // oldest first
    embeds.reverse();
    ctx.debug(`Processed ${embeds.length} items`);
    const result = {
        status: STATUS.OK,
        status_text: status,
        guid: firstGuid,
        embeds: embeds,
    };
    feed.result = result;
    return result;
}
function buildEmbed(_, settings, xml) {
    var _a, _b, _c;
    const desc = xml.getChild('description');
    if (!desc) {
        throw new Error(`Missing description`);
    }
    const html = Cheerio.load(desc.getValue());
    const embed = {
        title: (_a = xml.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
        url: (_b = xml.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
        description: nodeToMarkdown(html),
        fields: [],
    };
    const pubDate = (_c = xml.getChild('pubDate')) === null || _c === void 0 ? void 0 : _c.getValue();
    if (pubDate) {
        try {
            const date = new Date(pubDate);
            const epoch = Math.floor(date.getTime() / 1000);
            embed._ts = epoch;
            embed.timestamp = date.toISOString();
        }
        catch (e) {
            console.warn(`Failed to parse pubDate: "${pubDate}"`);
        }
    }
    const image = html('img').attr('src');
    if (image) {
        if (settings.image_format.value == 'image') {
            embed.image = { url: image };
        }
        else if (settings.image_format.value == 'thumbnail') {
            embed.thumbnail = { url: image };
        }
    }
    // ctx.debug(`Created embed "${embed.title}" (${embed.url})`);
    return embed;
}

/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
const SAFETY_MARGIN = 0.9;
const URL_ROOT = 'https://discourss.stevarino.com/feeds/';
class Domain {
    constructor(regex, logo, appname) {
        this.regex = regex;
        this.appname = appname;
        this.logo = URL_ROOT + logo;
    }
}
const KNOWN_DOMAINS = [
    new Domain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
    new Domain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];
function findDomainFromURL(url) {
    for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
        if (KNOWN_DOMAINS[i].regex.test(url)) {
            return i;
        }
    }
    return -1;
}
/**
 * https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
 */
function getSafeLimits(ctx) {
    return Object.fromEntries(Object.entries(ctx.limits).map(([k, v]) => [k, Math.floor(v * SAFETY_MARGIN)]));
}
/** Normalizes messages and splits them up by feed limits. */
function normalizeMessages(ctx, feed, embeds) {
    var _a, _b;
    const feedPayloads = [];
    const limits = getSafeLimits(ctx);
    const message = { embeds };
    const settings = feed.settings;
    let user = String((_a = feed.discord) !== null && _a !== void 0 ? _a : '');
    // is feed.discord a Discord User ID?
    if (/^[0-9]+$/.test(user)) {
        message.allowed_mentions = { users: [user] };
        user = `<@${user}>`;
    }
    if (settings.signature.value) {
        user = settings.signature.value.replace('%s', user);
    }
    if ((user).length > limits.CONTENT_LENGTH) {
        user = user.slice(0, limits.CONTENT_LENGTH - 3) + '...';
    }
    message.content = user;
    const domain = KNOWN_DOMAINS[findDomainFromURL(feed.feed)];
    message.avatar_url = first(settings.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
    message.username = first(settings.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname, DEFAULT_APP_NAME);
    const initialLength = feedPayloads.length;
    if (settings.bundle.value) {
        // bundling, so fit as many embedded messages into a request as possible.
        for (const splitMsg of splitMessageByEmbeds(message, limits)) {
            for (const feedPayload of splitMessageByPayloadSize(ctx, feed, splitMsg, limits)) {
                feedPayloads.push(feedPayload);
            }
        }
    }
    else {
        // not bundling, split the messages up, one embed per message.
        for (const embed of message.embeds) {
            const payload = stringify({ ...message, embeds: [embed] });
            feedPayloads.push({ feed, payload, epoch: (_b = embed._ts) !== null && _b !== void 0 ? _b : 0 });
        }
    }
    feed.counters.unprocessed = feedPayloads.length - initialLength;
    return feedPayloads;
}
function splitMessageByEmbeds(message, limits) {
    const messages = [message];
    while (message.embeds.length > limits.EMBED_COUNT) {
        const embeds = message.embeds;
        message.embeds = embeds.slice(0, limits.EMBED_COUNT);
        message = { ...message, embeds: embeds.slice(limits.EMBED_COUNT) };
        messages.push(message);
    }
    return messages;
}
function splitMessageByPayloadSize(ctx, feed, message, limits) {
    var _a, _b;
    const payload = stringify(message);
    if (payload.length <= limits.PAYLOAD_LENGTH) {
        return [{ feed, epoch: (_b = (_a = message.embeds[0]) === null || _a === void 0 ? void 0 : _a._ts) !== null && _b !== void 0 ? _b : 0, payload }];
    }
    /** output collection */
    const payloads = [];
    // since we just care about string lengths, we're going to work in that rather
    // than converting back and fourth.
    const emptyPayload = stringify({ ...message, embeds: [] });
    const target = '"embeds":[';
    const index = emptyPayload.indexOf(target);
    if (index === -1) {
        // something really really broke.
        throw new Error(`'Unable to find target in payload: ${emptyPayload}`);
    }
    const payloadPre = emptyPayload.slice(0, index + target.length);
    const payloadPost = emptyPayload.slice(index + target.length);
    /** How many characters we have to work with */
    const budget = limits.PAYLOAD_LENGTH - emptyPayload.length;
    const embeds = [...message.embeds];
    const stagedPayloads = [];
    /** Earliest epoch in a bundle */
    let epoch = undefined;
    while (embeds.length > 0) {
        const embed = embeds.pop();
        const payload = stringify(embed);
        if (payload.length > budget) {
            feed.counters.invalid += 1;
            ctx.warn(`Embed skipped due to length (${payload.length} > ${budget})`);
            continue;
        }
        const extra = payload.length + 1;
        const total = stagedPayloads.length === 0 ? 0 : (stagedPayloads.map(s => s.length).reduce((a, b) => a + b)) + stagedPayloads.length;
        if (total + extra > budget) {
            payloads.push({
                feed,
                epoch: epoch !== null && epoch !== void 0 ? epoch : 0,
                payload: `${payloadPre}${stagedPayloads.join(',')}${payloadPost}`
            });
            stagedPayloads.length = 0;
            epoch = undefined;
        }
        if (embed._ts) {
            epoch = Math.min(embed._ts, epoch !== null && epoch !== void 0 ? epoch : embed._ts);
        }
        stagedPayloads.push(payload);
    }
    if (stagedPayloads.length) {
        payloads.push({
            feed,
            epoch: epoch !== null && epoch !== void 0 ? epoch : 0,
            payload: `${payloadPre}${stagedPayloads.join(',')}${payloadPost}`
        });
    }
    return payloads;
}
/** Calls JSON.stringify, filtering out hidden fields. */
function stringify(obj) {
    return JSON.stringify(obj, (key, val) => key.startsWith('_') ? undefined : val);
}

/**
 * index.js - main entry point for code
 */
CONFIG.LOG_TO_STDERR = false;
CONFIG.LOG_DEBUG = false;
/** A common execution wrapper. Handles context and logging. */
function wrapper(method, ctx, func) {
    const spreadsheet = SpreadsheetApp.getActive();
    const logs = [];
    try {
        if (!ctx) {
            ctx = new Context(spreadsheet, logs);
        }
        ctx.logger = (logs) => writeLogs(spreadsheet, logs, (log) => ctx.error(log));
        // apply safety tolerance (90%);
        ctx.limits = Object.fromEntries(Object.entries(ctx.limits).map(([k, v]) => [k, Math.floor(v * CONFIG.LIMIT_SAFETY_MARGIN)]));
        if (method) {
            ctx.info(`--- START ${method} (${version}) ---`);
            console.log(`starting: ${method} ${spreadsheet.getId()} (${version})`);
        }
        return func(ctx);
    }
    catch (e) {
        log(logs, errorToString(e), LOG_LEVEL.ERROR);
    }
    finally {
        log(logs, 'Finished', LOG_LEVEL.DEBUG);
        if (logs.length) {
            writeLogs(spreadsheet, logs, console.error);
        }
    }
    return null;
}
/** Scan the Feeds table, read RSS feeds, and write to Discord. */
function execute(ctx) {
    var _a, _b, _c, _d;
    const feeds = readFeedsTabs(ctx);
    ctx.info(`Found ${feeds.length} RSS feeds`);
    const requests = [];
    for (const feed of feeds) {
        let result;
        try {
            result = processFeed(feed, ctx);
        }
        catch (e) {
            // even if we fail we want to count it.
            const err = errorToString(e);
            setFeedStatus(feed, ctx, `ERROR: RSS feed (uncaught): ${err}`);
            continue;
        }
        if (result.status === STATUS.SKIP) {
            continue;
        }
        if (result.status === STATUS.ERROR) {
            setFeedStatus(feed, ctx, `ERROR: RSS feed: ${result.status_text}`, result.guid);
            continue;
        }
        if (((_b = (_a = result.embeds) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) === 0) {
            setFeedStatus(feed, ctx, `${result.status}: ${result.status_text}`, result.guid);
            continue;
        }
        requests.push(...normalizeMessages(ctx, feed, result.embeds));
        feed.settings.feedCount -= 1;
        if (feed.settings.feedCount <= 0) {
            break;
        }
    }
    requests.sort((a, b) => a.epoch - b.epoch);
    const feedSet = new Set(feeds.filter(f => f.counters.unprocessed));
    // perform requests with ratelimiter
    for (const request of requests) {
        const webhook = request.feed.settings.webhook.get();
        const onSuccess = () => {
            request.feed.counters.unprocessed -= 1;
            request.feed.counters.successful += 1;
        };
        const onError = (msg) => {
            request.feed.counters.unprocessed -= 1;
            request.feed.counters.error += 1;
            ctx.error(`${renderLogHeader(request.feed)} ${msg}.`);
        };
        ctx.rateLimiter.enqueue(ctx, webhook, request.payload, onSuccess, onError);
    }
    // check each RSS Feed status until done, periodically retrying requests
    while (feedSet.size > 0 && ctx.rateLimiter.getTime() - (ctx.now) < CONFIG.RUNTIME) {
        for (const feed of Array.from(feedSet)) {
            if (feed.counters.unprocessed === 0) {
                const msg = `OK: ${renderFeedCounters(feed.counters)}`;
                setFeedStatus(feed, ctx, msg, (_c = feed.result) === null || _c === void 0 ? void 0 : _c.guid);
                ctx.info(`${renderLogHeader(feed)} ${msg}.`);
                feedSet.delete(feed);
            }
        }
        ctx.rateLimiter.processQueue(ctx);
    }
    for (const feed of feedSet) {
        const msg = `ERROR: Did not finish items: ${renderFeedCounters(feed.counters)}`;
        setFeedStatus(feed, ctx, msg, (_d = feed.result) === null || _d === void 0 ? void 0 : _d.guid);
    }
}
/** Ran when opened. Permissions are in an indeterminate state here. */
function onOpen() {
    SpreadsheetApp.getUi()
        .createAddonMenu()
        .addItem('Show sidebar', 'showSidebar')
        .addToUi();
}
/** Ran when user clicks "Run" in the sidebar. */
function run(ctx) {
    wrapper('run', ctx, (ctx) => {
        execute(ctx);
    });
}
/** User submits settings from sidebar. Returns errors. */
function setSettings(req) {
    return wrapper('setSettings', undefined, (ctx) => {
        const sheet = ctx.spreadsheet.getSheetById(parseInt(req.sheetId));
        if (!sheet) {
            alert('ERROR: Sheet not found.');
            return {};
        }
        if (req.isNew) {
            if (!sheet)
                return { errors: ['Could not find sheet'] };
            if (sheet.getLastRow()) {
                const res = alert(`Worksheet ${sheet.getName()} is not empty. Clear it now?`, 'YES_NO_CANCEL');
                if (res === 'CANCEL')
                    return {};
                if (res === 'YES')
                    sheet.clear();
            }
            setupFeedsTab(sheet);
        }
        const errors = ctx.setSettings(req.sheetId, req.fields);
        if (errors === null || errors === void 0 ? void 0 : errors.length) {
            alert(`Errors occurred during saving:\n\n • ${errors.join('\n • ')}`);
            return {};
        }
        ctx.info(`[${sheet.getName()}${req.isNew ? ' (new)' : ''}] Settings updated.`);
        return {
            sheetData: ctx.getSheetData(req.sheetId),
        };
    });
}
/** Show the sidebar, duh. :P */
function showSidebar() {
    SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('sidebar').setTitle(DEFAULT_APP_NAME));
}
/** Sidebar has requested data. */
function getSidebarData() {
    return wrapper('', undefined, (ctx) => {
        return {
            // NOTE: sheetId is a string, not a number, as object keys are coerced
            // into strings (or Symbols) and sheetId is often used as a Record key.
            sheetId: String(SpreadsheetApp.getActive().getActiveSheet().getSheetId()),
            version,
            timer: Boolean(getTimer()),
            sheets: ctx.getSettings(),
        };
    });
}
/** Finds the timer trigger. */
function getTimer() {
    let timer = undefined;
    for (const trigger of ScriptApp.getProjectTriggers()) {
        if (trigger.getHandlerFunction() === 'DiscouRSSTimer') {
            ScriptApp.deleteTrigger(trigger);
        }
        if (trigger.getHandlerFunction() === discourssTimerTrigger.name) {
            timer = trigger;
        }
    }
    return timer;
}
/** Enable or Disable the timer. */
function toggleTimer() {
    return wrapper('toggleTimer', undefined, () => {
        const timer = getTimer();
        if (timer) {
            ScriptApp.deleteTrigger(timer);
            return false;
        }
        ScriptApp.newTrigger(discourssTimerTrigger.name).timeBased().everyHours(1).create();
        return true;
    });
}
/** Timer execution. */
function discourssTimerTrigger() {
    wrapper('timer', undefined, ctx => {
        execute(ctx);
    });
}
function alert(msg, buttonset) {
    const ui = SpreadsheetApp.getUi();
    let btn;
    if (buttonset) {
        btn = SpreadsheetApp.getUi().alert(msg, ui.ButtonSet[buttonset]);
    }
    else {
        btn = SpreadsheetApp.getUi().alert(msg);
    }
    return btn.toString();
}
function deleteSettings(sheetId) {
    return wrapper('deleteSettings', undefined, ctx => {
        var _a;
        const sheet = ctx.getWorksheet(sheetId);
        ctx.deleteSettings(sheetId);
        ctx.info(`[${(_a = sheet === null || sheet === void 0 ? void 0 : sheet.getName()) !== null && _a !== void 0 ? _a : sheetId})] Settings deleted.`);
        ctx.loadSettings();
        return { sheetData: ctx.getSheetData(sheetId) };
    });
}
function pollCurrentSheet() {
    const ss = SpreadsheetApp.getActive();
    return {
        // NOTE: sheetId is a string, not a number, as object keys are coerced
        // into strings (or Symbols) and sheetId is often used as a Record key.
        sheetId: String(ss.getActiveSheet().getSheetId()),
        version: version,
        sheetNames: ss.getSheets().map(s => [String(s.getSheetId()), s.getName()]),
    };
}
/** HTTP endpoint. Currently unsued. */
function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}


