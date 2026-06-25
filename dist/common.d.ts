/**
 * common.js - common interfaces, types, and constants.
 */
/** If test is truthy, return test, otherwise return other (or undefined) */
export declare function truthy<T>(test: T, other?: T): T | undefined;
export declare const CONFIG: {
    LOG_TO_STDERR: boolean;
};
export interface Feed {
    index: number;
    feed?: string;
    time?: number | string;
    discord?: string | number;
    guid?: string;
    status?: string;
}
export type SafeFeed = Feed & {
    time: number;
    feed: string;
};
export type FeedLookup = Record<keyof Feed, string | number | undefined>;
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
export interface Result {
    status: STATUS;
    status_text: string;
    guid?: string;
    message?: Message;
    sheets_update?: [SHEET_HEADERS_FIELDS, string | number][];
}
export interface BaseContext {
    spreadsheet: Spreadsheet;
    feedHeaders: CELL_VALUE[];
    feedPatternRe: RegExp;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
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
export interface Spreadsheet {
    getSheetByName(name: string): Worksheet | null;
    insertSheet(name: string): Worksheet;
}
export interface Worksheet {
    getLastRow(): number;
    getLastColumn(): number;
    getDataRange(): Range;
    getRange(row: number, column: number, rowCount: number, colCount: number): Range;
    autoResizeColumns(startColumn: number, numColumns: number): void;
    setColumnWidth(column: number, size: number): void;
    getColumnWidth(column: number): number;
    autoResizeRows(startRow: number, numRows: number): void;
}
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
    fetch(url: string, req: FetchRequest): FetchResponse;
}
export interface FetchRequest {
    method?: 'get' | 'post';
    payload?: string;
    muteHttpExceptions?: boolean;
    contentType?: string;
}
export interface FetchResponse {
    getResponseCode(): number;
    getContentText(): string;
}
export {};
