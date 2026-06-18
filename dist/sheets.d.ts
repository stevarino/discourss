/**
 * sheegts.js - functions related to processing the spreadsheet.
 */
import { LOG_RECORD, SafeFeed, Spreadsheet, CELL_VALUE, Worksheet, SHEET_HEADER_TYPES, Context } from './common.js';
export declare const defaults: {
    settings: [string, CELL_VALUE][];
};
export declare function setupFeedsTab(sheet: Spreadsheet): void;
export declare function readSettingsTab(sheet: Spreadsheet): [Worksheet, CELL_VALUE[][]];
export declare function updateSettingsTab(sheet: Spreadsheet, defaults: [string, CELL_VALUE][]): void;
/**
 * Given an array of logs, inserts the logs into the `logs` tab.
 */
export declare function writeLogs(sheet: Spreadsheet, logs: LOG_RECORD[]): void;
export declare function getFeedColumn(feedHeaders: CELL_VALUE[], header: string): number;
export declare function readFeedsTab(ctx: Context): [Worksheet, SafeFeed[]];
export declare function updateFeedsTab(tab: Worksheet, row: number, column: SHEET_HEADER_TYPES, value: CELL_VALUE, feedHeaders: CELL_VALUE[]): void;
export declare function setup(): void;
