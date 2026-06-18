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
import { SETTINGS_TAB, FEEDS_TAB, LOGS_TAB, STATUS, DEFAULT_APP_NAME, getDefaultSettings, SHEET_HEADERS, EXPECTED_HEADERS, HEADER_LOOKUP, SETTINGS_FIELDS, LOG_LEVEL } from './common.js';
export * from './setup.js';
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
export function run(settings) {
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
export function onOpen() {
    var ui = SpreadsheetApp.getUi();
    // Or DocumentApp, SlidesApp or FormApp.
    ui.createMenu('RSS Updater')
        .addItem('Run', 'run')
        .addItem('Setup', 'setup')
        .addToUi();
}
export function timerTrigger() {
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
export function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}
