/**
 * feeds.js - Convert an RSS item to a Discord Embed.
 */
import { Context } from './context.js';
import { Embed, Message, Feed, XmlElement, SettingsInterface } from './common.js';
export declare function buildEmbed(_: Context, settings: SettingsInterface, xml: XmlElement): Embed;
/**
 * Send a message through discord using the webhook.
 */
export declare function sendDiscordMessage(embeds: Embed[], feed: Feed, ctx: Context): void;
export declare function applyLimits(ctx: Context, messages: Message[]): string[];
