/**
 * index.js - main entry point for code
 */
import { SHEET_HEADERS, STATUS, DEFAULT_APP_NAME } from './common.js';
import { LOG_LEVEL, errorToString, log, Context } from './context.js';
import { readFeedsTab, updateFeedsTab, writeLogs, setupFeedsTab, } from './sheets.js';
import { processFeed } from './rss.js';
import { version } from './version.js';
import { sendDiscordMessage } from './discord.js';
const TIMER_TRIGGER = DEFAULT_APP_NAME + 'Timer';
/** A common execution wrapper. Handles context and logging. */
function wrapper(method, ctx, func) {
    const spreadsheet = SpreadsheetApp.getActive();
    const logs = [];
    try {
        if (!ctx) {
            ctx = new Context(spreadsheet, logs);
        }
        ctx.info(`--- START ${method} (${version}) ---`);
        return func(ctx);
    }
    catch (e) {
        log(logs, errorToString(e), LOG_LEVEL.ERROR);
    }
    finally {
        if (logs.length > 1) {
            writeLogs(spreadsheet, logs);
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
            updateFeedsTab(sheet, feed.index, h, v, feed.settings.feedHeaders);
        };
        update(SHEET_HEADERS.time, ctx.now);
        if (result.guid) {
            update(SHEET_HEADERS.guid, result.guid);
        }
        update(SHEET_HEADERS.status, `${STATUS[result.status]}: ${result.status_text}`);
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
/** User clicks "setup" on sidebar. Sets up initial table. */
export function setup(worksheet) {
    wrapper('setup', undefined, (ctx) => {
        const sheet = ctx.spreadsheet.getSheetByName(worksheet);
        if (sheet) {
            setupFeedsTab(sheet);
        }
    });
}
/** Ran when user clicks "Run" in the sidebar. */
export function run(ctx) {
    wrapper('run', ctx, (ctx) => {
        execute(ctx);
    });
}
/** User submits settings from sidebar. Returns errors. */
export function setSettings(sheet, data) {
    var _a;
    return (_a = wrapper('setSettings', undefined, (ctx) => {
        const errors = ctx.setSettings(sheet, data);
        if (errors === null || errors === void 0 ? void 0 : errors.length) {
            alert(`Errors occurred during saving:\n\n • ${errors.join('\n • ')}`);
        }
        else {
            ctx.info('Settings updated');
        }
        return errors;
    })) !== null && _a !== void 0 ? _a : [];
}
/** Show the sidebar, duh. :P */
export function showSidebar() {
    SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('sidebar').setTitle(DEFAULT_APP_NAME));
}
/** Sidebar has requested data. */
export function getSidebarData() {
    return wrapper('getSidebarData', undefined, (ctx) => {
        return {
            active: SpreadsheetApp.getActive().getActiveSheet().getName(),
            version,
            timer: Boolean(getTimer()),
            sheets: ctx.getSettings(),
        };
    });
}
/** Finds the timer trigger. */
function getTimer() {
    for (const trigger of ScriptApp.getProjectTriggers()) {
        if (trigger.getHandlerFunction() === TIMER_TRIGGER) {
            return trigger;
        }
    }
    return undefined;
}
/** Enable or Disable the timer. */
export function toggleTimer() {
    return wrapper('toggleTimer', undefined, () => {
        const timer = getTimer();
        if (timer) {
            ScriptApp.deleteTrigger(timer);
            return false;
        }
        ScriptApp.newTrigger(TIMER_TRIGGER).timeBased().everyHours(1).create();
        return true;
    });
}
/** Timer execution. */
export function timerTrigger() {
    wrapper('timer', undefined, ctx => {
        execute(ctx);
    });
}
export function alert(msg) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(msg);
}
export function deleteSettings(sheet) {
    wrapper('deleteSettings', undefined, ctx => {
        ctx.deleteSettings(sheet);
        ctx.info('Settings deleted.');
    });
}
export function pollCurrentSheet() {
    return SpreadsheetApp.getActive().getActiveSheet().getName();
}
/** HTTP endpoint. Currently unsued. */
export function doGet(e) {
    let params = JSON.stringify(e);
    return ContentService.createTextOutput(params).setMimeType(ContentService.MimeType.JSON);
}
