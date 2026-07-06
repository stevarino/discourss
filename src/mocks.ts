/** mocks.ts - Mocks used in testing. */

import * as cheerio from 'cheerio';

import {
  Spreadsheet, CELL_VALUE, Worksheet, XmlDocument, XmlElement,
  FetchRequest, FetchResponse, Fetcher, MetadataContainer
} from './common.js';
import { Context, SheetSettings } from './context.js';
import { MockRatelimiter } from './ratelimiter.js';

export const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/123/test';

/** Returns a context with a mock spreadsheet and one mock worksheet */
export function buildMocks(sheetName='Feeds'): [Context, Spreadsheet, Worksheet, SheetSettings] {
  const ss = new MockSpreadsheet();
  const ws = ss.insertSheet(sheetName)
  const ctx = new Context(ss);
  ctx.now = 499280400;
  ctx.fetcher = new MockFetcher();
  ctx.rateLimiter = new MockRatelimiter(ctx.now);
  const settings = ctx.sheetSettings[ws.getSheetId()];
  settings.isSet = true;
  settings.webhook.set(DISCORD_WEBHOOK)
  return [ctx, ss, ws, settings];
}

export class MockResponse implements FetchResponse {
  private responseCode: number;
  private contentText: string;
  private headers: Record<string, string>;

  constructor(contentText: string, responseCode = 200, headers: Record<string, string> = {}) {
    this.contentText = contentText;
    this.responseCode = responseCode;
    this.headers = headers;
  }

  getHeaders(): {} {
    return this.headers;
  }

  getResponseCode(): number {
    return this.responseCode;
  }

  getContentText(): string {
    return this.contentText;
  }
}

export class MockFetcher extends Fetcher {
  private rules: { urlPattern: string | RegExp; response: FetchResponse }[] = [];
  private defaultResponse: FetchResponse = new MockResponse('', 404);
  requests: Record<string, {req: FetchRequest, res: FetchResponse}[]> = {};

  override fetch(url: string, req: FetchRequest, _: any): FetchResponse {
    let res: FetchResponse | null = null;
    for (const rule of this.rules) {
      if (typeof rule.urlPattern === 'string') {
        if (url === rule.urlPattern) {
          res = rule.response;
          break;
        }
      } else if (rule.urlPattern instanceof RegExp) {
        if (rule.urlPattern.test(url)) {
          res = rule.response;
          break;
        }
      }
    }
    if (!res) {
      res = this.defaultResponse;
    }
    if (!this.requests[url]) {
      this.requests[url] = [];
    }
    this.requests[url].push({ req, res });
    return res;
  }

  addMock(urlPattern: string | RegExp, contentText: string, responseCode = 200, headers: Record<string, string> = {}): void {
    this.rules.push({
      urlPattern,
      response: new MockResponse(contentText, responseCode, headers)
    });
  }

  setDefaultResponse(contentText: string, responseCode = 404): void {
    this.defaultResponse = new MockResponse(contentText, responseCode);
  }

  clear(): void {
    this.rules = [];
    this.requests = {};
  }
}


export class MockXmlElement implements XmlElement {
  private $: cheerio.CheerioAPI;
  private node: any;

  constructor($: cheerio.CheerioAPI, node: any) {
    this.$ = $;
    this.node = node;
  }

  getChild(name: string): XmlElement | null {
    const childNode = this.$(this.node).children(name).first()[0];
    return childNode ? new MockXmlElement(this.$, childNode) : null;
  }

  getChildren(name: string): XmlElement[] {
    const childrenNodes = this.$(this.node).children(name).toArray();
    return childrenNodes.map(node => new MockXmlElement(this.$, node));
  }

  getText(): string {
    return this.$(this.node).text();
  }

  getValue(): string {
    return this.$(this.node).text() || '';
  }
}

export class MockXmlDocument implements XmlDocument {
  private $: cheerio.CheerioAPI;

  constructor($: cheerio.CheerioAPI) {
    this.$ = $;
  }

  getRootElement(): XmlElement | null {
    const rootNode = this.$.root().children().first()[0];
    return rootNode ? new MockXmlElement(this.$, rootNode) : null;
  }
}

export const MockXmlService = {
  parse(xml: string): MockXmlDocument {
    const $ = cheerio.load(xml, { xmlMode: true });
    return new MockXmlDocument($);
  }
};


// --- sheets Mocks ---


export class MockStyleBuilder {
  setFontSize(): MockStyleBuilder { return this; }
  setBold(): MockStyleBuilder { return this; }
  setForegroundColor(): MockStyleBuilder { return this; }
  build(): object { return {}; }
}

export class MockRange {
  private sheet: MockWorksheet;
  private startRow: number;
  private startCol: number;
  private numRows: number;
  private numCols: number;

  constructor(sheet: MockWorksheet, startRow: number, startCol: number, numRows: number, numCols: number) {
    this.sheet = sheet;
    this.startRow = startRow;
    this.startCol = startCol;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues(): CELL_VALUE[][] {
    const values: CELL_VALUE[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr: CELL_VALUE[] = [];
      for (let c = 0; c < this.numCols; c++) {
        rowArr.push(this.sheet.getCell(this.startRow - 1 + r, this.startCol - 1 + c));
      }
      values.push(rowArr);
    }
    return values;
  }

  setValues(values: CELL_VALUE[][]): MockRange {
    for (let r = 0; r < values.length; r++) {
      const colsToWrite = Math.min(this.numCols, values[r].length);
      for (let c = 0; c < colsToWrite; c++) {
        this.sheet.setCell(this.startRow - 1 + r, this.startCol - 1 + c, values[r][c]);
      }
    }
    return this;
  }

  setBackground(): MockRange { return this; }
  setTextStyle(): MockRange { return this; }
  setVerticalAlignment(): MockRange { return this; }
  clear(): MockRange {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.deleteCell(this.startRow - 1 + r, this.startCol - 1 + c);
      }
    }
    return this;
  }
  setWrap(): MockRange { return this; }
}

