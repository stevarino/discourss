/**
 * context.js - Context and Logging infrastructure.
 */
import { CONFIG, Fetcher, DEFAULT_APP_NAME, getWebhookId } from './common.js';
/** Purge logs every 10s */
const PURGE_INTERVAL = 5000;
export var LOG_LEVEL;
(function (LOG_LEVEL) {
    LOG_LEVEL[LOG_LEVEL["ERROR"] = 0] = "ERROR";
    LOG_LEVEL[LOG_LEVEL["WARNING"] = 1] = "WARNING";
    LOG_LEVEL[LOG_LEVEL["INFO"] = 2] = "INFO";
    LOG_LEVEL[LOG_LEVEL["DEBUG"] = 3] = "DEBUG";
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
    if (level === LOG_LEVEL.DEBUG && !CONFIG.LOG_DEBUG) {
        return;
    }
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
class Setting {
    constructor(value, validators) {
        this.value = value;
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
        this.webhook = new Setting('', [
            [v => v !== '', 'Webhook must be set.'],
            [v => getWebhookId(v) !== undefined, 'Invalid discord hook URL'],
        ]);
        this.appname = new Setting('');
        this.avatar_url = new Setting('');
        this.signature = new Setting('%s Posted:');
        this.feed_pattern = new Setting('^https://');
        this.feed_limit = new Setting(5);
        this.feed_frequency = new Setting(3600);
        this.image_format = new Setting('image', [
            [(v) => ["image", "thumbnail", "none"].includes(v),
                'Value must be "image", "thumbnail", or "none".'],
        ]);
        this.bundle = new Setting(false);
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
        return Object.entries(this)
            .filter(([_, v]) => v instanceof Setting)
            .map(([k, v]) => [k, v.value]);
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
        // https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
        this.limits = {
            CONTENT_LENGTH: 2000,
            DESC_LENGTH: 4096,
            EMBED_COUNT: 10,
            PAYLOAD_LENGTH: 6000,
        };
        this.defaults = [];
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
    loadSettings() {
        for (const sheet of this.spreadsheet.getSheets()) {
            this.sheetSettings[sheet.getSheetId()] = new SheetSettings(sheet);
        }
    }
    getSettings() {
        const settings = {};
        for (const [sheetId, value] of Object.entries(this.sheetSettings)) {
            settings[sheetId] = {
                sheetId: sheetId,
                name: value.worksheet.getName(),
                isSet: value.isSet,
                settings: value.getSettings(),
            };
        }
        return settings;
    }
    getSheetData(sheetId) {
        const record = this.sheetSettings[sheetId];
        if (!record) {
            throw new Error(`Sheet "${sheetId}" not found.`);
        }
        return {
            sheetId: sheetId,
            name: record.worksheet.getName(),
            isSet: record.isSet,
            settings: record.getSettings(),
        };
    }
    getWorksheet(sheetId) {
        var _a;
        return (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.worksheet;
    }
    setSettings(sheetId, values) {
        var _a, _b;
        return (_b = (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.setSettings(values)) !== null && _b !== void 0 ? _b : [`Unrecognized sheet: "${sheetId}"`];
    }
    deleteSettings(sheetId) {
        var _a;
        (_a = this.sheetSettings[sheetId]) === null || _a === void 0 ? void 0 : _a.deleteSettings();
    }
    reset(spreadsheet) {
        if (spreadsheet) {
            this.spreadsheet = spreadsheet;
        }
        this.sheetSettings = {};
        this.loadSettings();
    }
    fetch(url, params) {
        return this.fetcher.fetch(url, params !== null && params !== void 0 ? params : {}, (msg) => this.log(LOG_LEVEL.DEBUG, msg));
    }
    log(level, message) {
        log(this.logs, message, level);
        if (new Date().getTime() - this.purgedAt > PURGE_INTERVAL) {
            if (this.logger)
                this.logger(this.logs);
            this.logs.length = 0;
        }
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
    debug(message) {
        log(this.logs, message, LOG_LEVEL.DEBUG);
    }
}
