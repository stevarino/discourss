/**
 * sheegts.js - functions related to processing the spreadsheet.
 */

import {
  SHEET_HEADERS, EXPECTED_HEADERS, HEADER_LOOKUP,
  LOG_LEVEL, LOG_RECORD, errorToString,
  Feed, FeedLookup, SafeFeed, Spreadsheet, StyleBuilder,
  CELL_VALUE, Worksheet, SHEET_HEADER_TYPES, Context
} from './common.js';

export const defaults = {
  settings: [] as [string, CELL_VALUE][],
}

const SETTINGS_TAB = 'settings';
const FEEDS_TAB = 'feeds';
const LOGS_TAB = 'logs';

function newTextStyle(): StyleBuilder {
  return SpreadsheetApp.newTextStyle();
}

export function setupFeedsTab(sheet: Spreadsheet): void {
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
  const newData: string[][] = [[], []];
  for (const header of EXPECTED_HEADERS) {
    if (!rows[0].includes(header)) {
      const index = rows[0].length;
      const {label, help} = SHEET_HEADERS[HEADER_LOOKUP[header]];
      rows[0][index] = label;
      rows[1][index] = help;
      newData[0].push(label);
      newData[1].push(help);
    }
  }
  if (newData[0].length > 0) {
    const rowA = tab.getRange(1, cols+1, 1, newData[0].length);
    const rowB = tab.getRange(2, cols+1, 1, newData[0].length);
    rowA.setValues([newData[0]]);
    rowB.setValues([newData[1]]);
    rowA.setBackground('#4285f4') // cornflower blue
    rowA.setTextStyle(
      newTextStyle().setFontSize(16).setBold(true)
      .setForegroundColor('#ffffff').build());
    rowB.setBackground('#4285f4') // cornflower blue
    rowB.setTextStyle(
      newTextStyle().setFontSize(10).setBold(false)
      .setForegroundColor('#ffffff').build());
    tab.autoResizeColumns(cols+1, newData[0].length);
  }
}

export function readSettingsTab(sheet: Spreadsheet): [Worksheet, CELL_VALUE[][]] {
  const settingsTab = sheet.getSheetByName(SETTINGS_TAB);
  if (settingsTab === null) {
    throw new Error('expected a sheet called "settings" - found none.');
  }
  return [settingsTab, settingsTab.getDataRange().getValues()]
}

export function updateSettingsTab(sheet: Spreadsheet, defaults: [string, CELL_VALUE][]): void {
  const [tab, values] = readSettingsTab(sheet);
  const exists = new Set(values.map(row => row[0]).filter(v => v));
  const toAdd: [string, CELL_VALUE][] = [];
  for (const [key, val] of defaults) {
    if (!exists.has(key)) {
      toAdd.push([key, val])
    }
  }
  if (toAdd.length) {
    const range = tab.getRange(tab.getLastRow() + 1, 1, toAdd.length, 2);
    range.setValues(toAdd);
  }
}


/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export function writeLogs(sheet: Spreadsheet, logs: LOG_RECORD[]): void {
  try {
    const rows: CELL_VALUE[][] = [['epoch', 'DateTime (UTC)', 'Level', 'Message']];
    for (let i = logs.length-1; i >= 0; i--) {
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
    } else {
      const range = tab.getDataRange();
      const oldRows = range.getValues();
      rowCount = oldRows.length + 1;
      range.clear();
      let cutoffTime = new Date().getTime() - (7 * 24 * 3600 * 1000);
      for (let i = 0; i < oldRows.length; i++) {
        const time = oldRows[i][0]
        if (typeof time === 'number' && cutoffTime < time) {
          rows.push(oldRows[i]);
        }
      }
    }
    const range = tab.getRange(0, 0, rows.length, rows[0].length);
    range.setValues(rows);
    tab.autoResizeRows(1, Math.max(rows.length, rowCount));
    tab.getRange(0, colCount, rows.length, 1).setWrap(true);
  } catch (e) {
    console.error(errorToString(e));
  }
}

export function getFeedColumn(feedHeaders: CELL_VALUE[], header: string): number {
  return feedHeaders.indexOf(header)
}

export function readFeedsTab(ctx: Context): [Worksheet, SafeFeed[]] {//, spreadsheet: Spreadsheet, feedHeaders: CELL_VALUE[], feedPattern: RegExp, logger: Logger): SafeFeed[] {
  const tab = ctx.spreadsheet.getSheetByName(FEEDS_TAB);
  const feeds: SafeFeed[] = [];
  if (!tab) {
    throw new Error(`expected a sheet called "${FEEDS_TAB}" - found none.`);
  }
  const values = tab.getDataRange().getValues() as (string | number)[][];
  for (let i = 0; i < values.length; i++) {
    // setup columns for dict-like lookup.
    if (ctx.feedHeaders.length === 0) {
      ctx.feedHeaders.push(...values[i]);
      const missing = [];
      for (const v of EXPECTED_HEADERS) {
        if (!ctx.feedHeaders.includes(v)) {
          missing.push(v)
        }
      }
      if (missing.length !== 0) {
        throw new Error(`Missing required headers: ${JSON.stringify(missing)}`)
      }
      continue;
    }

    const feed: Feed = {index: i};
    // iterate across the columns, using the header to map the value to the Feed object
    for (const [j, header] of ctx.feedHeaders.entries()) {
      if (typeof header === 'string' && HEADER_LOOKUP[header] !== undefined) {
        (feed  as FeedLookup)[HEADER_LOOKUP[header]] = values[i][j];
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
      ctx.warn(`"${feed.feed}" failed to match ${ctx.feedPatternRe.source}`);
      continue;
    }
    feeds.push(feed as SafeFeed);
  }
  return [tab, feeds];
}

export function updateFeedsTab(tab: Worksheet, row: number, column: SHEET_HEADER_TYPES, value: CELL_VALUE, feedHeaders: CELL_VALUE[]): void {
  const col = getFeedColumn(feedHeaders, column.label);
  tab.getRange(row, col, 1, 1).setValues([[value]])
  return;
  // for (const [header, value] of [
  //   [SHEET_HEADERS.time.label, settings.now],
  //   [SHEET_HEADERS.guid.label, guid],
  //   [SHEET_HEADERS.status.label, status],
  // ] as [string, number|string][]) {
  //   const offset = feedHeaders.indexOf(header);
  //   if (offset === -1) {
  //     // this should never fire.
  //     throw new Error(`Unable to find column "${header}"`);
  //   }
  //   sheet
  //     .getRange(index, offset + 1, 1, 1)
  //     .setValues([[value]])
  // }
}



export function setup(): void {
  const sheet = SpreadsheetApp.getActive();
  setupFeedsTab(sheet);
  setupSettingsTab(sheet);
  setupTriggers();
}

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (!triggers.includes('timerTrigger')) {
    ScriptApp.newTrigger('timerTrigger')
      .timeBased().everyMinutes(5).create();
  }
}

function setupSettingsTab(sheet: Spreadsheet) {
  updateSettingsTab(sheet, defaults.settings);
}

