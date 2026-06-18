export declare const DEFAULT_APP_NAME = "Sheets RSS to Discord";
export declare const FEEDS_TAB = "feeds";
export declare const SETTINGS_TAB = "settings";
export declare const LOGS_TAB = "logs";
export interface Feed {
    index: number;
    feed?: string;
    time?: number | string;
    discord?: string | number;
    guid?: string;
    status?: string;
}
export type SafeFeed = Feed & {
    time: number;
    feed: string;
};
export type FeedLookup = Record<keyof Feed, string | number | undefined>;
export interface Embed {
    title: string;
    url: string;
    description?: string;
    thumbnail?: {
        url: string;
    } | undefined;
    image?: {
        url: string;
    } | undefined;
    fields: {
        name: string;
        value: string;
    }[];
}
export interface Message {
    content?: string;
    username?: string | number;
    avatar_url?: string;
    embeds: Embed[];
    allowed_mentions?: {
        users: string[];
    };
}
export declare enum STATUS {
    OK = 0,
    SKIP = 1,
    EMPTY = 2,
    ERROR = 3,
    NONE = 4
}
export declare enum LOG_LEVEL {
    ERROR = 0,
    WARNING = 1,
    INFO = 2
}
export interface Result {
    status: STATUS;
    status_text: string;
    guid?: string;
    message?: Message;
    sheets_update?: [SHEET_HEADERS_FIELDS, string | number][];
}
export type LOG_RECORD = [number, LOG_LEVEL, string];
export interface Settings {
    appname: string;
    avatar_url?: string;
    webhook?: string;
    signature: string;
    image_format: "image" | "thumbnail" | "none";
    bundle: boolean;
    feed_pattern: string;
    feed_limit: number;
    feed_frequency: number;
    feed_pattern_re: RegExp;
    now: number;
    debug?: boolean;
    fetch: (url: string, params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => void;
    logs: LOG_RECORD[];
    log: (level: LOG_LEVEL, message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
    info: (message: string) => void;
}
export type FeedSettings = Settings & {
    url?: string;
    discord?: string | number;
    guid?: string;
};
export declare enum SETTINGS_FIELDS {
    appname = "appname",
    avatar_url = "avatar_url",
    webhook = "webhook",
    signature = "signature",
    image_format = "image_format",
    bundle = "bundle",
    feed_pattern = "feed_pattern",
    feed_limit = "feed_limit",
    feed_frequency = "feed_frequency"
}
export type SettingsRecord = Record<SETTINGS_FIELDS, string | number | boolean>;
export declare const DEFAULT_SETTINGS: Settings;
export declare function getDefaultSettings(): Settings;
export interface SHEET_HEADER_TYPES {
    label: string;
    help: string;
}
export type SHEET_HEADERS_FIELDS = 'index' | 'feed' | 'discord' | 'time' | 'guid' | 'status';
export declare const SHEET_HEADERS: Record<SHEET_HEADERS_FIELDS, SHEET_HEADER_TYPES>;
export declare const EXPECTED_HEADERS: string[];
export declare const HEADER_LOOKUP: Record<string, SHEET_HEADERS_FIELDS>;
