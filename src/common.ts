/**
 * common.js - common interfaces, types, and constants.
 */

import { version } from "./version.js";

/** If test is truthy, return test, otherwise return other (or undefined) */
export const DEFAULT_APP_NAME = 'DiscouRSS';

export function truthy<T>(test: T, other?: T): T | undefined {
  if (test) {
    return test;
  }
  return other;
}

export function first<T>(...tests: T[]): T|undefined {
  for (const test of tests) {
    if (test) return test;
  }
  return undefined;
}

/** Returns "[SheetName:RowNum]" for a given feed. */
export function renderLogHeader(feed: Feed): string {
  const ws = feed.settings.worksheet!
  return `[${ws.getName()}:${feed.index+1}]`
}

/**
 * Regex to extract webhook ID. 
 * domain = discord | discordapp
 * https://{domain}.com/api/webhooks/{id}/{key}
 */
const DISCORD_URL_RE = new RegExp('^https://discord(?:app)?\\.com/api/webhooks/([^/]+)/.+');
export function getWebhookId(url: string): string|undefined {
  return DISCORD_URL_RE.exec(url)?.[1]
}



// from GoogleAppsScript.Base.Button and GoogleAppsScript.Base.ButtonSet
export type Button = "CLOSE"|"OK"|"CANCEL"|"YES"|"NO";
export type ButtonSet = "OK"|"OK_CANCEL"|"YES_NO"|"YES_NO_CANCEL";

export const CONFIG = {
  LOG_TO_STDERR: false,
  LOG_DEBUG: false,
  LIMIT_SAFETY_MARGIN: 0.9,
  RUNTIME: 345, // 6 minutes, 15 seconds of safety
};

export interface PartialFeed {
  index: number,
  settings: SettingsInterface,
  feed?: string,
  time?: number|string,
  discord?: string|number,
  guid?: string,
  status?: string,
}

/** Represents a row in a sheet pointing to an RSS feed. */
export type Feed = PartialFeed & {
  time: number,
  feed: string,
  result?: Result,
  counters: FeedCounters
};

interface FeedCounters {
  successful: number,
  error: number,
  unprocessed: number,
  invalid: number,
}

export function renderFeedCounters(counters: FeedCounters): string {
  const output: string[] = [];
  for (const [key, value] of Object.entries(counters)) {
    if (value) {
      output.push(`${value} ${key}`)
    }
  }
  if (output.length === 0) {
    return 'no';
  }
  return output.join('; ') + ' items';
}

export type FeedLookup = Record<keyof PartialFeed, string|number|undefined|SettingsInterface>;

// https://docs.discord.com/developers/resources/message#embed-object
export interface Embed {
  title?: string,
  url?: string,
  description?: string,
  thumbnail?: {url: string}|undefined,
  image?: {url: string}|undefined,
  fields: {name: string, value: string}[],
  footer?: {text: string},
  timestamp?: string,
  _ts?: number,
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

/** Set of Discord Webhook Messages from a sheet. */
export interface Result {
  status: STATUS,
  status_text: string,
  guid?: string,
  embeds?: Embed[],
  sheets_update?: [SHEET_HEADERS_FIELDS, string|number][],
}

export interface SHEET_HEADER_TYPES {
  label: string,
  help: string,
}

type SHEET_HEADERS_FIELDS = 'index'|'feed'|'discord'|'time'|'guid'|'status';
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
    help: 'Latest feed item; set to 0 to push all',
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

export interface Metadata {
  getValue(): string | null,
  setValue(val: string): Metadata,
  getKey(): string,
  getId(): number,
  remove(): void,
}

export interface MetadataFinder {
  withKey(key: string): MetadataFinder,
  find(): Metadata[],
}

export interface MetadataContainer {
  addDeveloperMetadata(key: string, value: string): MetadataContainer,
  createDeveloperMetadataFinder(): MetadataFinder,

}

// https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet
export type Spreadsheet = {
  getId(): string,
  getSheetByName(name: string): Worksheet|null,
  getSheetById(id: number): Worksheet|null,
  insertSheet(name: string): Worksheet,
  getSheets(): Worksheet[],
} & MetadataContainer

// https://developers.google.com/apps-script/reference/spreadsheet/sheet
export type Worksheet = {
  getSheetId(): number,
  getName(): string,
  clear(): void,
  getLastRow(): number,
  getLastColumn(): number,
  getDataRange(): Range,
  getRange(row: number, column: number, rowCount: number, colCount: number): Range
  autoResizeColumns(startColumn: number, numColumns: number): void,
  setColumnWidth(column: number, size: number): void,
  getColumnWidth(column: number): number,
  autoResizeRows(startRow: number, numRows: number): void,
} & MetadataContainer

export interface Range {
  getValues(): CELL_VALUE[][],
  setValues(values: CELL_VALUE[][]): Range,
  setBackground(color: string): Range,
  setTextStyle(style: StyleBuilderFinal): Range,
  clear(): Range,
  setWrap(isWrapped: boolean): Range
  setVerticalAlignment(alignment: "top" | "middle" | "bottom" | null): Range
}

interface StyleBuilderFinal {}

export interface StyleBuilder {
  setFontSize(size: number): StyleBuilder,
  setBold(isBold: boolean): StyleBuilder,
  setForegroundColor(color: string): StyleBuilder
  build(): StyleBuilderFinal
}

export interface XmlDocument {
  getRootElement(): XmlElement | null;
}

export interface XmlElement {
  getChild(name: string): XmlElement | null;
  getChildren(name: string): XmlElement[];
  getText(): string;
  getValue(): string;
}

/**
 * Fetcher code
 */

/** Fetcher object for use in context. */
export class Fetcher {
  default_params = {
    muteHttpExceptions: true,
    timeoutSeconds: 5,
  };

