/** rss-finder.js - Given a URL, find the RSS URL and enter it to the sheet */
import { Context, SheetSettings } from "./context.js";
export declare function rssFinder(ctx: Context, settings: SheetSettings, url: string): string | undefined;
