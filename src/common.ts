export const DEFAULT_APP_NAME = 'Sheets RSS to Discord';
export const FEEDS_TAB = 'feeds';
export const SETTINGS_TAB = 'settings';
export const LOGS_TAB = 'logs';

export interface Feed {
  index: number,
  feed?: string,
  time?: number|string,
  discord?: string|number,
  guid?: string,
  status?: string,
}

export type SafeFeed = Feed & {time: number, feed: string}

export type FeedLookup = Record<keyof Feed, string|number|undefined>;

export interface Embed {
  title: string,
  url: string,
  description?: string,
  thumbnail?: {url: string}|undefined,
  image?: {url: string}|undefined,
  fields: {name: string, value: string}[],
}

export interface Message {
  content?: string,
  username?: string|number,
  avatar_url?: string,
  embeds: Embed[],
  allowed_mentions?: {users: string[]},
}

export enum STATUS {
  OK,
  SKIP,
  EMPTY,
  ERROR,
  NONE,
};

export enum LOG_LEVEL {
  ERROR, WARNING, INFO
};

// Result from parsing a feed.
export interface Result {
  status: STATUS,
  status_text: string,
  guid?: string,
  message?: Message,
  sheets_update?: [SHEET_HEADERS_FIELDS, string|number][],
}

export type LOG_RECORD = [number, LOG_LEVEL, string];

export interface Settings {
  // APP SETTINGS (setable through sheets "settings" tab):
  appname: string, // Application display name
  avatar_url?: string, // Application avatar image
  webhook?: string, // Discord webhook
  signature: string, // How to tag the user
  image_format: "image"|"thumbnail"|"none", // How to embed the image
  bundle: boolean, // Whether or not to bundle embeds together in a single message.
  feed_pattern: string, // Regex used to validate feed URL
  feed_limit: number, // Number of feeds to read at a time
  feed_frequency: number, // How often to check the feeds in seconds.
 
  // RUNTIME SETTINGS:
  feed_pattern_re: RegExp, // Compiled regex of feed URL pattern 
  now: number, // runtime epoch
  debug?: boolean, // Whether to include debug information.
   // fetch function call
  fetch: (url: string, params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => void,

  logs: LOG_RECORD[],
  log: (level: LOG_LEVEL, message: string) => void,
  error: (message: string) => void,
  warn: (message: string) => void,
  info: (message: string) => void,
}

export type FeedSettings = Settings & {
  url?: string, // Current RSS feed.
  discord?: string|number, // Discord username (snowflake) for current feed.
  guid?: string, // Previously scanned GUID, '' indicates a new feed and
                 // all items are not new, '0' indicates treat all items as new.
}

export enum SETTINGS_FIELDS {
  appname = 'appname',
  avatar_url = 'avatar_url',
  webhook = 'webhook',
  signature = 'signature',
  image_format = 'image_format',
  bundle = 'bundle',
  feed_pattern = 'feed_pattern',
  feed_limit = 'feed_limit',
  feed_frequency = 'feed_frequency',
}

export type SettingsRecord = Record<SETTINGS_FIELDS, string|number|boolean>;


export const DEFAULT_SETTINGS : Settings = {
  now: 0,
  appname: 'Sheets RSS',
  signature: '%s Posted:',
  feed_pattern: '^https://',
  feed_limit: 5,
  feed_frequency: 3600,
  image_format: 'image',
  bundle: false,

  feed_pattern_re: new RegExp('^https://'),
  fetch: (url, params) => UrlFetchApp.fetch(url, params),

  logs: [],
  log: function(level, message) {this.logs.push([new Date().getTime(), level, message])},
  error: function(message) {this.log(LOG_LEVEL.ERROR, message)},
  warn: function(message) {this.log(LOG_LEVEL.WARNING, message)},
  info: function(message) {this.log(LOG_LEVEL.INFO, message)},
}

export function getDefaultSettings(): Settings {
  // return a new Settings object.
  return {
    ...DEFAULT_SETTINGS,
    now: new Date().getTime(),
  };
}

export interface SHEET_HEADER_TYPES {
  label: string,
  help: string,
}
export type SHEET_HEADERS_FIELDS = 'index'|'feed'|'discord'|'time'|'guid'|'status';
export const SHEET_HEADERS: Record<SHEET_HEADERS_FIELDS, SHEET_HEADER_TYPES> = { // : {[key in keyof Feed]: string} = {
  index: {
    label: 'Index',
    help: '',
  },
  feed: {
    label: 'Feed',
    help: 'RSS URL',
  },
  discord: {
    label: 'Discord',
    help: 'User ID or Name',
  },
  time: {
    label: 'Time',
    help: 'Auto; Set blank for forced rescan',
  },
  guid: {
    label: 'GUID',
    help: 'Latest review; set to 0 to push all',
  },
  status: {
    label: 'Status',
    help: 'Last run status',
  },
} as const;


export const EXPECTED_HEADERS = Object.values(SHEET_HEADERS).filter(
  v => v.help !== '').map(v => v.label) as string[];
export const HEADER_LOOKUP = Object.fromEntries(
  Object.entries(SHEET_HEADERS).map(([k, v]) => [v.label, k])
) as Record<string, SHEET_HEADERS_FIELDS>;