  default_http_headers = {
    "User-Agent": `DiscouRSS ${version} ${SpreadsheetApp?.getActive()?.getId()} - https://discourss.stevarino.com`,
  }

  fetch(url: string, req: FetchRequest, log?: (log: string) => void): FetchResponse {
    log = log || (() => {})
    const headers = Object.assign({}, this.default_http_headers, req.headers ?? {});
    req = Object.assign({}, this.default_params, req, {headers})
    if (CONFIG.LOG_DEBUG) {
      log(`Fetching ${url} - payload(${req.payload?.length})`);
    }
    const res = UrlFetchApp.fetch(url, req);
    if (CONFIG.LOG_DEBUG) {
      const bytes = [0, ...res.getBlob().getBytes()].reduce((a, b) => a+b);
      log(`Response: ${res.getResponseCode()} (${bytes} bytes)`);
    }
    return res;
  }
}

export interface FetchRequest {
  method?: 'get'|'post',
  payload?: string,
  muteHttpExceptions?: boolean,
  contentType?: string,
  timeoutSeconds?: number,
  followRedirects?: true,
  headers?: Record<string, string>,
}

export interface FetchResponse {
  getResponseCode(): number,
  getContentText(): string,
  getHeaders(): object,
}

export interface SidebarSheetsData {
  name: string,
  sheetId: string
  isSet: boolean,
  settings: [string, CELL_VALUE][]
}

export interface SidebarData {
  version: string,
  sheetId: string,
  timer:  boolean,
  sheets: Record<string, SidebarSheetsData>,
}

export interface SidebarPollResponse {
  version: string,
  sheetId: string,
  sheetNames: [string, string][],
}

export interface SidebarSaveRequest {
  isNew: boolean,
  sheetId: string,
  fields: [string, CELL_VALUE][],
}

export interface SidebarSaveResponse {
  // errors: string[],
  sheetData?: SidebarSheetsData,
}

export interface SettingInterface<T=CELL_VALUE> {
  value: T,
  get(): T,
  set(value: T): void
}

export interface SettingsInterface {
  isSet: boolean,
  worksheet: Worksheet | undefined,
  feedHeaders: CELL_VALUE[],

  webhook: SettingInterface<string>;
  appname: SettingInterface<string>;
  avatar_url: SettingInterface<string>;
  signature: SettingInterface<string>;
  feed_pattern: SettingInterface<string>;
  feed_limit: SettingInterface<number>;
  feed_frequency: SettingInterface<number>;
  image_format: SettingInterface<"image"|"thumbnail"|"none">;
  bundle: SettingInterface<boolean>;

  feedCount: number;
}

export interface FeedRequest {
  epoch: number,
  feed: Feed,
  payload: string,
}

export interface IContext {
  loadSettings(): void;
  getSettings(): Record<string, SidebarSheetsData>;
  getSheetData(sheetId: string): SidebarSheetsData;
  getWorksheet(sheetId: string): Worksheet | undefined;
  setSettings(sheetId: string, values: [string, CELL_VALUE][]): string[];
  deleteSettings(sheetId: string): void;

  reset(spreadsheet?: Spreadsheet): void;
  
  fetch(url: string, params?: FetchRequest): FetchResponse;

  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

