import { SETTINGS_TAB, FEEDS_TAB, SHEET_HEADERS, EXPECTED_HEADERS, HEADER_LOOKUP, SETTINGS_FIELDS, DEFAULT_SETTINGS } from './common.js';
export function setup() {
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
