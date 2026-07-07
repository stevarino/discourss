/**
 * sheets.js - functions related to processing the spreadsheet.
 */
import { Feed, Spreadsheet, CELL_VALUE, Worksheet, HEADER } from './common.js';
import { LOG_RECORD, Context } from './context.js';
export declare const LOGS_TAB = "Logs";
export declare function setupFeedsTab(worksheet: Worksheet): void;
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export declare function writeLogs(sheet: Spreadsheet, logs: LOG_RECORD[], logger?: (log: string) => void): void;
export declare function setHeaders(ctx: Context, ws: Worksheet): void;
export declare function readFeedsTabs(ctx: Context): Feed[];
export declare function updateFeedsTab(feed: Feed, column: HEADER, value: CELL_VALUE): void;
type rowUpdate = [column: HEADER, value: CELL_VALUE | undefined][];
export declare function updateFeedRow(ws: Worksheet, headers: CELL_VALUE[], rowNo: number, update: rowUpdate): void;
export declare function setFeedStatus(feed: Feed, ctx: Context, status: string, guid?: string): void;
export {};
