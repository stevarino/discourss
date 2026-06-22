/** mocks.ts - Mocks used in testing. */
import * as cheerio from 'cheerio';
import { Spreadsheet, CELL_VALUE, Worksheet, BaseContext } from './common.js';
import { FetchRequest, FetchResponse, Fetcher } from "./fetch.js";
export declare function createTestContext(sheet: Spreadsheet): BaseContext;
export declare class MockResponse implements FetchResponse {
    private responseCode;
    private contentText;
    constructor(contentText: string, responseCode?: number);
    getResponseCode(): number;
    getContentText(): string;
}
export declare class MockFetcher extends Fetcher {
    private rules;
    private defaultResponse;
    requests: Record<string, {
        req: FetchRequest;
        res: FetchResponse;
    }[]>;
    fetch(url: string, req: FetchRequest): FetchResponse;
    addMock(urlPattern: string | RegExp, contentText: string, responseCode?: number): void;
    setDefaultResponse(contentText: string, responseCode?: number): void;
    clear(): void;
}
export declare class MockXmlElement {
    private $;
    private node;
    constructor($: cheerio.CheerioAPI, node: any);
    getChild(name: string): MockXmlElement | null;
    getChildren(name: string): MockXmlElement[];
    getText(): string;
    getValue(): string;
}
export declare class MockXmlDocument {
    private $;
    constructor($: cheerio.CheerioAPI);
    getRootElement(): MockXmlElement | null;
}
export declare const MockXmlService: {
    parse(xml: string): MockXmlDocument;
};
export declare class MockStyleBuilder {
    setFontSize(): MockStyleBuilder;
    setBold(): MockStyleBuilder;
    setForegroundColor(): MockStyleBuilder;
    build(): object;
}
export declare class MockRange {
    private sheet;
    private startRow;
    private startCol;
    private numRows;
    private numCols;
    constructor(sheet: MockWorksheet, startRow: number, startCol: number, numRows: number, numCols: number);
    getValues(): CELL_VALUE[][];
    setValues(values: CELL_VALUE[][]): void;
    setBackground(): MockRange;
    setTextStyle(): MockRange;
    clear(): void;
    setWrap(): MockRange;
}
declare class MockWorksheet implements Worksheet {
    name: string;
    private cells;
    constructor(name: string);
    getCell(r: number, c: number): CELL_VALUE;
    setCell(r: number, c: number, value: CELL_VALUE): void;
    deleteCell(r: number, c: number): void;
    getLastRow(): number;
    getDataRange(): MockRange;
    getRange(row: number, column: number, rowCount: number, colCount: number): MockRange;
    autoResizeColumns(): void;
    setColumnWidth(): void;
    getColumnWidth(): number;
    autoResizeRows(): void;
}
export declare class MockSpreadsheet implements Spreadsheet {
    sheets: Map<string, MockWorksheet>;
    getSheetByName(name: string): MockWorksheet | null;
    insertSheet(name: string): MockWorksheet;
}
export {};
