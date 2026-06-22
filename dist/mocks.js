/** mocks.ts - Mocks used in testing. */
import * as cheerio from 'cheerio';
import { Fetcher } from "./fetch.js";
// import { CONFIG } from './common.js';
// CONFIG.LOG_TO_STDERR = true;
export function createTestContext(sheet) {
    return {
        spreadsheet: sheet,
        feedHeaders: [],
        feedPatternRe: /^https:\/\//,
        error: () => { },
        warn: () => { },
        info: () => { }
    };
}
export class MockResponse {
    constructor(contentText, responseCode = 200) {
        this.contentText = contentText;
        this.responseCode = responseCode;
    }
    getResponseCode() {
        return this.responseCode;
    }
    getContentText() {
        return this.contentText;
    }
}
export class MockFetcher extends Fetcher {
    constructor() {
        super(...arguments);
        this.rules = [];
        this.defaultResponse = new MockResponse('', 404);
        this.requests = {};
    }
    fetch(url, req) {
        let res = null;
        for (const rule of this.rules) {
            if (typeof rule.urlPattern === 'string') {
                if (url === rule.urlPattern) {
                    res = rule.response;
                    break;
                }
            }
            else if (rule.urlPattern instanceof RegExp) {
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
    addMock(urlPattern, contentText, responseCode = 200) {
        this.rules.push({
            urlPattern,
            response: new MockResponse(contentText, responseCode)
        });
    }
    setDefaultResponse(contentText, responseCode = 404) {
        this.defaultResponse = new MockResponse(contentText, responseCode);
    }
    clear() {
        this.rules = [];
        this.requests = {};
    }
}
export class MockXmlElement {
    constructor($, node) {
        this.$ = $;
        this.node = node;
    }
    getChild(name) {
        const childNode = this.$(this.node).children(name).first()[0];
        return childNode ? new MockXmlElement(this.$, childNode) : null;
    }
    getChildren(name) {
        const childrenNodes = this.$(this.node).children(name).toArray();
        return childrenNodes.map(node => new MockXmlElement(this.$, node));
    }
    getText() {
        return this.$(this.node).text();
    }
    getValue() {
        return this.$(this.node).text() || '';
    }
}
export class MockXmlDocument {
    constructor($) {
        this.$ = $;
    }
    getRootElement() {
        const rootNode = this.$.root().children().first()[0];
        return rootNode ? new MockXmlElement(this.$, rootNode) : null;
    }
}
export const MockXmlService = {
    parse(xml) {
        const $ = cheerio.load(xml, { xmlMode: true });
        return new MockXmlDocument($);
    }
};
// --- sheets Mocks ---
export class MockStyleBuilder {
    setFontSize() { return this; }
    setBold() { return this; }
    setForegroundColor() { return this; }
    build() { return {}; }
}
export class MockRange {
    constructor(sheet, startRow, startCol, numRows, numCols) {
        this.sheet = sheet;
        this.startRow = startRow;
        this.startCol = startCol;
        this.numRows = numRows;
        this.numCols = numCols;
    }
    getValues() {
        const values = [];
        for (let r = 0; r < this.numRows; r++) {
            const rowArr = [];
            for (let c = 0; c < this.numCols; c++) {
                rowArr.push(this.sheet.getCell(this.startRow - 1 + r, this.startCol - 1 + c));
            }
            values.push(rowArr);
        }
        return values;
    }
    setValues(values) {
        for (let r = 0; r < values.length; r++) {
            const colsToWrite = Math.min(this.numCols, values[r].length);
            for (let c = 0; c < colsToWrite; c++) {
                this.sheet.setCell(this.startRow - 1 + r, this.startCol - 1 + c, values[r][c]);
            }
        }
    }
    setBackground() { return this; }
    setTextStyle() { return this; }
    clear() {
        for (let r = 0; r < this.numRows; r++) {
            for (let c = 0; c < this.numCols; c++) {
                this.sheet.deleteCell(this.startRow - 1 + r, this.startCol - 1 + c);
            }
        }
    }
    setWrap() { return this; }
}
class MockWorksheet {
    constructor(name) {
        this.cells = new Map();
        this.name = name;
    }
    getCell(r, c) {
        var _a;
        return (_a = this.cells.get(`${r},${c}`)) !== null && _a !== void 0 ? _a : '';
    }
    setCell(r, c, value) {
        this.cells.set(`${r},${c}`, value);
    }
    deleteCell(r, c) {
        this.cells.delete(`${r},${c}`);
    }
    getLastRow() {
        let maxRow = -1;
        for (const key of this.cells.keys()) {
            const r = parseInt(key.split(',')[0], 10);
            if (r > maxRow) {
                maxRow = r;
            }
        }
        return maxRow + 1;
    }
    getDataRange() {
        if (this.cells.size === 0) {
            return new MockRange(this, 1, 1, 0, 0);
        }
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;
        for (const key of this.cells.keys()) {
            const [r, c] = key.split(',').map(Number);
            if (r < minRow)
                minRow = r;
            if (r > maxRow)
                maxRow = r;
            if (c < minCol)
                minCol = c;
            if (c > maxCol)
                maxCol = c;
        }
        return new MockRange(this, minRow + 1, minCol + 1, maxRow - minRow + 1, maxCol - minCol + 1);
    }
    getRange(row, column, rowCount, colCount) {
        return new MockRange(this, row, column, rowCount, colCount);
    }
    autoResizeColumns() { }
    setColumnWidth() { }
    getColumnWidth() { return 100; }
    autoResizeRows() { }
}
export class MockSpreadsheet {
    constructor() {
        this.sheets = new Map();
    }
    getSheetByName(name) {
        var _a;
        return (_a = this.sheets.get(name)) !== null && _a !== void 0 ? _a : null;
    }
    insertSheet(name) {
        const ws = new MockWorksheet(name);
        this.sheets.set(name, ws);
        return ws;
    }
}
// Global mocks setup
const activeSpreadsheet = new MockSpreadsheet();
globalThis.SpreadsheetApp = {
    newTextStyle() {
        return new MockStyleBuilder();
    },
    getActive() {
        return activeSpreadsheet;
    }
};
const registeredTriggers = [];
globalThis.ScriptApp = {
    getProjectTriggers() {
        return registeredTriggers.map(handler => ({
            getHandlerFunction: () => handler
        }));
    },
    newTrigger(handler) {
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
globalThis.XmlService = MockXmlService;
globalThis.Cheerio = cheerio;
