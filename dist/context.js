import * as fetch from './fetch.js';
import { CONFIG } from './common.js';
const DEFAULT_APP_NAME = 'DiscouRSS';
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
    validate() {
        for (const val of this.validators) {
            try {
                if (!val[0](this.value)) {
                    return val[1];
                }
            }
            catch (e) {
                return errorToString(e);
            }
        }
        return undefined;
    }
}
export class Context {
    constructor(spreadsheet, logs) {
        this.appname = new Setting(DEFAULT_APP_NAME, 'The Discord Bot name.');
        this.avatar_url = new Setting('', 'URL to an image used for the Discord Bot.');
        this.webhook = new Setting('', 'Discord channel webhook.', [
            [v => v !== '', 'Webhook must be set.'],
            [v => String(v).startsWith('https://discord.com/api/webhooks'), 'Invalid discord hook URL'],
        ]);
        this.signature = new Setting('%s Posted:', 'The signature used for the title. "%s" is replaced with the discord user.');
        this.feed_pattern = new Setting('^https://', 'Regular expression that individual feeds are validated against.');
        this.feed_limit = new Setting(5, 'How many feeds to process per run.');
        this.feed_frequency = new Setting(3600, 'How long a single feed will be scanned (in seconds).');
        this.image_format = new Setting('image', 'How to attach the image from the feed item (image|thumbnail|none)', [
            [(v) => ["image", "thumbnail", "none"].includes(v),
                'Value must be "image", "thumbnail", or "none".'],
        ]);
        this.bundle = new Setting(false, "Whether or not to bundle the items as a single discord message.");
        this.feedHeaders = [];
        this.logs = [];
        this.debug = false;
        this.defaults = [];
        this.fetcher = new fetch.Fetcher();
        this.now = new Date().getTime();
        this.feedPatternRe = new RegExp('^https://');
        this.spreadsheet = spreadsheet;
        if (logs !== undefined) {
            this.logs = logs;
        }
        this.defaults = this.getDefaults();
    }
    getDefaults() {
        if (this.defaults.length) {
            return this.defaults;
        }
        const defaults = [];
        for (const [key, val] of Object.entries(this)) {
            if (val instanceof Setting) {
                defaults.push([key, val.value, val.help]);
            }
        }
        return defaults;
    }
    setSettings(settings) {
        const errors = [];
        for (const [key, val] of settings) {
            if (typeof key !== 'string' || !this.hasOwnProperty(key)) {
                continue;
            }
            const setting = this[key];
            if (!(setting instanceof Setting)) {
                continue;
            }
            const error = setting.set(val);
            if (error !== undefined) {
                errors.push(`${key}: ${error}`);
                continue;
            }
            if (key === 'feed_pattern') {
                this.feedPatternRe = new RegExp(val);
            }
        }
        if (!errors.length) {
            errors.push(...this.validate());
        }
        return errors;
    }
    validate() {
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
