/**
 * index.js - main entry point for code
 */
import { renderLogHeader, STATUS, DEFAULT_APP_NAME, CONFIG, renderFeedCounters, getWebhookId } from './common.js';
import { LOG_LEVEL, errorToString, log, Context } from './context.js';
import { readFeedsTabs, writeLogs, setupFeedsTab, setFeedStatus } from './sheets.js';
import { processFeed } from './rss.js';
import { version } from './version.js';
import { normalizeMessages } from './discord.js';
import { rssFinder } from './rss-finder.js';
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
        if (method && !ctx.isTest) {
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
    var _a, _b, _c, _d;
    const feeds = readFeedsTabs(ctx);
    ctx.info(`Found ${feeds.length} RSS feeds`);
    if (!ctx.isTest) {
        const webhooks = ctx.getAllSheetSettings().map(s => { var _a; return (_a = getWebhookId(s.webhook.get())) !== null && _a !== void 0 ? _a : 0; });
        console.log(JSON.stringify({ tele: {
                ss: ctx.spreadsheet.getId(),
                v: version,
                wh: webhooks,
            } }));
    }
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
export function onOpen() {
    SpreadsheetApp.getUi()
        .createAddonMenu()
        .addItem('Show sidebar', 'showSidebar')
        .addToUi();
}
/** Ran when user clicks "Run" in the sidebar. */
export function run(ctx) {
    wrapper('run', ctx, (ctx) => {
        execute(ctx);
    });
}
/** User submits settings from sidebar. Returns errors. */
export function setSettings(req) {
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
export function showSidebar() {
    SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('sidebar').setTitle(DEFAULT_APP_NAME));
}
/** Sidebar has requested data. */
export function getSidebarData() {
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
export function toggleTimer() {
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
export function discourssTimerTrigger() {
    wrapper('timer', undefined, ctx => {
        execute(ctx);
    });
}
export function alert(msg, buttonset) {
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
export function performRssFinder(url) {
    wrapper('rssFinder', undefined, ctx => {
        const sheet = SpreadsheetApp.getActiveSheet();
        const settings = ctx.getSheetSettings(sheet);
        if (!settings) {
            alert('Worksheet settings not found.');
            return;
        }
        const result = rssFinder(ctx, settings, url);
        if (result) {
            alert(result);
        }
        else {
            alert('Feed added successfully.');
        }
    });
}
export function deleteSettings(sheetId) {
    return wrapper('deleteSettings', undefined, ctx => {
        var _a;
        const sheet = ctx.getWorksheet(sheetId);
        ctx.deleteSettings(sheetId);
        ctx.info(`[${(_a = sheet === null || sheet === void 0 ? void 0 : sheet.getName()) !== null && _a !== void 0 ? _a : sheetId})] Settings deleted.`);
        ctx.loadSettings();
        return { sheetData: ctx.getSheetData(sheetId) };
    });
}
export function pollCurrentSheet() {
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
export function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}
