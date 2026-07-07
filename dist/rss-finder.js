/** rss-finder.js - Given a URL, find the RSS URL and enter it to the sheet */
import { HEADERS } from "./common.js";
import { parseXML } from "./rss.js";
import { updateFeedRow } from "./sheets.js";
const rssDocPtn = /<rss[^>]+ xmlns:atom="http:\/\/www.w3.org\/2005\/Atom"/;
export function rssFinder(ctx, settings, url) {
    const res = getResponse(ctx.fetch(url));
    const result = testRSSContent(ctx, res);
    if (result === undefined) {
        return addRSSFeed(ctx, settings, url, res.content);
    }
    else if (result !== "") {
        return result;
    }
    if (!(res.contentType.includes('text/html') || res.content.includes('<html'))) {
        ctx.info('Document does not appear to be HTML - aborting.');
        return 'Unable to find an RSS feed at or linked from the specified URL.';
    }
    const doc = Cheerio.load(res.content, { baseURI: url });
    // https://blog.whatwg.org/feed-autodiscovery
    // <link rel="alternate" type="application/atom+xml"
    //    href="/feed.atom" title="Atom Feed">
    // <link rel="alternate" type="application/rss+xml"
    //    href="/feed.rss" title="RSS Feed">
    for (const [label, linkType] of [
        ['Atom RSS', 'application/atom+xml'], ['RSS 2.0', 'application/rss+xml']
    ]) {
        const feedURL = doc(`link[type=${linkType}]`).attr('href');
        if (feedURL) {
            ctx.info(`Found ${label} URL: ${feedURL}`);
            const res = getResponse(ctx.fetch(feedURL));
            const result = testRSSContent(ctx, res);
            if (result === undefined) {
                return addRSSFeed(ctx, settings, feedURL, res.content);
            }
            else if (result !== "") {
                ctx.info(`${label} Response: ${result}`);
            }
            else {
                ctx.info(`Unable to resolve ${label} document.`);
            }
        }
    }
    const hrefs = doc('a[href*="rss"').map((_, el) => el.attribs['href']).get();
    ctx.info(`Unable to find <link> to feed, checking hyperlinks. Found ${hrefs.length} URLs.`);
    for (const href of hrefs) {
        if (!/^https?:.+\/.+\brss\b/.test(href)) {
            continue;
        }
        const res = getResponse(ctx.fetch(href));
        const result = testRSSContent(ctx, res);
        if (result === undefined) {
            ctx.info(`Found URL in link: ${href}; Processing.`);
            return addRSSFeed(ctx, settings, href, res.content);
        }
        ctx.info(`Found URL in link: ${href}; ${result || 'Unable to resolve.'}`);
    }
    return 'Unable to find feed. Please check the URL and see the Logs for more information.';
}
function getResponse(res) {
    var _a;
    const headers = res.getHeaders();
    return {
        code: res.getResponseCode().toString(),
        headers: headers,
        contentType: (_a = headers['Content-Type']) !== null && _a !== void 0 ? _a : '',
        content: res.getContentText(),
    };
}
/**
 * testRSSContent - returns undefined if no issue, string if error, and empty
 * string if unspecified error.
 */
function testRSSContent(ctx, res) {
    if (!res.code.startsWith('2')) {
        return `URL returned Status Code ${res.code}`;
    }
    if (res.contentType.includes('rss+xml')) {
        ctx.info('Header indicates RSS: adding.');
        return;
    }
    else if (rssDocPtn.test(res.content)) {
        ctx.info('Content indicates RSS: adding.');
        return;
    }
    return "";
}
function addRSSFeed(ctx, settings, url, content) {
    var _a, _b;
    let xmlFeed;
    try {
        xmlFeed = parseXML(content);
    }
    catch (e) {
        if (e instanceof Error) {
            return e.message;
        }
        return String(e);
    }
    const ws = settings.worksheet;
    updateFeedRow(ws, settings.feedHeaders, ws.getLastRow() + 1, [
        [HEADERS.feed, url],
        [HEADERS.discord, `[${xmlFeed.title}](${xmlFeed.link})`],
        [HEADERS.time, ctx.now],
        [HEADERS.guid, (_b = (_a = xmlFeed.items[0]) === null || _a === void 0 ? void 0 : _a.guid) !== null && _b !== void 0 ? _b : '0'],
    ]);
    return;
}
