/**
 * rss.js - functions related to processing RSS feeds.
 */
import { STATUS } from './common.js';
/**
 * Process Feed
 */
export function processFeed(feed, ctx) {
    // skip feed that has recently been scanned
    const diff = ctx.now - feed.time;
    if (diff < ctx.feed_frequency.value * 1000) {
        ctx.info(`${feed.feed} - hit frequency limit of ${ctx.feed_frequency} seconds (${diff / 1000}s) - skipping`);
        return { status: STATUS.SKIP, status_text: '' };
    }
    ctx.info(`${feed.feed} - fetching`);
    const res = UrlFetchApp.fetch(feed.feed, { muteHttpExceptions: true });
    if (res.getResponseCode() != 200) {
        return {
            status: STATUS.ERROR,
            status_text: `HTTP Response code: ${res.getResponseCode()}`
        };
    }
    return parseRssXml(res.getContentText(), feed, ctx);
}
function parseRssXml(content, feed, ctx) {
    var _a, _b;
    const msg = {
        username: feed.discord,
        embeds: [],
    };
    const doc = XmlService.parse(content.trim());
    const root = doc.getRootElement();
    if (!root) {
        throw Error('Failed to parse feed');
    }
    const channel = root.getChild('channel');
    if (!channel) {
        throw Error('channel element not found');
    }
    let firstGuid = '';
    let foundLast = false;
    let status = 'ok';
    const items = channel.getChildren("item");
    if (items.length === 0) {
        firstGuid = '0';
        status = 'no items';
    }
    for (const item of items) {
        const embed = {
            title: (_a = item.getChild("title")) === null || _a === void 0 ? void 0 : _a.getText(),
            url: (_b = item.getChild('link')) === null || _b === void 0 ? void 0 : _b.getText(),
            fields: [],
        };
        const guid = item.getChild('guid').getText();
        if (ctx.debug) {
            embed.fields.push({ name: 'guid', value: guid });
        }
        if (firstGuid === '') {
            firstGuid = guid;
        }
        if (guid === feed.guid) {
            foundLast = true;
            break;
        }
        const $ = Cheerio.load(item.getChild('description').getValue());
        const image = $('img').attr('src');
        if (image) {
            if (ctx.image_format.value == 'image') {
                embed.image = { url: image };
            }
            else if (ctx.image_format.value == 'thumbnail') {
                embed.thumbnail = { url: image };
            }
        }
        embed.description = [...$("p")].map(el => $(el).text()).join('\n\n').trim();
        msg.embeds.push(embed);
    }
    // TODO: better separate this.
    // new (to us) feed. we only care about entries moving forward, not
    // entries we have already seen.
    if (!foundLast && String(feed.guid) !== '0') {
        status = 'new feed';
        msg.embeds.length = 0;
    }
    else {
        status = `found ${msg.embeds.length}`;
    }
    return {
        status: STATUS.OK,
        status_text: status,
        guid: firstGuid,
        message: msg,
    };
}
