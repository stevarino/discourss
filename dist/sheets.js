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
export function readSettingsTab(sheet) {
    const settingsTab = sheet.getSheetByName(SETTINGS_TAB);
    if (settingsTab === null) {
        throw new Error('expected a sheet called "settings" - found none.');
    }
    return [settingsTab, settingsTab.getDataRange().getValues()];
}
export function setupSettingsTab(sheet, defaults) {
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
        tab.getRange(1, colCount, rows.length, 1).setWrap(true).setVerticalAlignment('top');
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
