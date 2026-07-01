/**
 * sheegts.js - functions related to processing the spreadsheet.
 */
import { Feed, Spreadsheet, CELL_VALUE, Worksheet, SHEET_HEADER_TYPES } from './common.js';
import { LOG_RECORD, Context } from './context.js';
export declare const LOGS_TAB = "Logs";
export declare function setupFeedsTab(worksheet: Worksheet): void;
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export declare function writeLogs(sheet: Spreadsheet, logs: LOG_RECORD[], logger?: (log: string) => void): void;
export declare function getFeedColumn(feedHeaders: CELL_VALUE[], header: string): number;
export declare function readFeedsTab(ctx: Context): Feed[];
export declare function updateFeedsTab(feed: Feed, column: SHEET_HEADER_TYPES, value: CELL_VALUE): void;
