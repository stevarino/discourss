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


const version = '1-782-872-582-997';

/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
const DEFAULT_APP_NAME = 'DiscouRSS';
function truthy(test, other) {
    if (test) {
        return test;
    }
    return other;
}
const CONFIG = {
    LOG_TO_STDERR: false,
    LOG_DEBUG: false,
};
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
    return [new Date().getTime(), level !== null && level !== void 0 ? level : LOG_LEVEL.ERROR, errorToString(e)];
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
// https://discordapp.com/api/webhooks/.../...
// https://discord.com/api/webhooks/.../...
const DISCORD_URL_RE = new RegExp('^https://discord(app)?\\.com/api/webhooks/.*');
/** Settings specific to a single sheet. */
class SheetSettings {
    constructor(worksheet) {
        this.feedHeaders = [];
        this.isSet = false;
        this.worksheet = worksheet;
        this.webhook = new Setting('', [
            [v => v !== '', 'Webhook must be set.'],
            [v => DISCORD_URL_RE.test(String(v)), 'Invalid discord hook URL'],
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
        this.defaults = [];
        this.fetcher = new Fetcher();
        this.now = new Date().getTime();
        this.purgedAt = new Date().getTime();
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
        if (new Date().getTime() - this.purgedAt > PURGE_INTERVAL) {
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
 * sheegts.js - functions related to processing the spreadsheet.
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
            .setBackground('#4285f4')
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
                worksheet.setColumnWidth(feedIndex + lastCol, width * mult);
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
        let cutoffTime = new Date().getTime() - (7 * 24 * 3600 * 1000);
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
function readFeedsTab(ctx) {
    const feeds = [];
    for (const settings of Object.values(ctx.sheetSettings)) {
        if (!settings.isSet || !settings.worksheet)
            continue;
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
            // console.log(values[i].map(String).join('\t'));
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
                    ctx.warn(`"${feed.feed}" failed to match ${settings.feedPatternRe.source}`);
                }
                continue;
            }
            feeds.push(feed);
        }
    }
    // earliest first
    feeds.sort((a, b) => a.time - b.time);
    return feeds;
}
function updateFeedsTab(feed, column, value) {
    var _a, _b;
    const col = getFeedColumn(feed.settings.feedHeaders, column.label);
    (_b = (_a = feed.settings.worksheet) === null || _a === void 0 ? void 0 : _a.getRange(feed.index + 1, col + 1, 1, 1)) === null || _b === void 0 ? void 0 : _b.setValues([[value]]);
    return;
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
/**
 * Walks through a given cheerio node, doing a simple markdown conversion.
 */
function nodeToMarkdown(doc) {
    return walkNodes(...doc.root().children());
}
function walkNodes(...nodes) {
    return nodes.map(n => walkNode(n).join('')).join('').trim()
        // collapse spaces around newlines
        .replace(/[ ]*\n[ ]*/g, '\n')
        // collapse spaces
        .replace(/[ ]{2,}/g, ' ');
}
/**
 * Recursively walks through a given node, returning text nodes.
 */
function walkNode(node, path) {
    path = path !== null && path !== void 0 ? path : [];
    if (isTag(node)) {
        const [pre, post] = getEndBits(node);
        const txt = [pre];
        for (const child of node.childNodes) {
            txt.push(...walkNode(child, [...path, node.tagName]));
        }
        txt.push(post);
        // console.log([...path, node.tagName].join('.'), JSON.stringify(txt));
        return txt;
    }
    if (isCDATA(node)) {
        const children = [];
        for (const child of node.childNodes) {
            children.push(...walkNode(child, [...path, 'CDATA']));
        }
        return children;
    }
    if (isText(node)) {
        return [node.data
                .replace(markdownChars, match => `\\${match}`)
                .replace(/[ \n\t]+/mg, ' ')];
    }
    return [];
}
/** mapping of tag names to end bits. */
const endBits = {
    p: ['', '\n\n'],
    br: ['', '\n'],
    b: ['**', '**'],
    i: ['*', '*'],
    u: ['__', '__'],
    a: [
        // if there's no child content, skip the link.
        el => walkNodes(...el.childNodes) === '' ? '' : '[',
        el => walkNodes(...el.childNodes) === '' ? '' : `](${el.attribs['href']})`
    ],
};
/**
 * given an element, return the pre and post bits
 */
function getEndBits(node) {
    var _a;
    return ((_a = endBits[node.tagName.toLocaleLowerCase()]) !== null && _a !== void 0 ? _a : ['', '']).map(bit => typeof bit === 'function' ? bit(node) : bit);
}
/** characters that need to be escaped. */
const markdownChars = /\*|_|\[/g;

/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
const URL_ROOT = 'https://discourss.stevarino.com/feeds/';
function makeDomain(regex, logo, appname) {
    return { regex, appname, logo: URL_ROOT + logo };
}
const KNOWN_DOMAINS = [
    makeDomain(/:\/\/[^/]*goodreads.com/, 'goodreads.png', 'Goodreads RSS'),
    makeDomain(/:\/\/[^/]*letterboxd.com/, 'letterboxd.png', 'Letterboxd RSS'),
];
/**
 * Finds the index of the homogenous domain in embeds, or undefined if not
 * found or not homogenous.
 */
function findDomain(embeds) {
    var _a;
    const set = new Set(embeds.map((e) => {
        var _a;
        for (let i = 0; i < KNOWN_DOMAINS.length; i++) {
            if (KNOWN_DOMAINS[i].regex.test((_a = e.url) !== null && _a !== void 0 ? _a : '')) {
                return i;
            }
        }
        return -1;
    }));
    if (set.size > 1) {
        return -1;
    }
    return (_a = set.values().next().value) !== null && _a !== void 0 ? _a : -1;
}
function buildEmbed(_, settings, xml) {
    var _a, _b;
    const html = Cheerio.load(xml.getChild('description').getValue());
    const embed = {
        title: (_a = xml.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
        url: (_b = xml.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
        description: nodeToMarkdown(html),
        fields: [],
    };
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
 * Send a message through discord using the webhook.
 */
function sendDiscordMessage(embeds, feed, ctx) {
    var _a, _b;
    const settings = feed.settings;
    if (!settings.webhook.value) {
        return;
    }
    const message = {
        embeds,
        username: settings.appname.value,
        content: String((_a = feed.discord) !== null && _a !== void 0 ? _a : ''),
        avatar_url: truthy(settings.avatar_url.value),
    };
    // evaluate message contents
    if (/^[0-9]+$/.test(message.content)) {
        message.allowed_mentions = { users: [message.content] };
        message.content = `<@${message.content}>`;
    }
    const signature = settings.signature.value;
    if (signature && signature.includes('%s')) {
        message.content = signature.replace('%s', message.content);
    }
    else if (signature) {
        message.content = signature;
    }
    // if we're not bundling, copy message for each embed.
    const messages = settings.bundle.value ? [message] :
        message.embeds.map(e => { return { ...message, embeds: [e] }; });
    for (const msg of messages) {
        const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
        msg.avatar_url = truthy(settings.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
        msg.username = (_b = truthy(settings.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname)) !== null && _b !== void 0 ? _b : DEFAULT_APP_NAME;
        // ctx.debug(`payload: ${JSON.stringify(msg)}`)
        const response = ctx.fetch(settings.webhook.value, {
            method: 'post',
            payload: JSON.stringify(msg),
            contentType: "application/json"
        });
        if (!response.getResponseCode().toString().startsWith('2')) {
            throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
        }
    }
}

/**
 * rss.js - functions related to processing RSS feeds.
 */
/**
 * Process Feed
 */
function processFeed(feed, ctx) {
    // skip feed that has recently been scanned
    const diff = ctx.now - feed.time;
    if (diff < feed.settings.feed_frequency.value * 1000) {
        ctx.info(`${feed.feed} - hit frequency limit of ${feed.settings.feed_frequency} seconds (${diff / 1000}s) - skipping`);
        return { status: STATUS.SKIP, status_text: '' };
    }
    ctx.info(`${feed.feed} - fetching`);
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
    const msg = {
        username: feed.discord,
        embeds: [],
    };
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
        msg.embeds.push(buildEmbed(ctx, feed.settings, item));
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(feed.guid) !== '0') {
        status = 'new feed';
        msg.embeds.length = 0;
    }
    else {
        status = `found ${msg.embeds.length}`;
    }
    ctx.debug(`Processed ${msg.embeds.length} items`);
    return {
        status: STATUS.OK,
        status_text: status,
        guid: firstGuid,
        message: msg,
    };
}

/**
 * index.js - main entry point for code
 */
CONFIG.LOG_TO_STDERR = true;
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
        if (method) {
            ctx.info(`--- START ${method} (${version}) ---`);
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
    var _a, _b;
    const feeds = readFeedsTab(ctx);
    ctx.info(`Read ${feeds.length} rows`);
    for (const feed of feeds) {
        const sheet = feed.settings.worksheet;
        if (feed.settings.feedCount <= 0) {
            continue;
        }
        let result;
        try {
            result = processFeed(feed, ctx);
        }
        catch (e) {
            // even if we fail we want to count it.
            const err = errorToString(e);
            ctx.warn(err);
            updateFeedsTab(feed, SHEET_HEADERS.time, ctx.now);
            updateFeedsTab(feed, SHEET_HEADERS.status, `ERROR: ${err}`);
            continue;
        }
        if (result.status === STATUS.SKIP) {
            continue;
        }
        if ((_b = (_a = result === null || result === void 0 ? void 0 : result.message) === null || _a === void 0 ? void 0 : _a.embeds) === null || _b === void 0 ? void 0 : _b.length) {
            sendDiscordMessage(result.message.embeds, feed, ctx);
        }
        updateFeedsTab(feed, SHEET_HEADERS.time, ctx.now);
        if (result.guid) {
            updateFeedsTab(feed, SHEET_HEADERS.guid, result.guid);
        }
        updateFeedsTab(feed, SHEET_HEADERS.status, `${STATUS[result.status]}: ${result.status_text}`);
        ctx.info(`Updated row ${sheet.getName()}:${feed.index + 1} ${STATUS[result.status]}: ${result === null || result === void 0 ? void 0 : result.status_text}`);
        feed.settings.feedCount -= 1;
        if (feed.settings.feedCount === 0) {
            const limit = feed.settings.feed_limit.value;
            ctx.info(`[${sheet.getName()}]: Hit limit of ${limit} feeds`);
        }
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
    console.log(ScriptApp.getProjectTriggers().map(t => [t.getUniqueId(), t.getHandlerFunction()]));
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


