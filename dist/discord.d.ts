/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { Context } from './context.js';
import { Embed, SafeFeed, XmlElement } from './common.js';
export declare function buildEmbed(ctx: Context, xml: XmlElement): Embed;
/**
 * Send a message through discord using the webhook.
 */
export declare function sendDiscordMessage(embeds: Embed[], feed: SafeFeed, ctx: Context): void;
