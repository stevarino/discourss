/**
 * sheets.js - functions related to processing the spreadsheet.
 */

import {
  SHEET_HEADERS, EXPECTED_HEADERS, HEADER_LOOKUP, PartialFeed, FeedLookup,
  Feed, Spreadsheet, StyleBuilder, CELL_VALUE, Worksheet, SHEET_HEADER_TYPES,
  getWebhookId,
} from './common.js';
import {LOG_LEVEL, LOG_RECORD, errorToString, Context} from './context.js'

export const LOGS_TAB = 'Logs';

function newTextStyle(): StyleBuilder {
  return SpreadsheetApp.newTextStyle();
}

export function setupFeedsTab(worksheet: Worksheet): void {
  // Creates the Feeds tab and adds any missing columns.
  let lastCol = worksheet.getLastColumn();
  let range = worksheet.getDataRange();
  let values: CELL_VALUE[][] = range.getValues();
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
  const newData: string[][] = [[], []];
  for (const header of EXPECTED_HEADERS) {
    if (!values[0].includes(header)) {
      const index = values[0].length;
      const {label, help} = SHEET_HEADERS[HEADER_LOOKUP[header]];
      values[0][index] = label;
      values[1][index] = help;
      newData[0].push(label);
      newData[1].push(help);
    }
  }
  if (newData[0].length > 0) {
    worksheet
      .getRange(1, lastCol + 1, 2, newData[0].length)
      .setValues(newData)
      .setBackground('#FF6600')
      .setTextStyle(newTextStyle()
        .setFontSize(16)
        .setBold(true)
        .setForegroundColor('#ffffff')
        .build()
      );
    worksheet.getRange(2, lastCol+1, 1, newData[0].length).setTextStyle(
      newTextStyle().setFontSize(10).setBold(false).build());
    worksheet.autoResizeColumns(lastCol+1, newData[0].length);

    const columnWidthMults: [string, number][] = [
        [SHEET_HEADERS.feed.label, 4],
        [SHEET_HEADERS.discord.label, 2],
        [SHEET_HEADERS.status.label, 8],
    ];
    for (const [label, mult] of columnWidthMults) {
      const feedIndex = newData[0].indexOf(label) + 1;
      if (feedIndex) {
        const width = worksheet.getColumnWidth(feedIndex + lastCol);
        worksheet.setColumnWidth(feedIndex + lastCol, width * mult + 5);
      }
    }
  }
}

/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export function writeLogs(
  sheet: Spreadsheet, logs: LOG_RECORD[], logger?: (log: string) => void
): void {
  if (!logger) logger = () => {};
  const header = ['epoch', 'DateTime (UTC)', 'Level', 'Message'];
  try {
    // let rows: CELL_VALUE[][] = [['epoch', 'DateTime (UTC)', 'Level', 'Message']];
    let tab = sheet.getSheetByName(LOGS_TAB);
    const colCount = header.length;
    let rowCount = 0;
    if (tab === null) {
      tab = sheet.insertSheet(LOGS_TAB);
      tab.getRange(1, 1, 1, colCount).setValues([header]);
      tab.autoResizeColumns(1, colCount);
      // expand the last columnn
      tab.setColumnWidth(colCount, tab.getColumnWidth(colCount) * 8);
    }
  
    const newRows: CELL_VALUE[][] = [header];
    // reverse and format logs
    for (let i = logs.length-1; i >= 0; i--) {
      const log = logs[i];
      let isoTime = new Date(log[0]).toISOString().replace('T', ' ').split('.')[0];
      newRows.push([log[0], isoTime, LOG_LEVEL[log[1]], log[2]]);
    }

    const oldRange = tab.getDataRange()
    const oldRows = oldRange.getValues();
    rowCount = oldRows.length + 1;
    oldRange.clear();
    let cutoffTime = Date.now() - (7 * 24 * 3600);
    for (let i = 1; i < oldRows.length; i++) {
      const time = oldRows[i][0]
      if (typeof time === 'number' && cutoffTime < time) {
        newRows.push(oldRows[i]);
      }
    }

    // write values;
    tab.getRange(1, 1, newRows.length, newRows[0].length).setValues(newRows);

    tab.autoResizeRows(1, Math.max(newRows.length, rowCount));
    // wrap text logs
    tab.getRange(1, colCount, newRows.length, 1).setWrap(true).setVerticalAlignment('top');
  } catch (e) {
    // possibly no context
    logger(errorToString(e));
  }
}

