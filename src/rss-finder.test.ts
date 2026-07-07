import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as m from './mocks.js';
import { rssFinder } from './rss-finder.js';

describe('rss-finder.ts unit tests', () => {
  test('Requests and parses Feed', () => {
    const {ctx, ws, settings} = m.buildMocksWithSheet([
      ['', '123456', 0, '0', 'initial'],
      ['', '123456', 0, '0', 'initial'],
    ]);
    const fetcher = ctx.fetcher as m.MockFetcher;

    const feedUrl = 'https://example.com/rss.xml';
    fetcher.addMock(feedUrl, m.SAMPLE_RSS_FEED, 200, {
      'Content-Type': 'application/rss+xml;charset=utf-8',
    });
    
    const result = rssFinder(ctx, settings, feedUrl);
    assert.strictEqual(result, undefined, 'Expected no result');
    const vals = ws.getRange(4, 1, 1, 4).getValues()[0];
    const expected = [feedUrl, `[Test Feed](https://example.com)`, ctx.now, 'guid-1'];
    assert.deepEqual(vals, expected);
  });

  describe('load rss from html link tag', () => {
    const {ctx, ws, settings} = m.buildMocksWithSheet();
    const fetcher = ctx.fetcher as m.MockFetcher;

    const html = `
      <html><head>
        <link rel="alternate" type="application/rss+xml"
          href="/rss.rss" title="RSS Feed">
      </head><body>
        <h1>Hello, World.</h11>
      </body></html>`;

    const htmlUrl = 'https://example.com/';
    fetcher.addMock(htmlUrl, html, 200, {
      'Content-Type': 'text/html;charset=utf-8',
    });
    const feedUrl = 'https://example.com/rss.xml';
    fetcher.addMock(feedUrl, m.SAMPLE_RSS_FEED, 200, {
      'Content-Type': 'application/rss+xml;charset=utf-8',
    });

    const lastRow = ws.getLastRow();
    const result = rssFinder(ctx, settings, feedUrl);
    assert.strictEqual(result, undefined, 'Expected no result');
    const vals = ws.getRange(lastRow + 1, 1, 1, 4).getValues()[0];
    const expected = [feedUrl, `[Test Feed](https://example.com)`, ctx.now, 'guid-1'];
    assert.deepEqual(vals, expected);
  });

  describe('load rss from html anchor tag', () => {
    const {ctx, ws, settings} = m.buildMocksWithSheet();
    const fetcher = ctx.fetcher as m.MockFetcher;

    const html = `
      <html><head></head><body>
        <h1>Hello, World.</h1>
        <p><a href='/rss.xml'>Subscribe to my newsletter!</a></p>
      </body></html>`;

    const htmlUrl = 'https://example.com/';
    fetcher.addMock(htmlUrl, html, 200, {
      'Content-Type': 'text/html;charset=utf-8',
    });
    const feedUrl = 'https://example.com/rss.xml';
    fetcher.addMock(feedUrl, m.SAMPLE_RSS_FEED, 200, {
      'Content-Type': 'application/rss+xml;charset=utf-8',
    });

    const lastRow = ws.getLastRow();
    const result = rssFinder(ctx, settings, feedUrl);
    assert.strictEqual(result, undefined, 'Expected no result');
    const vals = ws.getRange(lastRow + 1, 1, 1, 4).getValues()[0];
    const expected = [feedUrl, `[Test Feed](https://example.com)`, ctx.now, 'guid-1'];
    assert.deepEqual(vals, expected);
  });
});
