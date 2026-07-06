/**
 * rss.js - functions related to processing RSS feeds.
 */
import { Result, Feed, Embed, SettingsInterface, XmlElement } from './common.js';
import { Context } from './context.js';
/**
 * Request an RSS feed and process it into a resulting set of embeds.
 */
export declare function processFeed(feed: Feed, ctx: Context): Result;
export declare function buildEmbed(_: Context, settings: SettingsInterface, xml: XmlElement): Embed;
