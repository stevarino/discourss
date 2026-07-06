import { test, describe } from 'node:test';
import assert from 'node:assert';
import { processFeed } from './rss.js';
import { buildMocks } from './mocks.js';
import { STATUS } from './common.js';
const SAMPLE_RSS_FEED = `
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test RSS feed</description>
    <item>
      <title>Item 1</title>
      <link>https://example.com/item1</link>
      <guid>guid-1</guid>
      <description><![CDATA[<p>Paragraph 1</p><p>Paragraph 2</p><img src="https://example.com/image1.png" />]]></description>
    </item>
    <item>
      <title>Item 2</title>
      <link>https://example.com/item2</link>
      <guid>guid-2</guid>
      <description><![CDATA[<p>Paragraph A</p><img src="https://example.com/image2.png" />]]></description>
    </item>
  </channel>
</rss>
`;
function newFeed(ctx, settings, extra) {
    return Object.assign({
        index: 1,
        feed: 'https://example.com/rss',
        time: ctx.now - 3 * 3600, // 3 hours ago
        discord: 'test-webhook',
        guid: 'guid-2',
        status: 'ok',
        settings: settings,
        counters: {
            successful: 0,
            error: 0,
            invalid: 0,
            unprocessed: 0,
        }
    }, extra !== null && extra !== void 0 ? extra : {});
}
// --- Tests ---
describe('rss.ts unit tests', () => {
    test('skips feed processing if checked recently (frequency limit)', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        settings.feed_frequency.value = 3600; // 1 hour limit
        const feed = newFeed(ctx, settings, { time: ctx.now - 1800 });
        ;
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.SKIP);
    });
    test('returns error status if server responds with non-204 status code', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, 'Internal Server Error', 500);
        const feed = newFeed(ctx, settings);
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.ERROR, 'did not return ERROR status');
        assert.match(result.status_text || '', /HTTP Response code: 500/);
    });
    test('correctly parses feed items and extracts title, link, guid, and description paragraphs', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, SAMPLE_RSS_FEED, 204);
        const feed = newFeed(ctx, settings, { guid: '0' });
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK, 'Incorrect status');
        assert.strictEqual(result.status_text, 'found 2');
        assert.strictEqual(result.guid, 'guid-1'); // first item is the latest guid
        const embeds = result.embeds || [];
        assert.strictEqual(embeds.length, 2);
        // Item 2 verification
        assert.strictEqual(embeds[0].title, 'Item 2');
        assert.strictEqual(embeds[0].url, 'https://example.com/item2');
        assert.strictEqual(embeds[0].description, 'Paragraph A');
        // Item 1 verification
        assert.strictEqual(embeds[1].title, 'Item 1');
        assert.strictEqual(embeds[1].url, 'https://example.com/item1');
        assert.strictEqual(embeds[1].description, 'Paragraph 1\n\nParagraph 2');
    });
    test('extracts images as main image or thumbnail based on configuration', () => {
        var _a, _b;
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const url = 'https://example.com/rss';
        const feed = newFeed(ctx, settings);
        // Case 1: image_format = 'image'
        {
            settings.image_format.value = 'image';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = result.embeds || [];
            assert.strictEqual(embeds.length, 1, 'only one embed expected');
            assert.strictEqual((_a = embeds[0].image) === null || _a === void 0 ? void 0 : _a.url, 'https://example.com/image1.png');
            assert.strictEqual(embeds[0].thumbnail, undefined);
        }
        // Case 2: image_format = 'thumbnail'
        {
            settings.image_format.value = 'thumbnail';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = result.embeds || [];
            assert.strictEqual(embeds[0].image, undefined);
            assert.strictEqual((_b = embeds[0].thumbnail) === null || _b === void 0 ? void 0 : _b.url, 'https://example.com/image1.png');
        }
        // Case 3: image_format = 'none'
        {
            settings.image_format.value = 'none';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = result.embeds || [];
            assert.strictEqual(embeds[0].image, undefined);
            assert.strictEqual(embeds[0].thumbnail, undefined);
        }
    });
    test('stops parsing when it hits the last seen guid', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, SAMPLE_RSS_FEED, 204);
        const feed = newFeed(ctx, settings, {
            guid: 'guid-2', // We have already seen Item 2, so only Item 1 (latest) is new
        });
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK);
        assert.strictEqual(result.status_text, 'found 1');
        assert.strictEqual(result.guid, 'guid-1');
        const embeds = result.embeds || [];
        assert.strictEqual(embeds.length, 1);
        assert.strictEqual(embeds[0].title, 'Item 1');
    });
    test('discards message embeds and flags as "new feed" if last seen guid is not found and is not "0"', () => {
        var _a;
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, SAMPLE_RSS_FEED, 204);
        const feed = newFeed(ctx, settings, {
            guid: 'non-existent-guid', // last seen guid isn't in this XML payload
        });
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK, 'Incorrect status.');
        assert.strictEqual(result.status_text, 'new feed');
        assert.strictEqual(result.guid, 'guid-1');
        assert.strictEqual((_a = result.embeds) === null || _a === void 0 ? void 0 : _a.length, 0, 'No embeds to prevent spamming');
    });
});
