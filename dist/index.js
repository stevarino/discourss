/**
 * index.js - main entry point for code
 */
import { SHEET_HEADERS, STATUS, DEFAULT_APP_NAME, CONFIG, } from './common.js';
import { LOG_LEVEL, errorToString, log, Context } from './context.js';
import { readFeedsTab, updateFeedsTab, writeLogs, setupFeedsTab, } from './sheets.js';
import { processFeed } from './rss.js';
import { version } from './version.js';
import { sendDiscordMessage } from './discord.js';
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