abstract class MockMetadataContainer implements MetadataContainer {
  public metadata: Record<string, string> = {};

  addDeveloperMetadata(key: string, value: string): MockMetadataContainer {
    this.metadata[key] = value;
    return this;
  }

  createDeveloperMetadataFinder(): MockMetadataFinder {
    return new MockMetadataFinder(this);
  }
}

class MockWorksheet extends MockMetadataContainer implements Worksheet  {
  public name: string;
  private id: number;
  private cells = new Map<string, CELL_VALUE>();

  constructor(name: string, sheetId: number) {
    super();
    this.id = sheetId;
    this.name = name;
  }

  getSheetId(): number {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  clear(): void {
    this.cells.clear();
  }

  getCell(r: number, c: number): CELL_VALUE {
    return this.cells.get(`${r},${c}`) ?? '';
  }

  setCell(r: number, c: number, value: CELL_VALUE): void {
    this.cells.set(`${r},${c}`, value);
  }

  deleteCell(r: number, c: number): void {
    this.cells.delete(`${r},${c}`);
  }

  getLastRow(): number {
    let maxRow = -1;
    for (const key of this.cells.keys()) {
      const r = parseInt(key.split(',')[0]);
      if (r > maxRow) {
        maxRow = r;
      }
    }
    return maxRow + 1;
  }

  getLastColumn(): number {
    const maxCol = Math.max(-1, ...Array.from(this.cells.keys()).map(
      k => parseInt(k.split(',')[1]))) + 1;
    return maxCol;    
  }

  getDataRange(): MockRange {
    if (this.cells.size === 0) {
      return new MockRange(this, 1, 1, 0, 0);
    }
    let minRow = Infinity, maxRow = -Infinity;
    let minCol = Infinity, maxCol = -Infinity;
    for (const key of this.cells.keys()) {
      const [r, c] = key.split(',').map(Number);
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
    }
    return new MockRange(this, minRow + 1, minCol + 1, maxRow - minRow + 1, maxCol - minCol + 1);
  }

  getRange(row: number, column: number, rowCount: number, colCount: number): MockRange {
    return new MockRange(this, row, column, rowCount, colCount);
  }

  autoResizeColumns(): void {}
  setColumnWidth(): void {}
  getColumnWidth() { return 100; }
  autoResizeRows(): void {}
}

export class MockSpreadsheet extends MockMetadataContainer implements Spreadsheet {
  public sheets: Map<string, MockWorksheet> = new Map();
  public sheetsById: Map<number, MockWorksheet> = new Map();
  private sheetIndex = 0;
  
  getId(): string {
    return 'test';
  }

  getSheetById(id: number): MockWorksheet | null {
    return this.sheetsById.get(id) ?? null;
  }

  getSheetByName(name: string): MockWorksheet | null {
    return this.sheets.get(name) ?? null;
  }

  insertSheet(name: string): MockWorksheet {
    this.sheetIndex += 1;
    const ws = new MockWorksheet(name, this.sheetIndex);
    this.sheets.set(name, ws);
    this.sheetsById.set(this.sheetIndex, ws);
    return ws;
  }

  getSheets(): Worksheet[] {
    return Array.from(this.sheets.values());
  }
}

export class MockMetadataFinder {
  key: string = ''
  constructor(public source: MockMetadataContainer) {}
  
  withKey(key: string): MockMetadataFinder {
    this.key = key;
    return this;
  }

  find(): MockMetadata[]  {
    if (this.source.metadata[this.key]) {
      return [new MockMetadata(this)];
    }
    return [];
  }
}

class MockMetadata {
  constructor(public finder: MockMetadataFinder) {}

  getValue(): string | null {
    return this.finder.source.metadata[this.finder.key] ?? null;
  }

  setValue(val: string): MockMetadata {
    this.finder.source.metadata[this.finder.key] = val;
    return this;
  }

  remove(): void {
    delete this.finder.source.metadata[this.finder.key];
  }

  getKey(): string {
    return this.finder.key;
  }

  getId(): number {
    return 0;
  }
}

// Global mocks setup
const activeSpreadsheet = new MockSpreadsheet();
(globalThis as any).SpreadsheetApp = {
  newTextStyle() {
    return new MockStyleBuilder();
  },
  getActive() {
    return activeSpreadsheet;
  }
};

const registeredTriggers: string[] = [];
(globalThis as any).ScriptApp = {
  getProjectTriggers() {
    return registeredTriggers.map(handler => ({
      getHandlerFunction: () => handler
    }));
  },
  newTrigger(handler: string) {
    return {
      timeBased() {
        return {
          everyMinutes() {
            return {
              create() {
                registeredTriggers.push(handler);
              }
            };
          }
        };
      }
    };
  }
};

// --- Global Mocks for Google Apps Script ---

// Expose globals that the implementation expects
(globalThis as any).XmlService = MockXmlService;
(globalThis as any).Cheerio = cheerio;