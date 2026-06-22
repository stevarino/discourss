/** mocks.ts - Mocks used in testing. */

import * as cheerio from 'cheerio';

import { Spreadsheet, CELL_VALUE, Worksheet, BaseContext } from './common.js';
import { FetchRequest, FetchResponse, Fetcher } from "./fetch.js";

// import { CONFIG } from './common.js';
// CONFIG.LOG_TO_STDERR = true;

export function createTestContext(sheet: Spreadsheet): BaseContext {
  return {
    spreadsheet: sheet,
    feedHeaders: [],
    feedPatternRe: /^https:\/\//,
    error: () => {},
    warn: () => {},
    info: () => {}
  };
}

export class MockResponse implements FetchResponse {
  private responseCode: number;
  private contentText: string;

  constructor(contentText: string, responseCode = 204) {
    this.contentText = contentText;
    this.responseCode = responseCode;
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

  override fetch(url: string, req: FetchRequest): FetchResponse {
    let res: FetchResponse|null = null;
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
    this.requests[url].push({req, res});
    return res;
  }

  addMock(urlPattern: string | RegExp, contentText: string, responseCode = 204): void {
    this.rules.push({
      urlPattern,
      response: new MockResponse(contentText, responseCode)
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


export class MockXmlElement {
  private $: cheerio.CheerioAPI;
  private node: any;

  constructor($: cheerio.CheerioAPI, node: any) {
    this.$ = $;
    this.node = node;
  }

  getChild(name: string): MockXmlElement | null {
    const childNode = this.$(this.node).children(name).first()[0];
    return childNode ? new MockXmlElement(this.$, childNode) : null;
  }

  getChildren(name: string): MockXmlElement[] {
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

export class MockXmlDocument {
  private $: cheerio.CheerioAPI;

  constructor($: cheerio.CheerioAPI) {
    this.$ = $;
  }

  getRootElement(): MockXmlElement | null {
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

  setValues(values: CELL_VALUE[][]): void {
    for (let r = 0; r < values.length; r++) {
      const colsToWrite = Math.min(this.numCols, values[r].length);
      for (let c = 0; c < colsToWrite; c++) {
        this.sheet.setCell(this.startRow - 1 + r, this.startCol - 1 + c, values[r][c]);
      }
    }
  }

  setBackground(): MockRange { return this; }
  setTextStyle(): MockRange { return this; }
  clear(): void {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.deleteCell(this.startRow - 1 + r, this.startCol - 1 + c);
      }
    }
  }
  setWrap(): MockRange { return this; }
}

class MockWorksheet implements Worksheet {
  public name: string;
  private cells = new Map<string, CELL_VALUE>();

  constructor(name: string) {
    this.name = name;
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
      const r = parseInt(key.split(',')[0], 10);
      if (r > maxRow) {
        maxRow = r;
      }
    }
    return maxRow + 1;
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

export class MockSpreadsheet implements Spreadsheet {
  public sheets: Map<string, MockWorksheet> = new Map();

  getSheetByName(name: string): MockWorksheet | null {
    return this.sheets.get(name) ?? null;
  }

  insertSheet(name: string): MockWorksheet {
    const ws = new MockWorksheet(name);
    this.sheets.set(name, ws);
    return ws;
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