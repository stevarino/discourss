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


/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
function truthy(test, other) {
    if (test) {
        return test;
    }
    return other;
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
    fetch(url, req) {
        return UrlFetchApp.fetch(url, req);
    }
}

/**
 * context.js - Context and Logging infrastructure.
 */
var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
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
    if (!Array.isArray(message)) {
        message = errorToLogRecord(message, level !== null && level !== void 0 ? level : LOG_LEVEL.INFO);
    }
    logs.push(message);
}
class Setting {
    constructor(value, help, validators) {
        this.value = value;
        this.help = help;
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
    validate() {
        for (const val of this.validators) {
            try {
                if (!val[0](this.value)) {
                    return val[1];
                }
            }
            catch (e) {
                return errorToString(e);
            }
        }
        return undefined;
    }
}
class Context {
    constructor(spreadsheet, logs) {
        this.webhook = new Setting('', 'Discord channel webhook.', [
            [v => v !== '', 'Webhook must be set.'],
            [v => String(v).startsWith('https://discord.com/api/webhooks'), 'Invalid discord hook URL'],
        ]);
        this.appname = new Setting('', 'The Discord Bot name.');
        this.avatar_url = new Setting('', 'URL to an image used for the Discord Bot.');
        this.signature = new Setting('%s Posted:', 'The signature used for the title. "%s" is replaced with the discord user.');
        this.feed_pattern = new Setting('^https://', 'Regular expression that individual feeds are validated against.');
        this.feed_limit = new Setting(5, 'How many feeds to process per run.');
        this.feed_frequency = new Setting(3600, 'How long a single feed will be scanned (in seconds).');
        this.image_format = new Setting('image', 'How to attach the image from the feed item (image|thumbnail|none)', [
            [(v) => ["image", "thumbnail", "none"].includes(v),
                'Value must be "image", "thumbnail", or "none".'],
        ]);
        this.bundle = new Setting(false, "Whether or not to bundle the items as a single discord message.");
        this.feedHeaders = [];
        this.logs = [];
        this.debug = false;
        this.defaults = [];
        this.fetcher = new Fetcher();
        this.now = new Date().getTime();
        this.feedPatternRe = new RegExp('^https://');
        this.spreadsheet = spreadsheet;
        if (logs !== undefined) {
            this.logs = logs;
        }
        this.defaults = this.getDefaults();
    }
    getDefaults() {
        if (this.defaults.length) {
            return this.defaults;
        }
        const defaults = [];
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Setting) {
                defaults.push([key, val.value, val.help]);
            }
        }
        return defaults;
    }
    setSettings(settings) {
        const errors = [];
        for (const [key, val] of settings) {
            if (typeof key !== 'string' || !this.hasOwnProperty(key)) {
                continue;
            }
            const setting = this[key];
            if (!(setting instanceof Setting)) {
                continue;
            }
            const error = setting.set(val);
            if (error !== undefined) {
                errors.push(`${key}: ${error}`);
                continue;
            }
            if (key === 'feed_pattern') {
                this.feedPatternRe = new RegExp(val);
            }
        }
        if (!errors.length) {
            errors.push(...this.validate());
        }
        return errors;
    }
    validate() {
        const errors = [];
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Setting) {
                const error = val.validate();
                if (error) {
                    errors.push(`${key}: ${error}`);
                }
            }
        }
        return errors;
    }
    fetch(url, params) {
        return this.fetcher.fetch(url, params);
    }
    log(level, message) {
        this.logs.push([new Date().getTime(), level, message]);
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
}

/**
 * sheegts.js - functions related to processing the spreadsheet.
 */
