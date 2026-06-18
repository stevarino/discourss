/**
 * common.js - common interfaces, types, and constants.
 */

export const DEFAULT_APP_NAME = 'DiscouRSS';

export interface Feed {
  index: number,
  feed?: string,
  time?: number|string,
  discord?: string|number,
  guid?: string,
  status?: string,
}

export type SafeFeed = Feed & {time: number, feed: string};

export type FeedLookup = Record<keyof Feed, string|number|undefined>;

export interface Embed {
  title?: string,
  url?: string,
  description?: string,
  thumbnail?: {url: string}|undefined,
  image?: {url: string}|undefined,
  fields: {name: string, value: string}[],
}

export interface Message {
  content?: string,
  username?: string|number,
  avatar_url?: string,
  embeds: Embed[],
  allowed_mentions?: {users: string[]},
}

export enum STATUS {
  OK,
  SKIP,
  EMPTY,
  ERROR,
  NONE,
};

export enum LOG_LEVEL {
  ERROR, WARNING, INFO
};

// Result from parsing a feed.
export interface Result {
  status: STATUS,
  status_text: string,
  guid?: string,
  message?: Message,
  sheets_update?: [SHEET_HEADERS_FIELDS, string|number][],
}

export type LOG_RECORD = [number, LOG_LEVEL, string];


type maybeError = string|Error|LOG_RECORD;

export function errorToString(e: unknown): string {
  // LOG_RECORD
  if (Array.isArray(e) && typeof e[2] === 'string') {
    return e[2];
  }
  if (e instanceof Error) {
    if (e.stack) {
      return `${e.message}\n${e.stack}`;
    }
    return e.message;
  }
  return `${e}`;
}

export function errorToLogRecord(e: unknown, level?: LOG_LEVEL): LOG_RECORD{
  return [new Date().getTime(), level ?? LOG_LEVEL.ERROR, errorToString(e)];
}

export function log(logs: LOG_RECORD[], message: maybeError, level?: LOG_LEVEL): void {
  if (!Array.isArray(message)) {
    message = errorToLogRecord(message, level ?? LOG_LEVEL.INFO);
  }
  logs.push(message as LOG_RECORD);
}

// light version of Settings
export interface Context {
  spreadsheet: Spreadsheet,
  feedHeaders: CELL_VALUE[],
  feedPatternRe: RegExp,
  error(message: string): void,
  warn(message: string): void,
  info(message: string): void,
}

export interface SHEET_HEADER_TYPES {
  label: string,
  help: string,
}
export type SHEET_HEADERS_FIELDS = 'index'|'feed'|'discord'|'time'|'guid'|'status';
export const SHEET_HEADERS: Record<SHEET_HEADERS_FIELDS, SHEET_HEADER_TYPES> = { // : {[key in keyof Feed]: string} = {
  index: {
    label: 'Index',
    help: '',
  },
  feed: {
    label: 'Feed',
    help: 'RSS URL',
  },
  discord: {
    label: 'Discord',
    help: 'User ID or Name',
  },
  time: {
    label: 'Time',
    help: 'Auto; Set blank for forced rescan',
  },
  guid: {
    label: 'GUID',
    help: 'Latest review; set to 0 to push all',
  },
  status: {
    label: 'Status',
    help: 'Last run status',
  },
} as const;

export const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(
  v => v.help !== '').map(v => v.label) as string[];
export const HEADER_LOOKUP = Object.fromEntries(
  Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k])
) as Record<string, SHEET_HEADERS_FIELDS>;

/** Sheets Interfaces */
export type CELL_VALUE = string | number | boolean;

export interface Spreadsheet {
  getSheetByName(name: string): Worksheet|null,
  insertSheet(name: string): Worksheet,
}

export interface Worksheet {
  getLastRow(): number,
  getDataRange(): Range,
  getRange(row: number, column: number, rowCount: number, colCount: number): Range
  autoResizeColumns(startColumn: number, numColumns: number): void,
  setColumnWidth(column: number, size: number): void,
  getColumnWidth(column: number): number,
  autoResizeRows(startRow: number, numRows: number): void,
}

interface Range {
  getValues(): CELL_VALUE[][],
  setValues(values: CELL_VALUE[][]): void,
  setBackground(color: string): void,
  setTextStyle(style: StyleBuilderFinal): void,
  clear(): void,
  setWrap(isWrapped: boolean): void
}

interface StyleBuilderFinal {}

export interface StyleBuilder {
  setFontSize(size: number): StyleBuilder,
  setBold(isBold: boolean): StyleBuilder,
  setForegroundColor(color: string): StyleBuilder
  build(): StyleBuilderFinal
}

