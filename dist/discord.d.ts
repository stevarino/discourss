/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { Context } from './context.js';
import { Embed, Feed, XmlElement, SettingsInterface } from './common.js';
export declare function buildEmbed(ctx: Context, settings: SettingsInterface, xml: XmlElement): Embed;
/**
 * Send a message through discord using the webhook.
 */
export declare function sendDiscordMessage(embeds: Embed[], feed: Feed, ctx: Context): void;
