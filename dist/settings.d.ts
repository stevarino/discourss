import { Spreadsheet, LOG_RECORD, CELL_VALUE, LOG_LEVEL } from './common.js';
type SettingsValidator = [
    (value: CELL_VALUE) => boolean,
    string
];
declare class Setting<T extends CELL_VALUE> {
    value: T;
    help: string;
    validators: SettingsValidator[];
    constructor(value: T, help: string, validators?: SettingsValidator[]);
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
    now: number;
    feedPatternRe: RegExp;
    spreadsheet: Spreadsheet;
    constructor(spreadsheet: Spreadsheet);
    static getDefaults(): [string, CELL_VALUE][];
    validate(): string[];
    fetch(url: string, params: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): void;
    log(level: LOG_LEVEL, message: string): void;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
}
/**
 * Returns a settings object.
 */
export declare function getContext(sheet: Spreadsheet, logs: LOG_RECORD[]): Context | undefined;
export {};
