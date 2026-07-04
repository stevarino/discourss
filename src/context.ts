/**
 * context.js - Context and Logging infrastructure.
 */

import {
  CELL_VALUE, Spreadsheet, CONFIG, Fetcher, FetchRequest, FetchResponse,
  DEFAULT_APP_NAME, Metadata, Worksheet, SettingInterface, SettingsInterface,
  SidebarSheetsData, getWebhookId
} from './common.js';

/** Purge logs every 10s */
const PURGE_INTERVAL = 5_000;

export type LOG_RECORD = [number, LOG_LEVEL, string];
export enum LOG_LEVEL { ERROR, WARNING, INFO, DEBUG };

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
  if (level === LOG_LEVEL.DEBUG && ! CONFIG.LOG_DEBUG) {
    return;
  }
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
      case LOG_LEVEL.INFO:
        console.info(LOG_LEVEL[message[1]], message[2]);
        break;
      case LOG_LEVEL.DEBUG:
        // no console.debug in AppsScript
        console.log(LOG_LEVEL[message[1]], message[2]);
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

class Setting<T extends CELL_VALUE> implements SettingInterface {
  value: T;
  validators: SettingsValidator[]

  constructor(value: T, validators?: SettingsValidator[]) {
    this.value = value;
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

  get(): T {
    return this.value;
  }

  validate(value?: T): string|undefined {
    if (value === undefined) {
      value = this.value;
    }
    for (const [test, msg] of this.validators) {
      try {
        if (!test(value)) {
          return msg;
        }
      } catch (e) {
        return errorToString(e);
      }
    }
    return undefined;
  }
}

/** Settings specific to a single sheet. */
class SheetSettings implements SettingsInterface {
  worksheet: Worksheet | undefined;
  feedHeaders: CELL_VALUE[] = [];
  isSet = false;

  webhook: Setting<string>;
  appname: Setting<string>;
  avatar_url: Setting<string>;
  signature: Setting<string>;
  feed_pattern: Setting<string>;
  feed_limit: Setting<number>;
  feed_frequency: Setting<number>;
  image_format: Setting<"image"|"thumbnail"|"none">;
  bundle: Setting<boolean>

  feedCount: number;
  feedPatternRe: RegExp;
  settings: Record<string, Setting<CELL_VALUE>>;

  constructor(worksheet?: Worksheet) {
    this.worksheet = worksheet;
    this.webhook = new Setting(
      '', 
      [
        [v => v !== '', 'Webhook must be set.'],
        [v => getWebhookId(v as string) !== undefined, 'Invalid discord hook URL'],
      ],
    );
    this.appname = new Setting('');
    this.avatar_url = new Setting('');
    this.signature = new Setting('%s Posted:');
    this.feed_pattern = new Setting('^https://',);
    this.feed_limit = new Setting(5);
    this.feed_frequency = new Setting(3600);
    this.image_format = new Setting(
      'image',
      [
        [(v) => ["image", "thumbnail", "none"].includes(v as string), 
        'Value must be "image", "thumbnail", or "none".'],
      ]
    );
    this.bundle = new Setting(false)

    this.feedPatternRe = new RegExp(this.feed_pattern.value);
    this.settings = Object.fromEntries(
      Object.entries(this).filter(([_, v]) => v instanceof Setting));
    this.feedCount = this.feed_limit.value;
    this.loadSettings();
  }

  loadSettings(): string | undefined {
    const json = this.getMetadata()?.getValue();
    if (!json) {
      return;
    }
    const settings: Record<string, CELL_VALUE> = JSON.parse(json);
    const errors = this.validateSettings(settings);
    if (errors.length) {
      const msg = `Errors occurred during startup: ${errors.join('; ')}`;
      console.error(msg);
      return msg;
    }
    for (const [name, setting] of Object.entries(settings)) {
      this.settings[name]?.set(setting);
    }
    this.isSet = true;
    return;
  }

  getSettings(): [string, CELL_VALUE][] {
    return Object.entries(this)
      .filter(([_, v]) => v instanceof Setting)
      .map(([k, v]) => [k, v.value]);
  }

