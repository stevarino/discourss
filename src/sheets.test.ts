import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  setupFeedsTab,
  readSettingsTab,
  setupSettingsTab,
  writeLogs,
  readFeedsTab,
  updateFeedsTab,
} from './sheets.js';
import {
  Spreadsheet,
  CELL_VALUE,
  BaseContext,
  SHEET_HEADERS,
} from './common.js';
import {
  LOG_LEVEL, LOG_RECORD
} from './context.js';

import { MockSpreadsheet } from './mocks.js';

// --- Google Apps Script Mocks ---

// --- Helper to build fresh Context mock ---
function createTestContext(sheet: Spreadsheet): BaseContext {
  return {
    spreadsheet: sheet,
    feedHeaders: [],
    feedPatternRe: /^https:\/\//,
    error: () => {},
    warn: () => {},
    info: () => {}
  };
}

// --- Tests ---

describe('sheets.ts unit tests', () => {
  test('setupFeedsTab initializes sheets and populates all expected headers', () => {
    const sheet = new MockSpreadsheet();
    setupFeedsTab(sheet);

    const tab = sheet.getSheetByName('feeds');
    assert.ok(tab !== null);

    const values = tab.getDataRange().getValues();
    assert.strictEqual(values.length, 2);
    // Header labels on the first row, help texts on the second row (without Index)
    assert.deepStrictEqual(values[0], ['Feed', 'Discord', 'Time', 'GUID', 'Status']);
    assert.deepStrictEqual(values[1], ['RSS URL', 'User ID or Name', 'Auto; Set blank for forced rescan', 'Latest feed item; set to 0 to push all', 'Last run status']);
  });

  test('readSettingsTab throws error when setting sheet does not exist', () => {
    const sheet = new MockSpreadsheet();
    assert.throws(() => {
      readSettingsTab(sheet);
    }, /expected a sheet called "settings" - found none/);
  });

  test('setupSettingsTab inserts missing default settings', () => {
    const sheet = new MockSpreadsheet();
    const tab = sheet.insertSheet('settings');
    tab.getRange(1, 1, 1, 2).setValues([['existing_key', 'some_value']]);

    const defaults: [string, CELL_VALUE, string][] = [
      ['existing_key', 'default_val', 'help existing'],
      ['new_key', 'new_val', 'help new']
    ];

    setupSettingsTab(sheet, defaults);

    const values = tab.getDataRange().getValues();
    assert.deepStrictEqual(values, [
      ['existing_key', 'some_value', ''],
      ['new_key', 'new_val', 'help new']
    ]);
  });

  test('writeLogs writes headers and formatted log rows, pruning old logs', () => {
    const sheet = new MockSpreadsheet();
    
    // One old log (older than 7 days) and one recent log
    const now = Date.now();
    const logs: LOG_RECORD[] = [
      [now - 10 * 24 * 3600 * 1000, LOG_LEVEL.INFO, 'Old log entry'],
      [now, LOG_LEVEL.ERROR, 'Recent error log']
    ];

    writeLogs(sheet, logs);

    const tab = sheet.getSheetByName('logs');
    assert.ok(tab !== null);

    // Verify logs tab contains the new items
    const values = tab.getDataRange().getValues();
    assert.strictEqual(values[0][0], 'epoch');
    assert.strictEqual(values[1][0], now);
    assert.strictEqual(values[1][2], 'ERROR');
    assert.strictEqual(values[1][3], 'Recent error log');

    // Run again with another recent log to trigger pruning of the old logs
    const logs2: LOG_RECORD[] = [
      [now + 1000, LOG_LEVEL.WARNING, 'Warning log']
    ];
    writeLogs(sheet, logs2);

    const valuesPruned = tab.getDataRange().getValues();
    // Verify that the old log entry (from 10 days ago) is pruned, and only recent logs remain
    const firstColValues = valuesPruned.map(r => r[0]);
    assert.ok(!firstColValues.includes(now - 10 * 24 * 3600 * 1000));
  });

  test('readFeedsTab parses feed row items into SafeFeeds', () => {
    const sheet = new MockSpreadsheet();
    const tab = sheet.insertSheet('feeds');
    
    // Headers in row 1, values in row 2 & 3
    tab.getRange(1, 1, 1, 6).setValues([['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status']]);
    tab.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/feed1', 'discord-webhook-1', 1234567, 'guid-123', 'ok']]);
    tab.getRange(3, 1, 1, 6).setValues([[2, 'invalid-url', 'discord-webhook-2', 1234568, 'guid-456', 'ok']]);

    const ctx = createTestContext(sheet);
    const [, feeds] = readFeedsTab(ctx);

    // Verify only the valid feed (matching feedPatternRe /https:\/\//) is parsed
    assert.strictEqual(feeds.length, 1);
    assert.strictEqual(feeds[0].feed, 'https://example.com/feed1');
    assert.strictEqual(feeds[0].index, 1);
    assert.strictEqual(feeds[0].guid, 'guid-123');
  });

  test('updateFeedsTab writes updated cell values back to the specified cell', () => {
    const sheet = new MockSpreadsheet();
    const tab = sheet.insertSheet('feeds');
    
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    tab.getRange(1, 1, 1, 6).setValues([headers]);
    tab.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/feed1', 'discord-webhook-1', 1234567, 'guid-123', 'ok']]);

    updateFeedsTab(tab, 1, SHEET_HEADERS.guid, 'new-guid-value', headers);

    // Verify that the cell (row 2, column index 4 for 'GUID') was updated
    const values = tab.getDataRange().getValues();
    assert.strictEqual(values[1][4], 'new-guid-value');
  });
});
