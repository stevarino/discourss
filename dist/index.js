/**
 * index.js - main entry point for code
 */
import { LOG_LEVEL, errorToString, log, SHEET_HEADERS, STATUS } from './common.js';
export { setup } from './sheets.js';
import { defaults as sheetsDefaults, readFeedsTab, updateFeedsTab, writeLogs } from './sheets.js';
import { Context, getContext } from './settings.js';
import { processFeed } from './rss.js';
sheetsDefaults.settings = Context.getDefaults();
export function run(ctx) {
    var _a, _b;
    const spreadsheet = SpreadsheetApp.getActive();
    const logs = [];
    try {
        if (!ctx) {
            ctx = getContext(spreadsheet, logs);
            if (!ctx) {
                throw new Error('Unable to load Settings.');
            }
        }
        const [tab, feeds] = readFeedsTab(ctx);
        let count = 0;
        for (const feed of feeds) {
            count += 1;
            if (count > ctx.feed_limit.value) {
                ctx.info(`hit limit of ${ctx.feed_limit} feeds - stopping`);
                break;
            }
            let result;
            try {
                result = processFeed(feed, ctx);
            }
            catch (e) {
                ctx.warn(errorToString(e));
                continue;
            }
            if (result.status === STATUS.SKIP) {
                count -= 1;
                continue;
            }
            if ((_b = (_a = result === null || result === void 0 ? void 0 : result.message) === null || _a === void 0 ? void 0 : _a.embeds) === null || _b === void 0 ? void 0 : _b.length) {
                sendDiscordMessage(result.message.embeds, feed, ctx);
            }
            // update feed state in spreadsheet
            if (result === null || result === void 0 ? void 0 : result.guid) {
                const update = (h, v) => {
                    updateFeedsTab(tab, feed.index, h, v, ctx.feedHeaders);
                };
                update(SHEET_HEADERS.time, ctx.now);
                update(SHEET_HEADERS.guid, result.guid);
                update(SHEET_HEADERS.status, `${result.status}: ${result.status_text}`);
            }
            ctx.info(`Updated row ${feed.index} ${result === null || result === void 0 ? void 0 : result.status}: ${result === null || result === void 0 ? void 0 : result.status_text}`);
        }
    }
    catch (e) {
        log(logs, errorToString(e), LOG_LEVEL.ERROR);
    }
    finally {
        writeLogs(spreadsheet, logs);
    }
}
/**
 * Send a message through discord using the webhook.
 */
function sendDiscordMessage(embeds, feed, ctx) {
    var _a;
    if (!ctx.webhook.value) {
        return;
    }
    const message = {
        embeds,
        username: ctx.appname.value,
        content: String((_a = feed.discord) !== null && _a !== void 0 ? _a : ''),
        avatar_url: (v => v ? v : undefined)(ctx.avatar_url.value),
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
    const requests = [];
    if (ctx.bundle.value) {
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
        const response = UrlFetchApp.fetch(ctx.webhook.value, requests[i]);
        if (response.getResponseCode() != 200) {
            throw new Error(`Discord returned HTTP Status Code ${response.getResponseCode()} - Aborting`);
        }
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
/**
 * Executes run when triggered by timer.
 */
export function timerTrigger() {
    run();
}
export function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}