  validateSettings(record: Record<string, CELL_VALUE>): string[] {
    const errors: string[] = [];
    // validate
    for (const [name, setting] of Object.entries(this)) {
      if (!(setting instanceof Setting)) {
        continue;
      }
      // testing each value regardless of if its trying to be set.
      const error = setting.validate(record[name]);
      if (error) {
        errors.push(`${name}: ${error}`);
      }
    }
    return errors;
  }

  setSettings(settings: [string, CELL_VALUE][]): string[] {
    const record = Object.fromEntries(settings);
    const errors = this.validateSettings(record);    
    if (errors.length) {
      return errors;
    }
    const json = JSON.stringify(record);
    if (!this.getMetadata()?.setValue(json)) {
      this.worksheet?.addDeveloperMetadata(DEFAULT_APP_NAME, json);
    }
    // set new settings (needed for tests?)
    this.loadSettings();
    return errors;
  }

  deleteSettings(): void {
    this.getMetadata()?.remove();
  }

  getMetadata(): Metadata | undefined {
    return this.worksheet
        ?.createDeveloperMetadataFinder()
        ?.withKey(DEFAULT_APP_NAME).find()?.[0];
  }
}

export class Context {
  sheetSettings: Record<string, SheetSettings> = {};
  logs: LOG_RECORD[] = [];
  fetcher: Fetcher;
  logger: ((logs: LOG_RECORD[]) => void) | undefined;

  // https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
  limits = {
    CONTENT_LENGTH: 2000,
    DESC_LENGTH: 4096,
    EMBED_COUNT: 10,
    PAYLOAD_LENGTH: 6000,
  };

  now: number;
  purgedAt: number;
  spreadsheet: Spreadsheet;

  defaults: [string, CELL_VALUE][] = [];

  constructor(spreadsheet: Spreadsheet, logs?: LOG_RECORD[]) {
    this.fetcher = new Fetcher();
    this.now = new Date().getTime();
    this.purgedAt = new Date().getTime();
    this.spreadsheet = spreadsheet;
    if (logs !== undefined) {
      this.logs = logs;
    }
    this.defaults = new SheetSettings().getSettings();
    this.loadSettings();
  }

  loadSettings(): void {
    for (const sheet of this.spreadsheet.getSheets()) {
      this.sheetSettings[sheet.getSheetId()] = new SheetSettings(sheet);
    }
  }

  getSettings(): Record<string, SidebarSheetsData> {
    const settings: Record<string, SidebarSheetsData> = {}
    for (const [sheetId, value] of Object.entries(this.sheetSettings)) {
      settings[sheetId] = {
        sheetId: sheetId,
        name: value.worksheet!.getName(),
        isSet: value.isSet,
        settings: value.getSettings(),
      }
    }
    return settings;
  }

  getSheetData(sheetId: string): SidebarSheetsData {
    const record = this.sheetSettings[sheetId];
    if (!record) {
      throw new Error(`Sheet "${sheetId}" not found.`);
    }
    return {
      sheetId: sheetId,
      name: record.worksheet!.getName(),
      isSet: record.isSet,
      settings: record.getSettings(),
    }
  }

  getWorksheet(sheetId: string): Worksheet | undefined {
    return this.sheetSettings[sheetId]?.worksheet;
  }

  setSettings(sheetId: string, values: [string, CELL_VALUE][]): string[] {
    return this.sheetSettings[sheetId]?.setSettings(values) ?? [`Unrecognized sheet: "${sheetId}"`]
  }

  deleteSettings(sheetId: string): void {
    this.sheetSettings[sheetId]?.deleteSettings();
  }

  reset(spreadsheet?: Spreadsheet): void {
    if (spreadsheet) {
      this.spreadsheet = spreadsheet;
    }
    this.sheetSettings = {};
    this.loadSettings();
  }
  
  fetch(url: string, params?: FetchRequest): FetchResponse {
    return this.fetcher.fetch(
      url, params ?? {}, (msg) => this.log(LOG_LEVEL.DEBUG, msg));
  }

  log(level: LOG_LEVEL, message: string): void {
    log(this.logs, message, level);
    if (new Date().getTime() - this.purgedAt > PURGE_INTERVAL) {
      if (this.logger) this.logger(this.logs);
      this.logs.length = 0;
    }
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

  debug(message: string): void {
    log(this.logs, message, LOG_LEVEL.DEBUG);
  }
}
