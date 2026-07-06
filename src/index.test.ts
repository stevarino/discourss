import { test, describe } from 'node:test';
import assert from 'node:assert';
import { run } from './index.js';
import { buildMocks, MockFetcher, DISCORD_WEBHOOK, MockResponse } from './mocks.js';

// --- Setup Global UrlFetchApp Mock ---
const FEED_1 = 'https://example.com/feed1';
const FEED_2 = 'https://example.com/feed2';

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
  test('successfully processes feeds, triggers discord webhook, and updates feed sheet row', () => {
    const [ctx, _, ws] = buildMocks();
    const settings = ctx.sheetSettings[ws.getSheetId()];
    settings.appname.value = 'Test Bot';
    settings.webhook.value = DISCORD_WEBHOOK;

    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    ws.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'initial']]);
    const fetcher = ctx.fetcher as MockFetcher;
    // Setup mocks
    fetcher.addMock(FEED_1, SAMPLE_RSS_FEED, 204);
    fetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);

    run(ctx);

    const payload = fetcher.requests[DISCORD_WEBHOOK]?.[0]?.req?.payload;
    assert.notStrictEqual(payload, undefined, 'no payload');
    // 1. Verify Discord message sent correctly
    const discordRequestPayload = JSON.parse(payload!);
    // assert.(discordRequestPayload);
    assert.strictEqual(discordRequestPayload.username, 'Test Bot');
    assert.strictEqual(discordRequestPayload.content, '<@123456> Posted:');
    assert.strictEqual(discordRequestPayload.embeds[0].title, 'Latest Post');
    assert.strictEqual(discordRequestPayload.embeds[0].url, 'https://example.com/post1');

    // 2. Verify sheet row was updated with new guid and status
    const feedValues = ws.getDataRange().getValues();
    assert.strictEqual(feedValues[1][4], 'guid-latest');
    assert.match(feedValues[1][5] as string, /1 successfu/);
  });

  test('enforces feed_limit configuration', () => {
    // Override feed_limit to 1 in settings
    const [ctx, _, ws] = buildMocks();
    const settings = ctx.sheetSettings[ws.getSheetId()];
    const fetcher = ctx.fetcher as MockFetcher;

    settings.feed_limit.set(1);
    settings.feedCount = 1;
    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    ws.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'initial']]);
    ws.getRange(3, 1, 1, 6).setValues([[2, FEED_2, '123456', 0, '0', 'initial']]);

    fetcher.addMock(FEED_1, SAMPLE_RSS_FEED, 204);
    fetcher.addMock(FEED_2, SAMPLE_RSS_FEED, 204);
    fetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);
    
    run(ctx);

    const feedValues = ws.getDataRange().getValues();
    // Feed 1 should be updated (processed)
    assert.strictEqual(feedValues[1][4], 'guid-latest');
    // Feed 2 should not be updated (skipped due to limit of 1)
    assert.strictEqual(feedValues[2][4], '0');
  });

  test('handles individual feed errors gracefully without failing the entire run', () => {
    const [ctx, _, ws] = buildMocks();
    const fetcher = ctx.fetcher as MockFetcher;

    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    // Feed 1 fails due to 500 error, Feed 2 should succeed
    ws.getRange(2, 1, 1, 6).setValues([[1, 'https://example.com/error-feed', '123456', 0, '0', 'initial']]);
    ws.getRange(3, 1, 1, 6).setValues([[2, 'https://example.com/success-feed', '123456', 0, '0', 'initial']]);

    fetcher.addMock('https://example.com/error-feed', 'Internal Server Error', 500);
    fetcher.addMock('https://example.com/success-feed', SAMPLE_RSS_FEED, 204);
    fetcher.addMock(DISCORD_WEBHOOK, 'OK', 204);

    run(ctx);

    const feedValues = ws.getDataRange().getValues();
    // Feed 1 should record error status
    assert.strictEqual(feedValues[1][4], '0');
    assert.match(feedValues[1][5] as string, /ERROR.*\b500\b/);

    // Feed 2 should succeed and be updated
    assert.strictEqual(feedValues[2][4], 'guid-latest');
    assert.match(feedValues[2][5] as string, /^OK:.*\b1\b/);
  });

  test('handles rate limiting by retrying when rate limited (HTTP 429)', () => {
    const [ctx, _, ws, settings] = buildMocks();
    settings.bundle.value = false; // ensures each embed is sent in its own request

    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    ws.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'initial']]);

    const fetcher = ctx.fetcher as MockFetcher;
    
    // Setup feed mock with 2 items to trigger 2 webhooks
    const multipleItemsRss = `
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <link>https://example.com</link>
        <item>
          <title>Post 1</title>
          <link>https://example.com/post1</link>
          <guid>guid-1</guid>
          <description>Post 1 description</description>
        </item>
        <item>
          <title>Post 2</title>
          <link>https://example.com/post2</link>
          <guid>guid-2</guid>
          <description>Post 2 description</description>
        </item>
      </channel>
    </rss>
    `;
    fetcher.addMock(FEED_1, multipleItemsRss, 204);

    let callCount = 0;
    fetcher.fetch = (url: string, req: any, log?: any) => {
      if (url === DISCORD_WEBHOOK) {
        callCount++;
        if (callCount === 1) {
          // Return 429 on the first webhook payload
          return new MockResponse('Too Many Requests', 429);
        }
        return new MockResponse('OK', 204);
      }
      return MockFetcher.prototype.fetch.call(fetcher, url, req, log);
    };

    run(ctx);

    // Verify both payloads were eventually delivered successfully after retries
    const feedValues = ws.getDataRange().getValues();
    assert.strictEqual(feedValues[1][4], 'guid-1'); // latest guid
    assert.match(feedValues[1][5] as string, /^OK:.*\b2 successful\b/);
    assert.ok(ctx.now + 2 <= ctx.rateLimiter.getTime(), 'expected two seconds to pass')
    assert.strictEqual(callCount, 3); // 1 (429) + 2 (successes) = 3 calls
  });

  test('follows x-ratelimit-remaining and x-ratelimit-reset headers', () => {
    const [ctx, _, ws, settings] = buildMocks();
    settings.bundle.value = false; // ensures each embed is sent in its own request

    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    ws.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'initial']]);

    const fetcher = ctx.fetcher as MockFetcher;
    
    // Setup feed mock with 2 items to trigger 2 webhooks
    const multipleItemsRss = `
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <link>https://example.com</link>
        <item>
          <title>Post 1</title>
          <link>https://example.com/post1</link>
          <guid>guid-1</guid>
          <description>Post 1 description</description>
        </item>
        <item>
          <title>Post 2</title>
          <link>https://example.com/post2</link>
          <guid>guid-2</guid>
          <description>Post 2 description</description>
        </item>
      </channel>
    </rss>
    `;
    fetcher.addMock(FEED_1, multipleItemsRss, 204);

    let callCount = 0;
    fetcher.fetch = (url: string, req: any, log?: any) => {
      if (url === DISCORD_WEBHOOK) {
        callCount++;
        return new MockResponse('Too Many Requests', 204, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(ctx.now + 5), // resets 2 seconds in the future
        });
      }
      return MockFetcher.prototype.fetch.call(fetcher, url, req, log);
    };

    run(ctx);

    // Verify both payloads were eventually delivered successfully after retries
    const feedValues = ws.getDataRange().getValues();
    assert.strictEqual(feedValues[1][4], 'guid-1'); // latest guid
    assert.match(feedValues[1][5] as string, /^OK:.*\b2 successful\b/);
    assert.ok(ctx.now + 5 <= ctx.rateLimiter.getTime(), 'expected two seconds to pass')
    assert.strictEqual(callCount, 2);
  });

  test('aborts if delay is too long', () => {
    const [ctx, _, ws, settings] = buildMocks();
    settings.bundle.value = false; // ensures each embed is sent in its own request

    const headers = ['Index', 'Feed', 'Discord', 'Time', 'GUID', 'Status'];
    ws.getRange(1, 1, 1, 6).setValues([headers]);
    ws.getRange(2, 1, 1, 6).setValues([[1, FEED_1, '123456', 0, '0', 'initial']]);

    const fetcher = ctx.fetcher as MockFetcher;
    
    // Setup feed mock with 2 items to trigger 2 webhooks
    const multipleItemsRss = `
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <link>https://example.com</link>
        <item>
          <title>Post 1</title>
          <link>https://example.com/post1</link>
          <guid>guid-1</guid>
          <description>Post 1 description</description>
        </item>
        <item>
          <title>Post 2</title>
          <link>https://example.com/post2</link>
          <guid>guid-2</guid>
          <description>Post 2 description</description>
        </item>
      </channel>
    </rss>
    `;
    fetcher.addMock(FEED_1, multipleItemsRss, 204);

    let callCount = 0;
    fetcher.fetch = (url: string, req: any, log?: any) => {
      if (url === DISCORD_WEBHOOK) {
        callCount++;
        return new MockResponse('Too Many Requests', 204, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(ctx.now + 45), // resets 2 seconds in the future
        });
      }
      return MockFetcher.prototype.fetch.call(fetcher, url, req, log);
    };

    run(ctx);

    // Verify both payloads were eventually delivered successfully after retries
    const feedValues = ws.getDataRange().getValues();
    assert.strictEqual(feedValues[1][4], 'guid-1'); // latest guid
    assert.match(feedValues[1][5] as string, /^ERROR:.*Did not finish.*\b1 unprocessed\b/);
    assert.ok(ctx.rateLimiter.getTime() - ctx.now <= 30, `should abort before timeout period: ${ctx.rateLimiter.getTime() - ctx.now}`)
    assert.strictEqual(callCount, 1);
  });
});
