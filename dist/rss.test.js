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
// --- Tests ---
describe('rss.ts unit tests', () => {
    test('skips feed processing if checked recently (frequency limit)', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        settings.feed_frequency.value = 3600; // 1 hour limit
        const feed = {
            index: 1,
            feed: 'https://example.com/rss',
            time: ctx.now - 1800 * 1000, // 30 mins ago
            discord: 'test-webhook',
            guid: 'guid-0',
            status: 'ok',
            settings: settings
        };
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.SKIP);
    });
    test('returns error status if server responds with non-204 status code', () => {
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, 'Internal Server Error', 500);
        const feed = {
            index: 1,
            feed: url,
            time: ctx.now - 7200 * 1000, // 2 hours ago (safely passes frequency check)
            discord: 'test-webhook',
            guid: 'guid-0',
            status: 'ok',
            settings: settings,
        };
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.ERROR);
        assert.match(result.status_text || '', /HTTP Response code: 500/);
    });
    test('correctly parses feed items and extracts title, link, guid, and description paragraphs', () => {
        var _a;
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, SAMPLE_RSS_FEED, 204);
        const feed = {
            index: 1,
            feed: url,
            time: ctx.now - 7200 * 1000,
            discord: 'test-webhook',
            guid: '0', // completely new feed, parses everything
            status: 'ok',
            settings: settings,
        };
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK);
        assert.strictEqual(result.status_text, 'found 2');
        assert.strictEqual(result.guid, 'guid-1'); // first item is the latest guid
        const embeds = ((_a = result.message) === null || _a === void 0 ? void 0 : _a.embeds) || [];
        assert.strictEqual(embeds.length, 2);
        // Item 1 verification
        assert.strictEqual(embeds[0].title, 'Item 1');
        assert.strictEqual(embeds[0].url, 'https://example.com/item1');
        assert.strictEqual(embeds[0].description, 'Paragraph 1\n\nParagraph 2');
        // Item 2 verification
        assert.strictEqual(embeds[1].title, 'Item 2');
        assert.strictEqual(embeds[1].url, 'https://example.com/item2');
        assert.strictEqual(embeds[1].description, 'Paragraph A');
    });
    test('extracts images as main image or thumbnail based on configuration', () => {
        var _a, _b, _c, _d, _e;
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const url = 'https://example.com/rss';
        const feed = {
            index: 1,
            feed: url,
            time: Date.now() - 7200 * 1000,
            discord: 'test-webhook',
            guid: '0',
            status: 'ok',
            settings: settings
        };
        // Case 1: image_format = 'image'
        {
            settings.image_format.value = 'image';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = ((_a = result.message) === null || _a === void 0 ? void 0 : _a.embeds) || [];
            assert.strictEqual((_b = embeds[0].image) === null || _b === void 0 ? void 0 : _b.url, 'https://example.com/image1.png');
            assert.strictEqual(embeds[0].thumbnail, undefined);
        }
        // Case 2: image_format = 'thumbnail'
        {
            settings.image_format.value = 'thumbnail';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = ((_c = result.message) === null || _c === void 0 ? void 0 : _c.embeds) || [];
            assert.strictEqual(embeds[0].image, undefined);
            assert.strictEqual((_d = embeds[0].thumbnail) === null || _d === void 0 ? void 0 : _d.url, 'https://example.com/image1.png');
        }
        // Case 3: image_format = 'none'
        {
            settings.image_format.value = 'none';
            ctx.fetcher.addMock(url, SAMPLE_RSS_FEED, 204);
            const result = processFeed(feed, ctx);
            const embeds = ((_e = result.message) === null || _e === void 0 ? void 0 : _e.embeds) || [];
            assert.strictEqual(embeds[0].image, undefined);
            assert.strictEqual(embeds[0].thumbnail, undefined);
        }
    });
    test('stops parsing when it hits the last seen guid', () => {
        var _a;
        const [ctx, _, ws] = buildMocks();
        const settings = ctx.sheetSettings[ws.getSheetId()];
        const mockFetcher = ctx.fetcher;
        const url = 'https://example.com/rss';
        mockFetcher.addMock(url, SAMPLE_RSS_FEED, 204);
        const feed = {
            index: 1,
            feed: url,
            time: ctx.now - 7200 * 1000,
            discord: 'test-webhook',
            guid: 'guid-2', // We have already seen Item 2, so only Item 1 (latest) is new
            status: 'ok',
            settings: settings
        };
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK);
        assert.strictEqual(result.status_text, 'found 1');
        assert.strictEqual(result.guid, 'guid-1');
        const embeds = ((_a = result.message) === null || _a === void 0 ? void 0 : _a.embeds) || [];
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
        const feed = {
            index: 1,
            feed: url,
            time: ctx.now - 7200 * 1000,
            discord: 'test-webhook',
            guid: 'non-existent-guid', // last seen guid isn't in this XML payload
            status: 'ok',
            settings: settings
        };
        const result = processFeed(feed, ctx);
        assert.strictEqual(result.status, STATUS.OK);
        assert.strictEqual(result.status_text, 'new feed');
        assert.strictEqual(result.guid, 'guid-1');
        assert.strictEqual((_a = result.message) === null || _a === void 0 ? void 0 : _a.embeds.length, 0); // embeds cleared to avoid flooding
    });
});
