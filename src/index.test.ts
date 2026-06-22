import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { run } from './index.js';
import { MockSpreadsheet, MockFetcher } from './mocks.js';
import { Context } from './context.js';

// --- Setup Global UrlFetchApp Mock ---
const mockFetcher = new MockFetcher();
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/test';
const FEED_1 = 'https://example.com/feed1';
const FEED_2 = 'https://example.com/feed2';

const activeSpreadsheet = (globalThis as any).SpreadsheetApp.getActive() as MockSpreadsheet;

const CTX = new Context(activeSpreadsheet);
CTX.fetcher = mockFetcher;

const SAMPLE_RSS_FEED = `
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Latest Post</title>
      <link>https://example.com/post1</link>
      <guid>guid-latest</guid>
      <description><![CDATA[<p>Paragraph text</p><img src="https://example.com/image.png" />]]></description>
    </item>
  </channel>
</rss>
`;

describe('index.ts run() integration tests', () => {
  beforeEach(() => {
    CTX.setSettings(CTX.getDefaults().map(r => [r[0], r[1]]));
    CTX.webhook.set(DISCORD_WEBHOOK);
    CTX.appname.set('Test Bot');
    activeSpreadsheet.sheets.clear();
    mockFetcher.clear();
  });

  test('successfully processes feeds, triggers discord webhook, and updates feed sheet row', () => {
    const feedsTab = activeSpreadsheet.insertSheet('feeds');
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    feedsTab.getRange(1, 1, 1, 6).setValues([headers]);
    feedsTab.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'ok']]);

    // Setup mocks
    mockFetcher.addMock(FEED_1, SAMPLE_RSS_FEED, 204);
    mockFetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);

    // Run execution
    run(CTX);

    // 1. Verify Discord message sent correctly
    const discordRequestPayload = JSON.parse(
      mockFetcher.requests[DISCORD_WEBHOOK]?.[0]?.req?.payload ?? '{}'
    );
    // assert.(discordRequestPayload);
    assert.strictEqual(discordRequestPayload.username, 'Test Bot');
    assert.strictEqual(discordRequestPayload.content, '<@123456> Posted:');
    assert.strictEqual(discordRequestPayload.embeds[0].title, 'Latest Post');
    assert.strictEqual(discordRequestPayload.embeds[0].url, 'https://example.com/post1');

    // 2. Verify sheet row was updated with new guid and status
    const feedValues = feedsTab.getDataRange().getValues();
    assert.strictEqual(feedValues[1][4], 'guid-latest');
    assert.strictEqual(feedValues[1][5], 'OK: found 1');
  });

  test('enforces feed_limit configuration', () => {
    // Override feed_limit to 1 in settings
    CTX.feed_limit.set(1);
    const feedsTab = activeSpreadsheet.insertSheet('feeds');
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    feedsTab.getRange(1, 1, 1, 6).setValues([headers]);
    feedsTab.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'ok']]);
    feedsTab.getRange(3, 1, 1, 6).setValues([[2, FEED_2, '123456', 0, '0', 'ok']]);

    mockFetcher.addMock(FEED_1, SAMPLE_RSS_FEED, 204);
    mockFetcher.addMock(FEED_2, SAMPLE_RSS_FEED, 204);
    mockFetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);
    run(CTX);

    const feedValues = feedsTab.getDataRange().getValues();
    // Feed 1 should be updated (processed)
    assert.strictEqual(feedValues[1][4], 'guid-latest');
    // Feed 2 should not be updated (skipped due to limit of 1)
    assert.strictEqual(feedValues[2][4], '0');
  });

  test('handles individual feed errors gracefully without failing the entire run', () => {
    const feedsTab = activeSpreadsheet.insertSheet('feeds');
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    feedsTab.getRange(1, 1, 1, 6).setValues([headers]);
    // Feed 1 fails due to 500 error, Feed 2 should succeed
    feedsTab.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/error-feed', '123456', 0, '0', 'ok']]);
    feedsTab.getRange(3, 1, 1, 6).setValues([[2, 'https://example.com/success-feed', '123456', 0, '0', 'ok']]);

    mockFetcher.addMock('https://example.com/error-feed', 'Internal Server Error', 500);
    mockFetcher.addMock('https://example.com/success-feed', SAMPLE_RSS_FEED, 204);
    mockFetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);

    run(CTX);

    const feedValues = feedsTab.getDataRange().getValues();
    // Feed 1 should record error status
    assert.strictEqual(feedValues[1][4], '0');
    assert.strictEqual(feedValues[1][5], 'ERROR: HTTP Response code: 500');

    // Feed 2 should succeed and be updated
    assert.strictEqual(feedValues[2][4], 'guid-latest');
    assert.strictEqual(feedValues[2][5], 'OK: found 1');
  });
});