function getFeedColumn(feedHeaders: CELL_VALUE[], header: string): number {
  return feedHeaders.indexOf(header)
}

export function readFeedsTabs(ctx: Context): Feed[] {
  const feeds: Feed[] = [];
  const webhooks = new Set<string>();
  for (const settings of Object.values(ctx.sheetSettings)) {
    if (!settings.isSet || !settings.worksheet) continue;
    webhooks.add(settings.webhook.get());
    const values = settings.worksheet.getDataRange().getValues() as (string | number)[][];
    for (let i = 0; i < values.length; i++) {
      // setup columns for dict-like lookup.
      if (values[i].includes(SHEET_HEADERS.feed.label)) {
        settings.feedHeaders.length = 0;
        settings.feedHeaders.push(...values[i]);
        const missing = [];
        for (const v of EXPECTED_HEADERS) {
          if (!settings.feedHeaders.includes(v)) {
            missing.push(v)
          }
        }
        if (missing.length !== 0) {
          throw new Error(`Missing required headers: ${JSON.stringify(missing)}`)
        }
        continue;
      }
      
      const feed: PartialFeed = {index: i, settings};
      // iterate across the columns, using the header to map the value to the Feed object
      for (const [j, header] of settings.feedHeaders.entries()) {
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
      if (!settings.feedPatternRe.test(feed.feed)) {
        // entries with spaces are likely descriptions
        if (!feed.feed.includes(' ')) {
          ctx.warn(`"${feed.feed}" failed to match ${settings.feedPatternRe.source}`);
        }
        continue;
      }
      feeds.push({
        ...feed,
        feed: feed.feed!,
        time: feed.time!,
        counters: {successful: 0, error: 0, unprocessed: 0, invalid: 0}
      });
    }
  }
  const webhookIds = Array.from(webhooks).map(s => getWebhookId(s) ?? '?');
  ctx.info(`webhookMap = ${JSON.stringify(
    {sheet: ctx.spreadsheet.getId(), webhookIds})}`);
  // earliest first
  feeds.sort((a, b) => a.time - b.time);
  return feeds;
}

export function updateFeedsTab(feed: Feed, column: SHEET_HEADER_TYPES, value: CELL_VALUE): void {
  const col = getFeedColumn(feed.settings.feedHeaders, column.label);
  feed.settings.worksheet?.getRange(feed.index + 1, col + 1, 1, 1)?.setValues([[value]]);
}

export function setFeedStatus(feed: Feed, ctx: Context, status: string, guid?: string): void {
  const sheet = feed.settings.worksheet!;
  const timeCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.time.label);
  const statusCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.status.label);
  const guidCol = getFeedColumn(feed.settings.feedHeaders, SHEET_HEADERS.guid.label);
  const maxCol = Math.max(timeCol, statusCol, guidCol);
  const range = sheet.getRange(feed.index + 1, 1, 1, maxCol + 1);
  if (!range) {
    throw new Error(`could not get feed range: [${feed.index + 1}][1:${maxCol + 1}]`);
  }
  const msg = `[${sheet.getName()}:${feed.index+1}] ${status}`;
  if (status.startsWith('ERROR')) {
    ctx.error(msg);
  } else {
    ctx.info(msg);
  }
  const data = range.getValues();
  data[0][timeCol] = Math.floor(ctx.now);
  data[0][statusCol] = status;
  if (guid !== undefined) {
    data[0][guidCol] = guid;
  }
  range.setValues(data);
}
