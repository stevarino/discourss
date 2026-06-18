const DEFAULT_APP_NAME = 'Sheets RSS to Discord';
const FEEDS_TAB = 'feeds';
const SETTINGS_TAB = 'settings';
const LOGS_TAB = 'logs';
var STATUS;
(function (STATUS) {
    STATUS[STATUS["OK"] = 0] = "OK";
    STATUS[STATUS["SKIP"] = 1] = "SKIP";
    STATUS[STATUS["EMPTY"] = 2] = "EMPTY";
    STATUS[STATUS["ERROR"] = 3] = "ERROR";
    STATUS[STATUS["NONE"] = 4] = "NONE";
})(STATUS || (STATUS = {}));
var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
})(LOG_LEVEL || (LOG_LEVEL = {}));
var SETTINGS_FIELDS;
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
const DEFAULT_SETTINGS = {
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
function getDefaultSettings() {
    // return a new Settings object.
    return {
        ...DEFAULT_SETTINGS,
        now: new Date().getTime(),
    };
}
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
        help: 'Latest review; set to 0 to push all',
    },
    status: {
        label: 'Status',
        help: 'Last run status',
    },
};
const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(v => v.help !== '').map(v => v.label);
const HEADER_LOOKUP = Object.fromEntries(Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k]));

function setup() {
    const sheet = SpreadsheetApp.getActive();
    setupFeedsTab(sheet);
    setupSettingsTab(sheet);
    setupTriggers();
}
function setupFeedsTab(sheet) {
    // Creates the Feeds tab and adds any missing columns.
    let tab = sheet.getSheetByName(FEEDS_TAB);
    if (tab === null) {
        tab = sheet.insertSheet(FEEDS_TAB);
    }
    const range = tab.getDataRange();
    const rows = range.getValues();
    while (rows.length < 2) {
        rows.push([]);
    }
    // ensure rectangle rows (should be...)
    const cols = Math.max(rows[0].length, rows[1].length);
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2; j++) {
            if (rows[j].length == i) {
                rows[j][i] = '';
            }
        }
    }
    // add missing columns
    const newData = [[], []];
    for (const header of EXPECTED_HEADERS) {
        if (!rows[0].includes(header)) {
            const index = rows[0].length;
            const { label, help } = SHEET_HEADERS[HEADER_LOOKUP[header]];
            rows[0][index] = label;
            rows[1][index] = help;
            newData[0].push(label);
            newData[1].push(help);
        }
    }
    if (newData[0].length > 0) {
        const rowA = tab.getRange(1, cols + 1, 1, newData[0].length);
        const rowB = tab.getRange(2, cols + 1, 1, newData[0].length);
        rowA.setValues([newData[0]]);
        rowB.setValues([newData[1]]);
        rowA.setBackground('#4285f4'); // cornflower blue
        rowA.setTextStyle(SpreadsheetApp.newTextStyle().setFontSize(16).setBold(true)
            .setForegroundColor('#ffffff').build());
        rowB.setBackground('#4285f4'); // cornflower blue
        rowB.setTextStyle(SpreadsheetApp.newTextStyle().setFontSize(10).setBold(false)
            .setForegroundColor('#ffffff').build());
        tab.autoResizeColumns(cols + 1, newData[0].length);
    }
}
function setupSettingsTab(sheet) {
    let tab = sheet.getSheetByName(SETTINGS_TAB);
    if (tab === null) {
        tab = sheet.insertSheet(SETTINGS_TAB);
    }
    const exists = new Set();
    const rowData = tab.getDataRange().getValues();
    for (const row of rowData) {
        const key = row[0];
        if (!key || !(key in SETTINGS_FIELDS)) {
            continue;
        }
        exists.add(key);
    }
    const toAdd = [];
    for (const field of Object.keys(SETTINGS_FIELDS)) {
        if (!exists.has(field)) {
            toAdd.push([field, DEFAULT_SETTINGS[field]]);
        }
    }
    if (toAdd.length === 0) {
        return;
    }
    const range = tab.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 2);
    range.setValues(toAdd);
}
function setupTriggers() {
    const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    if (!triggers.includes('timerTrigger')) {
        ScriptApp.newTrigger('timerTrigger')
            .timeBased().everyMinutes(5).create();
    }
}

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
function getSettings(sheet, logs) {
    const settings = getDefaultSettings();
    settings.logs = logs;
    const settingsTab = sheet.getSheetByName(SETTINGS_TAB);
    if (settingsTab === null) {
        throw new Error('expected a sheet called "settings" - found none.');
    }
    for (const row of settingsTab.getDataRange().getValues()) {
        const key = row[0];
        if (!key || !(key in SETTINGS_FIELDS)) {
            continue;
        }
        settings[key] = row[1];
    }
    settings.feed_pattern_re = new RegExp(settings.feed_pattern);
    return settings;
}
function run(settings) {
    var _a, _b;
    const spreadsheet = SpreadsheetApp.getActive();
    const logs = [];
    try {
        if (!settings) {
            settings = getSettings(spreadsheet, logs);
        }
        const sheet = spreadsheet.getSheetByName(FEEDS_TAB);
        if (!sheet) {
            settings.error(`expected a sheet called "${FEEDS_TAB}" - found none.`);
            return;
        }
        const { feeds, headers } = getFeeds(sheet.getDataRange().getValues(), settings);
        let count = 0;
        for (const feed of feeds) {
            count++;
            if (count > settings.feed_limit) {
                console.info(`hit limit of ${settings.feed_limit} feeds - stopping`);
                break;
            }
            let result;
            try {
                result = processFeed(feed, settings);
            }
            catch (e) {
                if (e instanceof Error && !e.stack) {
                    settings.warn(e.message);
                }
                else if (e instanceof Error && e.stack) {
                    settings.warn(`${e.message}\n${e.stack}`);
                }
                else {
                    settings.warn(`${e}`);
                }
                continue;
            }
            if ((_b = (_a = result === null || result === void 0 ? void 0 : result.message) === null || _a === void 0 ? void 0 : _a.embeds) === null || _b === void 0 ? void 0 : _b.length) {
                sendDiscordMessage({ embeds: result.message.embeds }, settings);
            }
            if (result === null || result === void 0 ? void 0 : result.guid) {
                for (const [header, value] of [
                    [SHEET_HEADERS.time.label, settings.now],
                    [SHEET_HEADERS.guid.label, result.guid],
                    [SHEET_HEADERS.status.label, result.status_text],
                ]) {
                    const offset = headers.indexOf(header);
                    if (offset === -1) {
                        // this should never fire.
                        throw new Error(`Unable to find column "${header}"`);
                    }
                    sheet
                        .getRange(feed.index + 1, offset + 1, 1, 1)
                        .setValues([[value]]);
                }
            }
            console.log(`Updated row ${feed.index} ${result === null || result === void 0 ? void 0 : result.status}: ${result === null || result === void 0 ? void 0 : result.status_text}`);
        }
    }
    finally {
        writeLogs(spreadsheet, logs);
    }
}
function getFeeds(values, settings) {
    const headers = [];
    const feeds = [];
    for (let i = 0; i < values.length; i++) {
        // setup columns for dict-like lookup.
        if (headers.length === 0) {
            headers.push(String(...values[i]));
            const missing = [];
            for (const v of EXPECTED_HEADERS) {
                if (!headers.includes(v)) {
                    missing.push(v);
                }
            }
            if (missing.length !== 0) {
                throw new Error(`Missing required headers: ${JSON.stringify(missing)}`);
            }
            continue;
        }
        const feed = { index: i };
        for (const j in headers) {
            const field = HEADER_LOOKUP[headers[j]];
            if (field !== undefined) {
                feed[field] = values[i][j];
            }
        }
        if (!feed.feed) {
            continue;
        }
        if (typeof feed.time !== 'number') {
            feed.time = 0;
        }
        // skip feed that is not obvious feed url
        if (!settings.feed_pattern_re.test(feed.feed)) {
            continue;
        }
        feeds.push(feed);
    }
    if (feeds.length === 0) {
        throw new Error("No feeds found.");
    }
    // sort feeds by time in ascending order
    feeds.sort((a, b) => a.time - b.time);
    return { headers, feeds };
}
/**
 * Process Feed
 */
