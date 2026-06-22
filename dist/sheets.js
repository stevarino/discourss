/**
 * sheegts.js - functions related to processing the spreadsheet.
 */
import { SHEET_HEADERS, EXPECTED_HEADERS, HEADER_LOOKUP } from './common.js';
import { LOG_LEVEL, errorToString, Context } from './context.js';
const SETTINGS_TAB = 'settings';
const FEEDS_TAB = 'feeds';
const LOGS_TAB = 'logs';
function newTextStyle() {
    return SpreadsheetApp.newTextStyle();
}
export function setupFeedsTab(sheet) {
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
        rowA.setTextStyle(newTextStyle().setFontSize(16).setBold(true)
            .setForegroundColor('#ffffff').build());
        rowB.setBackground('#4285f4'); // cornflower blue
        rowB.setTextStyle(newTextStyle().setFontSize(10).setBold(false)
            .setForegroundColor('#ffffff').build());
        tab.autoResizeColumns(cols + 1, newData[0].length);
    }
}
export function readSettingsTab(sheet) {
    const settingsTab = sheet.getSheetByName(SETTINGS_TAB);
    if (settingsTab === null) {
        throw new Error('expected a sheet called "settings" - found none.');
    }
    return [settingsTab, settingsTab.getDataRange().getValues()];
}
export function updateSettingsTab(sheet, defaults) {
    const [tab, values] = readSettingsTab(sheet);
    const exists = new Set(values.map(row => row[0]).filter(v => v));
    const toAdd = [];
    for (const [key, val, help] of defaults) {
        if (!exists.has(key)) {
            toAdd.push([key, val, help]);
        }
    }
    if (toAdd.length) {
        const range = tab.getRange(tab.getLastRow() + 1, 1, toAdd.length, toAdd[0].length);
        range.setValues(toAdd);
    }
}
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export function writeLogs(sheet, logs) {
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
        tab.getRange(1, colCount, rows.length, 1).setWrap(true);
    }
    catch (e) {
        console.error(errorToString(e));
    }
}
export function getFeedColumn(feedHeaders, header) {
    return feedHeaders.indexOf(header);
}
export function readFeedsTab(ctx) {
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
export function updateFeedsTab(tab, row, column, value, feedHeaders) {
    const col = getFeedColumn(feedHeaders, column.label);
    tab.getRange(row + 1, col + 1, 1, 1).setValues([[value]]);
    return;
}
export function setup() {
    const ctx = new Context(SpreadsheetApp.getActive());
    setupFeedsTab(ctx.spreadsheet);
    setupSettingsTab(ctx.spreadsheet, ctx.defaults);
    setupTriggers();
}
export function setupTriggers() {
    const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    if (!triggers.includes('timerTrigger')) {
        ScriptApp.newTrigger('timerTrigger')
            .timeBased().everyMinutes(5).create();
    }
}
export function disableTriggers() {
    for (const trigger of ScriptApp.getProjectTriggers()) {
        if (trigger.getHandlerFunction() === 'timerTrigger') {
            ScriptApp.deleteTrigger(trigger);
        }
    }
}
function setupSettingsTab(sheet, defaults) {
    updateSettingsTab(sheet, defaults);
}
