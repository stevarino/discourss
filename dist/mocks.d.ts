/** mocks.ts - Mocks used in testing. */
import * as cheerio from 'cheerio';
import { Spreadsheet, CELL_VALUE, Worksheet, XmlDocument, XmlElement, FetchRequest, FetchResponse, Fetcher, MetadataContainer } from './common.js';
import { Context, SheetSettings } from './context.js';
export * from './mock-data.js';
export declare const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/123/test";
interface MockBox {
    ctx: Context;
    ss: Spreadsheet;
    ws: Worksheet;
    settings: SheetSettings;
}
/** Returns a context with a mock spreadsheet and one mock worksheet */
export declare function buildMocks(sheetName?: string): [Context, Spreadsheet, Worksheet, SheetSettings];
export declare function buildMocksWithSheet(data?: CELL_VALUE[][]): MockBox;
export declare class MockResponse implements FetchResponse {
    private responseCode;
    private contentText;
    private headers;
    constructor(contentText: string, responseCode?: number, headers?: Record<string, string>);
    getHeaders(): {};
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
    fetch(url: string, req: FetchRequest, _: any): FetchResponse;
    addMock(urlPattern: string | RegExp, contentText: string, responseCode?: number, headers?: Record<string, string>): void;
    setDefaultResponse(contentText: string, responseCode?: number): void;
    clear(): void;
}
export declare class MockXmlElement implements XmlElement {
    private $;
    private node;
    constructor($: cheerio.CheerioAPI, node: any);
    getChild(name: string): XmlElement | null;
    getChildren(name: string): XmlElement[];
    getText(): string;
    getValue(): string;
}
export declare class MockXmlDocument implements XmlDocument {
    private $;
    constructor($: cheerio.CheerioAPI);
    getRootElement(): XmlElement | null;
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
    setValues(values: CELL_VALUE[][]): MockRange;
    setBackground(): MockRange;
    setTextStyle(): MockRange;
    setVerticalAlignment(): MockRange;
    clear(): MockRange;
    setWrap(): MockRange;
}
declare abstract class MockMetadataContainer implements MetadataContainer {
    metadata: Record<string, string>;
    addDeveloperMetadata(key: string, value: string): MockMetadataContainer;
    createDeveloperMetadataFinder(): MockMetadataFinder;
}
declare class MockWorksheet extends MockMetadataContainer implements Worksheet {
    name: string;
    private id;
    private cells;
    constructor(name: string, sheetId: number);
    getSheetId(): number;
    getName(): string;
    clear(): void;
    getCell(r: number, c: number): CELL_VALUE;
    setCell(r: number, c: number, value: CELL_VALUE): void;
    deleteCell(r: number, c: number): void;
    getLastRow(): number;
    getLastColumn(): number;
    getDataRange(): MockRange;
    getRange(row: number, column: number, rowCount: number, colCount: number): MockRange;
    autoResizeColumns(): void;
    setColumnWidth(): void;
    getColumnWidth(): number;
    autoResizeRows(): void;
}
export declare class MockSpreadsheet extends MockMetadataContainer implements Spreadsheet {
    sheets: Map<string, MockWorksheet>;
    sheetsById: Map<number, MockWorksheet>;
    private sheetIndex;
    getId(): string;
    getSheetById(id: number): MockWorksheet | null;
    getSheetByName(name: string): MockWorksheet | null;
    insertSheet(name: string): MockWorksheet;
    getSheets(): Worksheet[];
}
export declare class MockMetadataFinder {
    source: MockMetadataContainer;
    key: string;
    constructor(source: MockMetadataContainer);
    withKey(key: string): MockMetadataFinder;
    find(): MockMetadata[];
}
declare class MockMetadata {
    finder: MockMetadataFinder;
    constructor(finder: MockMetadataFinder);
    getValue(): string | null;
    setValue(val: string): MockMetadata;
    remove(): void;
    getKey(): string;
    getId(): number;
}