function processFeed(feed, settings) {
    console.info(`processing ${feed.feed}`);
    const feed_settings = Object.assign({ ...settings }, {
        discord: feed.discord,
        guid: feed.guid,
    });
    // skip feed that has recently been scanned
    const diff = settings.now - feed.time;
    if (diff < settings.feed_frequency * 1000) {
        console.info(`hit frequency limit of ${settings.feed_frequency} seconds (${diff / 1000}s) - skipping`);
        return { status: STATUS.SKIP, status_text: '' };
    }
    console.log('Fetching: ', feed.feed);
    const res = UrlFetchApp.fetch(feed.feed, { muteHttpExceptions: true });
    if (res.getResponseCode() != 200) {
        return {
            status: STATUS.ERROR,
            status_text: `HTTP Response code: ${res.getResponseCode()}`
        };
    }
    return parseRssXml(res.getContentText(), feed_settings);
}
function parseRssXml(content, settings) {
    const msg = {
        username: settings.discord,
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
        const embed = {
            title: item.getChild("title").getText(),
            url: item.getChild('link').getText(),
            fields: [],
        };
        const guid = item.getChild('guid').getText();
        if (settings.debug) {
            embed.fields.push({ name: 'guid', value: guid });
        }
        if (firstGuid === '') {
            firstGuid = guid;
        }
        if (guid === settings.guid) {
            foundLast = true;
            break;
        }
        const $ = Cheerio.load(item.getChild('description').getValue());
        const image = $('img').attr('src');
        if (image) {
            if (settings.image_format == 'image') {
                embed.image = { url: image };
            }
            else if (settings.image_format == 'thumbnail') {
                embed.thumbnail = { url: image };
            }
        }
        const review = [...$("p")].map(el => $(el).text());
        embed.description = review.join('\n\n').trim();
        msg.embeds.push(embed);
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(settings.guid) !== '0') {
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
/**
 * Send a message through discord using the webhook.
 */
function sendDiscordMessage(message, settings) {
    var _a, _b;
    if (!settings.webhook) {
        return;
    }
    message = { ...message };
    let content_line = (_a = settings.discord) !== null && _a !== void 0 ? _a : '';
    if (typeof content_line === 'number') {
        content_line = String(content_line);
    }
    if (/^[0-9]+$/.test(content_line)) {
        console.info(`username ${content_line} appears to be a snowflake`);
        message.allowed_mentions = { users: [content_line] };
        content_line = `<@${content_line}>`;
    }
    if (settings.signature && settings.signature.includes('%s')) {
        content_line = settings.signature.replace('%s', content_line);
    }
    message.content = content_line;
    message.username = (_b = settings.appname) !== null && _b !== void 0 ? _b : DEFAULT_APP_NAME;
    if (settings.avatar_url) {
        message.avatar_url = settings.avatar_url;
    }
    const requests = [];
    if (settings.bundle) {
        requests.push({
            method: 'post',
            payload: JSON.stringify(message),
            muteHttpExceptions: true,
            contentType: "application/json"
        });
    }
    else {
        for (const embed of message.embeds) {
            let payload = { ...message };
            payload.embeds = [embed];
            requests.push({
                method: 'post',
                payload: JSON.stringify(payload),
                muteHttpExceptions: true,
                contentType: "application/json"
            });
        }
    }
    for (let i = 0; i < requests.length; i++) {
        const response = UrlFetchApp.fetch(settings.webhook, requests[i]);
        console.log(`discord ${i} of ${requests.length} response: `, response.getResponseCode());
    }
}
function onOpen() {
    var ui = SpreadsheetApp.getUi();
    // Or DocumentApp, SlidesApp or FormApp.
    ui.createMenu('RSS Updater')
        .addItem('Run', 'run')
        .addItem('Setup', 'setup')
        .addToUi();
}
function timerTrigger() {
    run();
}
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
            tab.getRange(0, 0, rows.length, rows[0].length).setValues(rows);
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
            for (let i = 0; i < rows.length; i++) {
                if (typeof rows[i][0] === 'number' && cutoffTime < oldRows[i][2]) {
                    rows.push(oldRows[i]);
                }
            }
        }
        const range = tab.getRange(0, 0, rows.length, rows[0].length);
        range.setValues(rows);
        tab.autoResizeRows(1, Math.max(rows.length, rowCount));
        tab.getRange(0, colCount, rows.length, 1).setWrap(true);
    }
    catch (e) {
        console.error(e);
    }
}
function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}


