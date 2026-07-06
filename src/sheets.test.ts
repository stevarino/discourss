import { test, describe } from 'node:test';
import assert from 'node:assert';
import { setupFeedsTab, writeLogs, readFeedsTabs, updateFeedsTab, LOGS_TAB } from './sheets.js';
import { SHEET_HEADERS } from './common.js';
import { LOG_LEVEL, LOG_RECORD } from './context.js';

import { buildMocks } from './mocks.js';

const WORKSHEET_NAME = 'Feeds';

// --- Tests ---

describe('sheets.ts unit tests', () => {
  test('setupFeedsTab initializes sheets and populates all expected headers', () => {
    const [_, sheet, worksheet] = buildMocks();
    setupFeedsTab(worksheet);

    const tab = sheet.getSheetByName(WORKSHEET_NAME);
    assert.ok(tab !== null);

    const values = tab.getDataRange().getValues();
    assert.strictEqual(values.length, 2);
    // Header labels on the first row, help texts on the second row (without Index)
    assert.deepStrictEqual(values[0], ['Feed', 'Discord', 'Time', 'GUID', 'Status']);
    assert.deepStrictEqual(values[1], ['RSS URL', 'User ID or Name', 'Auto; Set blank for forced rescan', 'Latest feed item; set to 0 to push all', 'Last run status']);
  });

  test('writeLogs writes headers and formatted log rows, pruning old logs', () => {
    const [_, sheet] = buildMocks();

    // One old log (older than 7 days) and one recent log
    const now = Date.now();
    const logs: LOG_RECORD[] = [
      [now - 10 * 24 * 3600 * 1000, LOG_LEVEL.INFO, 'Old log entry'],
      [now, LOG_LEVEL.ERROR, 'Recent error log']
    ];

    writeLogs(sheet, logs);

    const tab = sheet.getSheetByName(LOGS_TAB);
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

  test('readFeedsTab parses feed row items into Feed objects', () => {
    const [ctx, _, tab] = buildMocks();
    // Headers in row 1, values in row 2 & 3
    tab.getRange(1, 1, 1, 6).setValues([['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status']]);
    tab.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/feed1', 'discord-webhook-1', 1234567, 'guid-123', 'ok']]);
    tab.getRange(3, 1, 1, 6).setValues([[2, 'invalid-url', 'discord-webhook-2', 1234568, 'guid-456', 'ok']]);
    const feeds = readFeedsTabs(ctx);

    // Verify only the valid feed (matching feedPatternRe /https:\/\//) is parsed
    assert.strictEqual(feeds.length, 1);
    assert.strictEqual(feeds[0].feed, 'https://example.com/feed1');
    assert.strictEqual(feeds[0].index, 1);
    assert.strictEqual(feeds[0].guid, 'guid-123');
  });

  test('updateFeedsTab writes updated cell values back to the specified cell', () => {
    const [ctx, _, tab] = buildMocks();
    
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    tab.getRange(1, 1, 1, 6).setValues([headers]);
    tab.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/feed1', 'discord-webhook-1', 1234567, 'guid-123', 'ok']]);
    const feeds = readFeedsTabs(ctx);
    assert.strictEqual(feeds.length, 1);

    updateFeedsTab(feeds[0], SHEET_HEADERS.guid, 'new-guid-value');

    // Verify that the cell (row 2, column index 4 for 'GUID') was updated
    const values = tab.getDataRange().getValues();
    assert.strictEqual(values[1][4], 'new-guid-value');
  });
});
