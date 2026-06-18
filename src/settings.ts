
import {
  Spreadsheet, LOG_RECORD, CELL_VALUE, log, LOG_LEVEL, DEFAULT_APP_NAME,
  errorToString
} from './common.js';
import {readSettingsTab} from './sheets.js';

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
  appname: Setting<string> = new Setting(
    DEFAULT_APP_NAME as string,
    'The Discord Bot name.'
  );
  avatar_url: Setting<string> = new Setting(
    '', 
    'URL to an image used for the Discord Bot.');
  webhook: Setting<string> = new Setting(
    '', 
    'Discord channel webhook.',
    [
      [v => v !== '', 'Webhook must be set.'],
      [v => String(v).startsWith('https://discord.com/api/webhooks'), 'Invalid discord hook URL'],
    ],
  );
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

  now: number;
  feedPatternRe: RegExp;
  spreadsheet: Spreadsheet;

  constructor(spreadsheet: Spreadsheet) {
    this.now = new Date().getTime();
    this.feedPatternRe = new RegExp('^https://');
    this.spreadsheet = spreadsheet;
  }

  static getDefaults(): [string, CELL_VALUE][] {
    const defaults: [string, CELL_VALUE][] = [];
    const context = new Context(null as unknown as Spreadsheet);
    for (const [key, val] of Object.entries(context)) {
      if (val.instanceof(Setting)) {
        defaults.push([key, val]);
      }
    }
    return defaults;
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
  
  fetch(url: string, params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): void {
    UrlFetchApp.fetch(url, params);
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

// export type SettingsRecord = Record<SETTINGS_FIELDS, string|number|boolean>;

/**
 * Returns a settings object.
 */
export function getContext(sheet: Spreadsheet, logs: LOG_RECORD[]): Context|undefined {
  const context = new Context(sheet);
  context.logs = logs;
  const [, data] = readSettingsTab(sheet);
  const errors: string[] = [];
  for (const [key, val] of data) {
    if (typeof key !== 'string' || !context.hasOwnProperty(key)) {
      continue;
    }
    const setting = context[key as keyof Context];
    if (!(setting instanceof Setting)) {
      continue;
    }
    const error = setting.set(val);
    if (error != undefined) {
      errors.push(`${key}: ${error}`);
    }
  }
  if (!errors.length) {
    errors.push(...context.validate())
  }
  if (errors.length) {
    const msg = `Errors occurred during startup: ${errors.join('; ')}`;
    log(logs, msg, LOG_LEVEL.ERROR);
    throw new Error('Unable to construct Context');
  }

  context.feedPatternRe = new RegExp(context.feed_pattern.value);
  return context;
}
