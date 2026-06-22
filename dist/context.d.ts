import * as fetch from './fetch.js';
import { CELL_VALUE, Spreadsheet } from './common.js';
export type LOG_RECORD = [number, LOG_LEVEL, string];
export declare enum LOG_LEVEL {
    ERROR = 0,
    WARNING = 1,
    INFO = 2
}
type maybeError = string | Error | LOG_RECORD;
export declare function errorToString(e: unknown): string;
export declare function errorToLogRecord(e: unknown, level?: LOG_LEVEL): LOG_RECORD;
export declare function log(logs: LOG_RECORD[], message: maybeError, level?: LOG_LEVEL): void;
type SettingsValidator = [
    (value: CELL_VALUE) => boolean,
    string
];
declare class Setting<T extends CELL_VALUE> {
    value: T;
    help: string;
    validators: SettingsValidator[];
    constructor(value: T, help: string, validators?: SettingsValidator[]);
    toString(): string;
    set(value: CELL_VALUE): string | undefined;
    validate(): string | undefined;
}
export declare class Context {
    appname: Setting<string>;
    avatar_url: Setting<string>;
    webhook: Setting<string>;
    signature: Setting<string>;
    feed_pattern: Setting<string>;
    feed_limit: Setting<number>;
    feed_frequency: Setting<number>;
    image_format: Setting<"image" | "thumbnail" | "none">;
    bundle: Setting<boolean>;
    feedHeaders: CELL_VALUE[];
    logs: LOG_RECORD[];
    debug: boolean;
    fetcher: fetch.Fetcher;
    now: number;
    feedPatternRe: RegExp;
    spreadsheet: Spreadsheet;
    defaults: [string, CELL_VALUE, string][];
    constructor(spreadsheet: Spreadsheet, logs?: LOG_RECORD[]);
    getDefaults(): [string, CELL_VALUE, string][];
    setSettings(settings: [string, CELL_VALUE][]): string[];
    validate(): string[];
    fetch(url: string, params: fetch.FetchRequest): fetch.FetchResponse;
    log(level: LOG_LEVEL, message: string): void;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
}
export {};
