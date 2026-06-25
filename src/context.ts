/**
 * context.js - Context and Logging infrastructure.
 */

import * as fetch from './fetch.js';
import { CELL_VALUE, Spreadsheet, CONFIG } from './common.js';

const DEFAULT_APP_NAME = 'DiscouRSS';

export type LOG_RECORD = [number, LOG_LEVEL, string];

export enum LOG_LEVEL {
  ERROR, WARNING, INFO
};

type maybeError = string|Error|LOG_RECORD;

export function errorToString(e: unknown): string {
  // LOG_RECORD
  if (Array.isArray(e) && typeof e[2] === 'string') {
    return e[2];
  }
  if (e instanceof Error) {
    if (e.stack) {
      return `${e.message}\n${e.stack}`;
    }
    return e.message;
  }
  return `${e}`;
}

export function errorToLogRecord(e: unknown, level?: LOG_LEVEL): LOG_RECORD{
  return [new Date().getTime(), level ?? LOG_LEVEL.ERROR, errorToString(e)];
}

export function log(logs: LOG_RECORD[], message: maybeError, level?: LOG_LEVEL): void {
  if (!Array.isArray(message)) {
    message = errorToLogRecord(message, level ?? LOG_LEVEL.INFO);
  }
  if (CONFIG.LOG_TO_STDERR) {
    switch(message[1]) {
      case LOG_LEVEL.ERROR:
        console.error(LOG_LEVEL[message[1]], message[2]);
        break;
      case LOG_LEVEL.WARNING:
        console.warn(LOG_LEVEL[message[1]], message[2]);
        break;
      default:
        console.info(LOG_LEVEL[message[1]], message[2]);
    }
  }
  logs.push(message);
}

type SettingsValidator = [
  (value: CELL_VALUE) => boolean,
  string
];
class Setting<T extends CELL_VALUE> {
  value: T;
  help: string;
  validators: SettingsValidator[]

  constructor(value: T, help: string, validators?: SettingsValidator[]) {
    this.value = value;
    this.help = help;
    this.validators = validators ?? [];
  }

  toString(): string {
    return JSON.stringify(this.value);
  }

  set(value: CELL_VALUE): string|undefined {
    if (typeof value !== typeof this.value) {
      return `Expected ${typeof this.value}, got ${typeof value}.`;
    }
    this.value = value as T;
    return this.validate();
  }

  validate(): string|undefined {
    for (const val of this.validators) {
      try {
        if (!val[0](this.value)) {
          return val[1];
        }
      } catch (e) {
        return errorToString(e);
      }
    }
    return undefined;
  }
}

export class Context {
  webhook: Setting<string> = new Setting(
    '', 
    'Discord channel webhook.',
    [
      [v => v !== '', 'Webhook must be set.'],
      [v => String(v).startsWith('https://discord.com/api/webhooks'), 'Invalid discord hook URL'],
    ],
  );
  appname: Setting<string> = new Setting(
    DEFAULT_APP_NAME as string,
    'The Discord Bot name.'
  );
  avatar_url: Setting<string> = new Setting(
    '', 
    'URL to an image used for the Discord Bot.');
  signature: Setting<string> = new Setting(
    '%s Posted:',
    'The signature used for the title. "%s" is replaced with the discord user.'
  );
  feed_pattern: Setting<string> = new Setting(
    '^https://',
    'Regular expression that individual feeds are validated against.'
  );
  feed_limit: Setting<number> = new Setting(
    5, 'How many feeds to process per run.');
  feed_frequency: Setting<number> = new Setting(
    3600, 'How long a single feed will be scanned (in seconds).');
  image_format: Setting<"image"|"thumbnail"|"none"> = new Setting(
    'image',
    'How to attach the image from the feed item (image|thumbnail|none)',
    [
      [(v) => ["image", "thumbnail", "none"].includes(v as string), 
       'Value must be "image", "thumbnail", or "none".'],
    ]
  );
  bundle: Setting<boolean> = new Setting(false,
    "Whether or not to bundle the items as a single discord message.");

  feedHeaders: CELL_VALUE[] = [];
  logs: LOG_RECORD[] = [];
  debug = false;
  fetcher: fetch.Fetcher;

  now: number;
  feedPatternRe: RegExp;
  spreadsheet: Spreadsheet;

  defaults: [string, CELL_VALUE, string][] = [];

  constructor(spreadsheet: Spreadsheet, logs?: LOG_RECORD[]) {
    this.fetcher = new fetch.Fetcher();
    this.now = new Date().getTime();
    this.feedPatternRe = new RegExp('^https://');
    this.spreadsheet = spreadsheet;
    if (logs !== undefined) {
      this.logs = logs;
    }
    this.defaults = this.getDefaults();
  }

  getDefaults(): [string, CELL_VALUE, string][] {
    if (this.defaults.length) {
      return this.defaults;
    }
    const defaults: [string, CELL_VALUE, string][] = [];
    for (const [key, val] of Object.entries(this)) {
      if (val instanceof Setting) {
        defaults.push([key, val.value, val.help]);
      }
    }
    return defaults;
  }

  setSettings(settings: [string, CELL_VALUE][]): string[] {
    const errors: string[] = [];
    for (const [key, val] of settings) {
      if (typeof key !== 'string' || !this.hasOwnProperty(key)) {
        continue;
      }
      const setting = (this as any)[key];
      if (!(setting instanceof Setting)) {
        continue;
      }
      const error = setting.set(val);
      if (error !== undefined) {
        errors.push(`${key}: ${error}`);
        continue;
      }

      if (key === 'feed_pattern') {
        this.feedPatternRe = new RegExp(val as string);
      }
    }
    if (!errors.length) {
      errors.push(...this.validate())
    }
    return errors;
  }

  validate(): string[] {
    const errors = [];
    for (const [key, val] of Object.entries(this)) {
      if (val instanceof Setting) {
        const error = val.validate();
        if (error) {
          errors.push(`${key}: ${error}`);
        }
      }
    }
    return errors;
  }
  
  fetch(url: string, params: fetch.FetchRequest): fetch.FetchResponse {
    return this.fetcher.fetch(url, params)
  }

  log(level: LOG_LEVEL, message: string): void {
    this.logs.push([new Date().getTime(), level, message]);
  }

  error(message: string): void {
    log(this.logs, message, LOG_LEVEL.ERROR)
  }
  
  warn(message: string): void {
    log(this.logs, message, LOG_LEVEL.WARNING)
  }
  
  info(message: string): void {
    log(this.logs, message, LOG_LEVEL.INFO)
  }
}