const SETTINGS_TAB = 'Settings';
const FEEDS_TAB = 'Feeds';
const LOGS_TAB = 'Logs';
const TIMER_TRIGGER = 'timerTrigger';
function newTextStyle() {
    return SpreadsheetApp.newTextStyle();
}
function setupFeedsTab(sheet) {
    // Creates the Feeds tab and adds any missing columns.
    let tab = sheet.getSheetByName(FEEDS_TAB);
    let values = [[]];
    let lastCol = 0;
    let range;
    if (tab === null) {
        tab = sheet.insertSheet(FEEDS_TAB);
        range = tab.getDataRange();
        values = [[]];
    }
    else {
        lastCol = tab.getLastColumn();
        range = tab.getDataRange();
        values = range.getValues();
    }
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
        const range = tab.getRange(1, lastCol + 1, 2, newData[0].length);
        range.setValues(newData).setBackground('#4285f4').setTextStyle(newTextStyle().setFontSize(16).setBold(true)
            .setForegroundColor('#ffffff').build());
        tab.getRange(2, lastCol + 1, 1, newData[0].length).setTextStyle(newTextStyle().setFontSize(10).setBold(false).build());
        tab.autoResizeColumns(lastCol + 1, newData[0].length);
        const columnWidthMults = [
            [SHEET_HEADERS.feed.label, 4],
            [SHEET_HEADERS.discord.label, 2],
            [SHEET_HEADERS.status.label, 8],
        ];
        for (const [label, mult] of columnWidthMults) {
            const feedIndex = newData[0].indexOf(label) + 1;
            if (feedIndex) {
                const width = tab.getColumnWidth(feedIndex + lastCol);
                tab.setColumnWidth(feedIndex + lastCol, width * mult);
            }
        }
    }
}
function readSettingsTab(sheet) {
    const settingsTab = sheet.getSheetByName(SETTINGS_TAB);
    if (settingsTab === null) {
        throw new Error('expected a sheet called "settings" - found none.');
    }
    return [settingsTab, settingsTab.getDataRange().getValues()];
}
function setupSettingsTab(sheet, defaults) {
    let tab = sheet.getSheetByName(SETTINGS_TAB);
    let values = [[]];
    let lastRow = 0;
    if (tab === null) {
        tab = sheet.insertSheet(SETTINGS_TAB);
    }
    else {
        values = tab.getDataRange().getValues();
        lastRow = tab.getLastRow();
    }
    const exists = new Set(values.map(row => row[0]).filter(v => v));
    const toAdd = [];
    for (const [key, val, help] of defaults) {
        if (!exists.has(key)) {
            toAdd.push([key, val, help]);
        }
    }
    if (toAdd.length) {
        const range = tab.getRange(lastRow + 1, 1, toAdd.length, toAdd[0].length);
        range.setValues(toAdd);
    }
}
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
function writeLogs(sheet, logs) {
    try {
        const rows = [['epoch', 'DateTime (UTC)', 'Level', 'Message']];
        for (let i = logs.length - 1; i >= 0; i--) {
            const log = logs[i];
            let isoTime = new Date(log[0]).toISOString().replace('T', ' ').split('.')[0];
            rows.push([log[0], isoTime, LOG_LEVEL[log[1]], log[2]]);
        }
        let tab = sheet.getSheetByName(LOGS_TAB);
        const colCount = rows[0].length;
        let rowCount = 0;
        if (tab === null) {
            tab = sheet.insertSheet(LOGS_TAB);
            tab.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
            tab.autoResizeColumns(1, colCount);
            // expand the last columnn
            tab.setColumnWidth(colCount, tab.getColumnWidth(colCount) * 8);
        }
        else {
            const range = tab.getDataRange();
            const oldRows = range.getValues();
            rowCount = oldRows.length + 1;
            range.clear();
            let cutoffTime = new Date().getTime() - (7 * 24 * 3600 * 1000);
            for (let i = 0; i < oldRows.length; i++) {
                const time = oldRows[i][0];
                if (typeof time === 'number' && cutoffTime < time) {
                    rows.push(oldRows[i]);
                }
            }
        }
        const range = tab.getRange(1, 1, rows.length, rows[0].length);
        range.setValues(rows);
        tab.autoResizeRows(1, Math.max(rows.length, rowCount));
        tab.getRange(1, colCount, rows.length, 1).setWrap(true).setVerticalAlignment('top');
    }
    catch (e) {
        console.error(errorToString(e));
    }
}
function getFeedColumn(feedHeaders, header) {
    return feedHeaders.indexOf(header);
}
function readFeedsTab(ctx) {
    const tab = ctx.spreadsheet.getSheetByName(FEEDS_TAB);
    const feeds = [];
    if (!tab) {
        throw new Error(`expected a sheet called "${FEEDS_TAB}" - found none.`);
    }
    const values = tab.getDataRange().getValues();
    for (let i = 0; i < values.length; i++) {
        // setup columns for dict-like lookup.
        if (values[i].includes(SHEET_HEADERS.feed.label)) {
            ctx.feedHeaders.length = 0;
            ctx.feedHeaders.push(...values[i]);
            const missing = [];
            for (const v of EXPECTED_HEADERS) {
                if (!ctx.feedHeaders.includes(v)) {
                    missing.push(v);
                }
            }
            if (missing.length !== 0) {
                throw new Error(`Missing required headers: ${JSON.stringify(missing)}`);
            }
            continue;
        }
        // console.log(values[i].map(String).join('\t'));
        const feed = { index: i };
        // iterate across the columns, using the header to map the value to the Feed object
        for (const [j, header] of ctx.feedHeaders.entries()) {
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
        if (!ctx.feedPatternRe.test(feed.feed)) {
            // entries with spaces are likely descriptions
            if (!feed.feed.includes(' ')) {
                ctx.warn(`"${feed.feed}" failed to match ${ctx.feedPatternRe.source}`);
            }
            continue;
        }
        feeds.push(feed);
    }
    return [tab, feeds];
}
function updateFeedsTab(tab, row, column, value, feedHeaders) {
    const col = getFeedColumn(feedHeaders, column.label);
    tab.getRange(row + 1, col + 1, 1, 1).setValues([[value]]);
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
const DEFAULT_APP_NAME = 'DiscouRSS';
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
function buildEmbed(ctx, xml) {
    var _a, _b;
    const html = Cheerio.load(xml.getChild('description').getValue());
    const embed = {
        title: (_a = xml.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
        url: (_b = xml.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
        description: nodeToMarkdown(html),
        fields: [],
    };
    if (ctx.debug) {
        embed.fields.push({ name: 'guid', value: xml.getChild('guid').getText() });
    }
    const image = html('img').attr('src');
    if (image) {
        if (ctx.image_format.value == 'image') {
            embed.image = { url: image };
        }
        else if (ctx.image_format.value == 'thumbnail') {
            embed.thumbnail = { url: image };
        }
    }
    return embed;
}
/**
 * Send a message through discord using the webhook.
 */
function sendDiscordMessage(embeds, feed, ctx) {
    var _a, _b;
    if (!ctx.webhook.value) {
        return;
    }
    const message = {
        embeds,
        username: ctx.appname.value,
        content: String((_a = feed.discord) !== null && _a !== void 0 ? _a : ''),
        avatar_url: truthy(ctx.avatar_url.value),
    };
    // evaluate message contents
    if (/^[0-9]+$/.test(message.content)) {
        message.allowed_mentions = { users: [message.content] };
        message.content = `<@${message.content}>`;
    }
    const signature = ctx.signature.value;
    if (signature && signature.includes('%s')) {
        message.content = signature.replace('%s', message.content);
    }
    // if we're not bundling, copy message for each embed.
    const messages = ctx.bundle.value ? [message] :
        message.embeds.map(e => { return { ...message, embeds: [e] }; });
    for (const msg of messages) {
        const domain = KNOWN_DOMAINS[findDomain(msg.embeds)];
        msg.avatar_url = truthy(ctx.avatar_url.value, domain === null || domain === void 0 ? void 0 : domain.logo);
        msg.username = (_b = truthy(ctx.appname.value, domain === null || domain === void 0 ? void 0 : domain.appname)) !== null && _b !== void 0 ? _b : DEFAULT_APP_NAME;
        const response = ctx.fetch(ctx.webhook.value, {
            method: 'post',
            payload: JSON.stringify(msg),
            muteHttpExceptions: true,
            contentType: "application/json"
        });
        if (response.getResponseCode() != 204) {
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
    if (diff < ctx.feed_frequency.value * 1000) {
        ctx.info(`${feed.feed} - hit frequency limit of ${ctx.feed_frequency} seconds (${diff / 1000}s) - skipping`);
        return { status: STATUS.SKIP, status_text: '' };
    }
    ctx.info(`${feed.feed} - fetching`);
    const res = ctx.fetch(feed.feed, { muteHttpExceptions: true });
    if (!String(res.getResponseCode()).startsWith('2')) {
        return {
            status: STATUS.ERROR,
            status_text: `HTTP Response code: ${res.getResponseCode()}`
        };
    }
    return parseRssXml(res.getContentText(), feed, ctx);
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
    if (items.length === 0) {
        firstGuid = '0';
        status = 'no items';
    }
    for (const item of items) {
        const guid = (_a = item.getChild('guid')) === null || _a === void 0 ? void 0 : _a.getText();
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
        msg.embeds.push(buildEmbed(ctx, item));
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
    return {
        status: STATUS.OK,
        status_text: status,
        guid: firstGuid,
        message: msg,
    };
}

const version = '1-782-422-112-561';

/**
 * index.js - main entry point for code
 */
function run(ctx) {
    var _a, _b;
    const spreadsheet = SpreadsheetApp.getActive();
    const logs = [];
    try {
        if (!ctx) {
            ctx = buildContext(spreadsheet, logs);
            if (!ctx) {
                throw new Error('Unable to load Settings.');
            }
        }
        ctx.info(`--- START (${version}) ---`);
        const [tab, feeds] = readFeedsTab(ctx);
        ctx.info(`Read ${feeds.length} rows`);
        let count = 0;
        for (const feed of feeds) {
            let result;
            try {
                result = processFeed(feed, ctx);
            }
            catch (e) {
                // even if we fail we want to count it.
                count += 1;
                ctx.warn(errorToString(e));
                continue;
            }
            if (result.status === STATUS.SKIP) {
                continue;
            }
            if ((_b = (_a = result === null || result === void 0 ? void 0 : result.message) === null || _a === void 0 ? void 0 : _a.embeds) === null || _b === void 0 ? void 0 : _b.length) {
                sendDiscordMessage(result.message.embeds, feed, ctx);
            }
            // update feed state in spreadsheet
            const update = (h, v) => {
                updateFeedsTab(tab, feed.index, h, v, ctx.feedHeaders);
            };
            update(SHEET_HEADERS.time, ctx.now);
            if (result.guid) {
                update(SHEET_HEADERS.guid, result.guid);
            }
            update(SHEET_HEADERS.status, `${STATUS[result.status]}: ${result.status_text}`);
            ctx.info(`Updated row ${feed.index + 1} ${STATUS[result.status]}: ${result === null || result === void 0 ? void 0 : result.status_text}`);
            count += 1;
            if (count >= ctx.feed_limit.value) {
                ctx.info(`hit limit of ${ctx.feed_limit.value} feeds - stopping`);
                break;
            }
        }
    }
    catch (e) {
        log(logs, errorToString(e), LOG_LEVEL.ERROR);
    }
    finally {
        writeLogs(spreadsheet, logs);
    }
}
function buildContext(sheet, logs) {
    const ctx = new Context(sheet, logs);
    const [, data] = readSettingsTab(sheet);
    const errors = ctx.setSettings(data);
    if (errors.length) {
        const msg = `Errors occurred during startup: ${errors.join('; ')}`;
        log(logs, msg, LOG_LEVEL.ERROR);
        throw new Error('Unable to construct Context');
    }
    ctx.feedPatternRe = new RegExp(ctx.feed_pattern.value);
    return ctx;
}
function onOpen() {
    buildMenu();
}
function hasSheet(name) {
    return Boolean(SpreadsheetApp.getActive().getSheetByName(name));
}
function buildMenu() {
    const menu = SpreadsheetApp.getUi().createMenu('DiscouRSS');
    const isReady = hasSheet(FEEDS_TAB) && hasSheet(SETTINGS_TAB);
    if (isReady)
        menu.addItem('Run', 'run');
    if (getTimeTrigger()) {
        menu.addItem('Disable', 'disableTriggers');
    }
    else {
        menu.addItem('Enable', 'setupTriggers');
    }
    menu.addItem('Setup', 'sheetsSetup');
    menu.addItem('About', 'about');
    menu.addToUi();
}
function about() {
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput().append(`
      <p>
        <a href='https://disourss.stevarino.com/'>DiscouRSS Homepage</a>
      </p>
      <p>
        Version: ${version}
      </p>
    `), 'About DiscouRSS');
}
function setupTriggers() {
    if (getTimeTrigger() === undefined) {
        ScriptApp.newTrigger('timerTrigger')
            .timeBased().everyMinutes(5).create();
    }
    buildMenu();
}
function disableTriggers() {
    const trigger = getTimeTrigger();
    if (trigger) {
        ScriptApp.deleteTrigger(trigger);
    }
    buildMenu();
}
function sheetsSetup() {
    const ctx = new Context(SpreadsheetApp.getActive());
    setupFeedsTab(ctx.spreadsheet);
    setupSettingsTab(ctx.spreadsheet, ctx.defaults);
    buildMenu();
}
function getTimeTrigger() {
    for (const trigger of ScriptApp.getProjectTriggers()) {
        if (trigger.getHandlerFunction() === TIMER_TRIGGER) {
            return trigger;
        }
    }
    return null;
}
/**
 * Executes run when triggered by timer.
 */
function timerTrigger() {
    run();
}
function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}


