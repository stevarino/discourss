/**
 * context.js - Context and Logging infrastructure.
 */
import { CONFIG, Fetcher, DEFAULT_APP_NAME } from './common.js';
export var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
})(LOG_LEVEL || (LOG_LEVEL = {}));
;
export function errorToString(e) {
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
export function errorToLogRecord(e, level) {
    return [new Date().getTime(), level !== null && level !== void 0 ? level : LOG_LEVEL.ERROR, errorToString(e)];
}
export function log(logs, message, level) {
    if (!Array.isArray(message)) {
        message = errorToLogRecord(message, level !== null && level !== void 0 ? level : LOG_LEVEL.INFO);
    }
    if (CONFIG.LOG_TO_STDERR) {
        switch (message[1]) {
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
class Setting {
    constructor(value, help, validators) {
        this.value = value;
        this.help = help;
        this.validators = validators !== null && validators !== void 0 ? validators : [];
    }
    toString() {
        return JSON.stringify(this.value);
    }
    set(value) {
        if (typeof value !== typeof this.value) {
            return `Expected ${typeof this.value}, got ${typeof value}.`;
        }
        this.value = value;
        return this.validate();
    }
    get() {
        return this.value;
    }
    validate(value) {
        if (value === undefined) {
            value = this.value;
        }
        for (const [test, msg] of this.validators) {
            try {
                if (!test(value)) {
                    return msg;
                }
            }
            catch (e) {
                return errorToString(e);
            }
        }
        return undefined;
    }
}
/** Settings specific to a single sheet. */
class SheetSettings {
    constructor(worksheet) {
        this.feedHeaders = [];
        this.isSet = false;
        this.worksheet = worksheet;
        this.webhook = new Setting('', 'Discord channel webhook.', [
            [v => v !== '', 'Webhook must be set.'],
            [v => String(v).startsWith('https://discord.com/api/webhooks'), 'Invalid discord hook URL'],
        ]);
        this.appname = new Setting('', 'The Discord Bot name.');
        this.avatar_url = new Setting('', 'URL to an image used for the Discord Bot.');
        this.signature = new Setting('%s Posted:', 'The signature used for the title. "%s" is replaced with the discord user.');
        this.feed_pattern = new Setting('^https://', 'Regular expression that individual feeds are validated against.');
        this.feed_limit = new Setting(5, 'How many feeds to process per run.');
        this.feed_frequency = new Setting(3600, 'How long a single feed will be scanned (in seconds).');
        this.image_format = new Setting('image', 'How to attach the image from the feed item (image|thumbnail|none)', [
            [(v) => ["image", "thumbnail", "none"].includes(v),
                'Value must be "image", "thumbnail", or "none".'],
        ]);
        this.bundle = new Setting(false, 'Whether to bundle all feed items as a single message to discord.');
        this.feedPatternRe = new RegExp(this.feed_pattern.value);
        this.settings = Object.fromEntries(Object.entries(this).filter(([_, v]) => v instanceof Setting));
        this.feedCount = this.feed_limit.value;
        this.loadSettings();
    }
    loadSettings() {
        var _a, _b;
        const json = (_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.getValue();
        if (!json) {
            return;
        }
        console.log('Loading settings: ', json);
        const settings = JSON.parse(json);
        const errors = this.validateSettings(settings);
        if (errors.length) {
            const msg = `Errors occurred during startup: ${errors.join('; ')}`;
            console.error(msg);
            return msg;
        }
        for (const [name, setting] of Object.entries(settings)) {
            (_b = this.settings[name]) === null || _b === void 0 ? void 0 : _b.set(setting);
        }
        this.isSet = true;
        return;
    }
    getSettings() {
        const settings = [];
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Setting) {
                settings.push([key, val.value, val.help]);
            }
        }
        return settings;
    }
    validateSettings(record) {
        const errors = [];
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
    setSettings(settings) {
        var _a, _b;
        const record = Object.fromEntries(settings);
        const errors = this.validateSettings(record);
        if (errors.length) {
            return errors;
        }
        const json = JSON.stringify(record);
        if (!((_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.setValue(json))) {
            (_b = this.worksheet) === null || _b === void 0 ? void 0 : _b.addDeveloperMetadata(DEFAULT_APP_NAME, json);
        }
        // set new settings (needed for tests?)
        this.loadSettings();
        return errors;
    }
    deleteSettings() {
        var _a;
        (_a = this.getMetadata()) === null || _a === void 0 ? void 0 : _a.remove();
    }
    getMetadata() {
        var _a, _b, _c;
        return (_c = (_b = (_a = this.worksheet) === null || _a === void 0 ? void 0 : _a.createDeveloperMetadataFinder()) === null || _b === void 0 ? void 0 : _b.withKey(DEFAULT_APP_NAME).find()) === null || _c === void 0 ? void 0 : _c[0];
    }
}
export class Context {
    constructor(spreadsheet, logs) {
        this.sheetSettings = {};
        this.logs = [];
        this.debug = false;
        this.defaults = [];
        this.fetcher = new Fetcher();
        this.now = new Date().getTime();
        this.spreadsheet = spreadsheet;
        if (logs !== undefined) {
            this.logs = logs;
        }
        this.defaults = new SheetSettings().getSettings();
        this.loadSettings();
    }
    loadSettings() {
        for (const sheet of this.spreadsheet.getSheets()) {
            this.sheetSettings[sheet.getName()] = new SheetSettings(sheet);
        }
    }
    getSettings() {
        const settings = {};
        for (const [name, value] of Object.entries(this.sheetSettings)) {
            settings[name] = {
                name: name,
                isSet: value.isSet,
                settings: value.getSettings(),
            };
        }
        return settings;
    }
    setSettings(sheet, values) {
        var _a, _b;
        return (_b = (_a = this.sheetSettings[sheet]) === null || _a === void 0 ? void 0 : _a.setSettings(values)) !== null && _b !== void 0 ? _b : [`Unrecognized sheet: "${sheet}"`];
    }
    deleteSettings(sheet) {
        var _a;
        (_a = this.sheetSettings[sheet]) === null || _a === void 0 ? void 0 : _a.deleteSettings();
    }
    reset(spreadsheet) {
        if (spreadsheet) {
            this.spreadsheet = spreadsheet;
        }
        this.sheetSettings = {};
        this.loadSettings();
    }
    // validate(): string[] {
    //   const errors = [];
    //   for (const [key, val] of Object.entries(this)) {
    //     if (val instanceof Setting) {
    //       const error = val.validate();
    //       if (error) {
    //         errors.push(`${key}: ${error}`);
    //       }
    //     }
    //   }
    //   return errors;
    // }
    fetch(url, params) {
        return this.fetcher.fetch(url, params);
    }
    log(level, message) {
        this.logs.push([new Date().getTime(), level, message]);
    }
    error(message) {
        log(this.logs, message, LOG_LEVEL.ERROR);
    }
    warn(message) {
        log(this.logs, message, LOG_LEVEL.WARNING);
    }
    info(message) {
        log(this.logs, message, LOG_LEVEL.INFO);
    }
}
