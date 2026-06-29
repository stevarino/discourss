/**
 * context.js - Context and Logging infrastructure.
 */
import { CELL_VALUE, Spreadsheet, Fetcher, FetchRequest, FetchResponse, Metadata, Worksheet, SettingInterface, SettingsInterface, SidebarSheetsData } from './common.js';
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
declare class Setting<T extends CELL_VALUE> implements SettingInterface {
    value: T;
    help: string;
    validators: SettingsValidator[];
    constructor(value: T, help: string, validators?: SettingsValidator[]);
    toString(): string;
    set(value: CELL_VALUE): string | undefined;
    get(): T;
    validate(value?: T): string | undefined;
}
/** Settings specific to a single sheet. */
declare class SheetSettings implements SettingsInterface {
    worksheet: Worksheet | undefined;
    feedHeaders: CELL_VALUE[];
    isSet: boolean;
    webhook: Setting<string>;
    appname: Setting<string>;
    avatar_url: Setting<string>;
    signature: Setting<string>;
    feed_pattern: Setting<string>;
    feed_limit: Setting<number>;
    feed_frequency: Setting<number>;
    image_format: Setting<"image" | "thumbnail" | "none">;
    bundle: Setting<boolean>;
    feedCount: number;
    feedPatternRe: RegExp;
    settings: Record<string, Setting<CELL_VALUE>>;
    constructor(worksheet?: Worksheet);
    loadSettings(): string | undefined;
    getSettings(): [string, CELL_VALUE, string][];
    validateSettings(record: Record<string, CELL_VALUE>): string[];
    setSettings(settings: [string, CELL_VALUE][]): string[];
    deleteSettings(): void;
    getMetadata(): Metadata | undefined;
}
export declare class Context {
    sheetSettings: Record<string, SheetSettings>;
    logs: LOG_RECORD[];
    debug: boolean;
    fetcher: Fetcher;
    now: number;
    spreadsheet: Spreadsheet;
    defaults: [string, CELL_VALUE, string][];
    constructor(spreadsheet: Spreadsheet, logs?: LOG_RECORD[]);
    loadSettings(): void;
    getSettings(): Record<string, SidebarSheetsData>;
    setSettings(sheet: string, values: [string, CELL_VALUE][]): string[];
    deleteSettings(sheet: string): void;
    reset(spreadsheet?: Spreadsheet): void;
    fetch(url: string, params: FetchRequest): FetchResponse;
    log(level: LOG_LEVEL, message: string): void;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
}
export {};
