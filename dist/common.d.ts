/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
export declare const DEFAULT_APP_NAME = "DiscouRSS";
export declare function truthy<T>(test: T, other?: T): T | undefined;
export declare function first<T>(...tests: T[]): T | undefined;
/** Returns "[SheetName:RowNum]" for a given feed. */
export declare function renderLogHeader(feed: Feed): string;
export declare function getWebhookId(url: string): string | undefined;
export type Button = "CLOSE" | "OK" | "CANCEL" | "YES" | "NO";
export type ButtonSet = "OK" | "OK_CANCEL" | "YES_NO" | "YES_NO_CANCEL";
export declare const CONFIG: {
    LOG_TO_STDERR: boolean;
    LOG_DEBUG: boolean;
    LIMIT_SAFETY_MARGIN: number;
    RUNTIME: number;
};
export interface PartialFeed {
    index: number;
    settings: SettingsInterface;
    feed?: string;
    time?: number | string;
    discord?: string | number;
    guid?: string;
    status?: string;
}
/** Represents a row in a sheet pointing to an RSS feed. */
export type Feed = PartialFeed & {
    time: number;
    feed: string;
    result?: Result;
    counters: FeedCounters;
};
interface FeedCounters {
    successful: number;
    error: number;
    unprocessed: number;
    invalid: number;
}
export declare function renderFeedCounters(counters: FeedCounters): string;
export type FeedLookup = Record<keyof PartialFeed, string | number | undefined | SettingsInterface>;
export interface Embed {
    title?: string;
    url?: string;
    description?: string;
    thumbnail?: {
        url: string;
    } | undefined;
    image?: {
        url: string;
    } | undefined;
    fields: {
        name: string;
        value: string;
    }[];
    footer?: {
        text: string;
    };
    timestamp?: string;
    _ts?: number;
}
export interface Message {
    content?: string;
    username?: string | number;
    avatar_url?: string;
    embeds: Embed[];
    allowed_mentions?: {
        users: string[];
    };
}
export declare enum STATUS {
    OK = 0,
    SKIP = 1,
    EMPTY = 2,
    ERROR = 3,
    NONE = 4
}
/** Set of Discord Webhook Messages from a sheet. */
export interface Result {
    status: STATUS;
    status_text: string;
    guid?: string;
    embeds?: Embed[];
    sheets_update?: [SHEET_HEADERS_FIELDS, string | number][];
}
export interface SHEET_HEADER_TYPES {
    label: string;
    help: string;
}
type SHEET_HEADERS_FIELDS = 'index' | 'feed' | 'discord' | 'time' | 'guid' | 'status';
export declare const SHEET_HEADERS: Record<SHEET_HEADERS_FIELDS, SHEET_HEADER_TYPES>;
export declare const EXPECTED_HEADERS: string[];
export declare const HEADER_LOOKUP: Record<string, SHEET_HEADERS_FIELDS>;
/** Sheets Interfaces */
export type CELL_VALUE = string | number | boolean;
export interface Metadata {
    getValue(): string | null;
    setValue(val: string): Metadata;
    getKey(): string;
    getId(): number;
    remove(): void;
}
export interface MetadataFinder {
    withKey(key: string): MetadataFinder;
    find(): Metadata[];
}
export interface MetadataContainer {
    addDeveloperMetadata(key: string, value: string): MetadataContainer;
    createDeveloperMetadataFinder(): MetadataFinder;
}
export type Spreadsheet = {
    getId(): string;
    getSheetByName(name: string): Worksheet | null;
    getSheetById(id: number): Worksheet | null;
    insertSheet(name: string): Worksheet;
    getSheets(): Worksheet[];
} & MetadataContainer;
export type Worksheet = {
    getSheetId(): number;
    getName(): string;
    clear(): void;
    getLastRow(): number;
    getLastColumn(): number;
    getDataRange(): Range;
    getRange(row: number, column: number, rowCount: number, colCount: number): Range;
    autoResizeColumns(startColumn: number, numColumns: number): void;
    setColumnWidth(column: number, size: number): void;
    getColumnWidth(column: number): number;
    autoResizeRows(startRow: number, numRows: number): void;
} & MetadataContainer;
export interface Range {
    getValues(): CELL_VALUE[][];
    setValues(values: CELL_VALUE[][]): Range;
    setBackground(color: string): Range;
    setTextStyle(style: StyleBuilderFinal): Range;
    clear(): Range;
    setWrap(isWrapped: boolean): Range;
    setVerticalAlignment(alignment: "top" | "middle" | "bottom" | null): Range;
}
interface StyleBuilderFinal {
}
export interface StyleBuilder {
    setFontSize(size: number): StyleBuilder;
    setBold(isBold: boolean): StyleBuilder;
    setForegroundColor(color: string): StyleBuilder;
    build(): StyleBuilderFinal;
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
export declare class Fetcher {
    default_params: {
        muteHttpExceptions: boolean;
        timeoutSeconds: number;
    };
    default_http_headers: {
        "User-Agent": string;
    };
    fetch(url: string, req: FetchRequest, log?: (log: string) => void): FetchResponse;
}
export interface FetchRequest {
    method?: 'get' | 'post';
    payload?: string;
    muteHttpExceptions?: boolean;
    contentType?: string;
    timeoutSeconds?: number;
    followRedirects?: true;
    headers?: Record<string, string>;
}
export interface FetchResponse {
    getResponseCode(): number;
    getContentText(): string;
    getHeaders(): object;
}
export interface SidebarSheetsData {
    name: string;
    sheetId: string;
    isSet: boolean;
    settings: [string, CELL_VALUE][];
}
export interface SidebarData {
    version: string;
    sheetId: string;
    timer: boolean;
    sheets: Record<string, SidebarSheetsData>;
}
export interface SidebarPollResponse {
    version: string;
    sheetId: string;
    sheetNames: [string, string][];
}
export interface SidebarSaveRequest {
    isNew: boolean;
    sheetId: string;
    fields: [string, CELL_VALUE][];
}
export interface SidebarSaveResponse {
    sheetData?: SidebarSheetsData;
}
export interface SettingInterface<T = CELL_VALUE> {
    value: T;
    get(): T;
    set(value: T): void;
}
export interface SettingsInterface {
    isSet: boolean;
    worksheet: Worksheet | undefined;
    feedHeaders: CELL_VALUE[];
    webhook: SettingInterface<string>;
    appname: SettingInterface<string>;
    avatar_url: SettingInterface<string>;
    signature: SettingInterface<string>;
    feed_pattern: SettingInterface<string>;
    feed_limit: SettingInterface<number>;
    feed_frequency: SettingInterface<number>;
    image_format: SettingInterface<"image" | "thumbnail" | "none">;
    bundle: SettingInterface<boolean>;
    feedCount: number;
}
export interface FeedRequest {
    epoch: number;
    feed: Feed;
    payload: string;
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
export {};
