/** sidebar.js - this is compiled into sidebar.html during the build step */
import { DEFAULT_APP_NAME } from "./common.js";
import { LOGS_TAB } from "./sheets.js";
function unexpectedError(msg) {
    safeError(`An unexpected error occured:\n${msg}`);
    return null;
}
function safeError(msg) {
    DISCOURSS_BACKEND.alert(msg).catch((e => {
        const also = '\n\nFurther while handling the above error, the following error occured:\n';
        alert(`${msg}${also}${e}`);
    }));
}
// creates templated functions to call the backend utilizing a Promise
// rather than functions. <T> is a tuple of arguments for the function
// call and <U> is the return type.
function buildBackendCall(name) {
    return (...args) => {
        return new Promise((res, rej) => {
            const func = google.script.run.withSuccessHandler(res).withFailureHandler(rej)[name];
            if (!func) {
                throw new Error(`Unrecognized server function: "${name}"`);
            }
            func(...args);
        }).catch(unexpectedError);
    };
}
const DISCOURSS_BACKEND = {
    run: buildBackendCall('run'),
    toggleTimer: buildBackendCall('toggleTimer'),
    getSidebarData: buildBackendCall('getSidebarData'),
    setSettings: buildBackendCall('setSettings'),
    deleteSettings: buildBackendCall('deleteSettings'),
    pollCurrentSheet: buildBackendCall('pollCurrentSheet'),
    alert: buildBackendCall('alert'),
};
const DISCOURSS_STATE = {
    sidebarData: undefined,
};
function swapButton(btn, value) {
    if (value) {
        btn.dataset['value'] = btn.value;
        btn.value = value;
    }
    else {
        value = btn.dataset['value'];
        if (value) {
            delete btn.dataset['value'];
            btn.value = value;
        }
    }
}
function getById(id) {
    const el = document.getElementById(id);
    if (!el) {
        throw Error(`Failed to locate element with id "${id}"`);
    }
    return el;
}
document.addEventListener("DOMContentLoaded", async () => {
    function log(...args) {
        console.log(DEFAULT_APP_NAME, ...args);
    }
    const settings = getById('settings');
    const sheetNameLabel = getById('sheetName');
    const versionLabel = getById('version');
    const runBtn = getById('runBtn');
    const timerBtn = getById('timerBtn');
    const saveBtn = getById('saveBtn');
    const deleteBtn = getById('deleteBtn');
    const refreshBtn = getById('refreshBtn');
    function renderSheetName(sheet) {
        if (sheet.name == LOGS_TAB) {
            sheetNameLabel.innerText = 'Viewing Logs';
        }
        else if (sheet.isSet) {
            sheetNameLabel.innerText = `Worksheet ${sheet.name}`;
        }
        else {
            sheetNameLabel.innerText = `Setup ${sheet.name}`;
        }
    }
    function timerButton(state) {
        timerBtn.value = state ? 'Disable Timer' : 'Enable Timer';
    }
    function failureHandler(e) {
        console.error(DEFAULT_APP_NAME, e);
        alert(e.toString());
    }
    function onLoad(sidebarData) {
        var _a;
        if (!sidebarData) {
            (_a = document.getElementById('content')) === null || _a === void 0 ? void 0 : _a.append('An error has occurred. Please reload the sidebar.');
            return;
        }
        log(`Loaded:`, sidebarData);
        DISCOURSS_STATE.sidebarData = sidebarData;
        async function renderSidebar() {
            var _a;
            let sidebarData = DISCOURSS_STATE.sidebarData;
            let sheet = sidebarData.sheets[sidebarData.sheetId];
            // new spreadsheet?
            if (sheet === undefined) {
                document.body.classList.remove('loaded');
                let sidebarData = await DISCOURSS_BACKEND.getSidebarData();
                if (!sidebarData) {
                    document.body.classList.add('loaded');
                    return;
                }
                DISCOURSS_STATE.sidebarData = sidebarData;
                sheet = sidebarData.sheets[sidebarData.sheetId];
            }
            renderSheetName(sheet);
            if (sheet.name === LOGS_TAB) {
                // Logs is read-only
                settings.style.display = 'none';
                saveBtn.style.display = 'none';
                deleteBtn.style.display = 'none';
            }
            else {
                settings.style.display = 'flex';
                saveBtn.style.display = 'block';
                deleteBtn.style.display = 'block';
                if (sheet.isSet) {
                    // editing a sheet record
                    saveBtn.value = 'Save';
                    deleteBtn.style.display = 'block';
                    settings.querySelector('div').style.display = 'flex';
                }
                else {
                    // creating a sheet record
                    saveBtn.value = 'Create';
                    deleteBtn.style.display = 'none';
                    settings.querySelector('div').style.display = 'none';
                }
                for (const [k, v] of (_a = sheet === null || sheet === void 0 ? void 0 : sheet.settings) !== null && _a !== void 0 ? _a : []) {
                    const els = Array.from(document.getElementsByName(k));
                    for (const el of els) {
                        el.value = String(v);
                    }
                }
            }
            document.body.classList.add('loaded');
        }
        versionLabel.innerText = sidebarData.version;
        timerButton(sidebarData.timer);
        runBtn.addEventListener('click', async () => {
            swapButton(runBtn, 'Running...');
            await DISCOURSS_BACKEND.run().catch(unexpectedError);
            swapButton(runBtn);
        });
        timerBtn.addEventListener('click', async () => {
            swapButton(timerBtn, '...');
            const state = await DISCOURSS_BACKEND.toggleTimer().catch(unexpectedError);
            if (state !== null) {
                timerButton(state !== null && state !== void 0 ? state : true);
            }
            else {
                swapButton(timerBtn, 'Toggle Timer State');
            }
        });
        deleteBtn.addEventListener('click', async () => {
            var _a;
            const sheet = DISCOURSS_STATE.sidebarData.sheetId;
            swapButton(deleteBtn, 'Deleting...');
            const res = await DISCOURSS_BACKEND.deleteSettings(sheet);
            swapButton(deleteBtn);
            if (!res)
                return;
            DISCOURSS_STATE.sidebarData.sheets[sheet] = res.sheetData;
            if (((_a = DISCOURSS_STATE.sidebarData) === null || _a === void 0 ? void 0 : _a.sheetId) === sheet) {
                await renderSidebar();
            }
        });
        async function refreshData() {
            const sidebarData = await DISCOURSS_BACKEND.getSidebarData();
            if (sidebarData) {
                DISCOURSS_STATE.sidebarData = sidebarData;
            }
            swapButton(refreshBtn);
            await renderSidebar();
        }
        refreshBtn.addEventListener('click', () => {
            swapButton(refreshBtn, 'Refreshing...');
            refreshData();
        });
        saveBtn.addEventListener('click', async () => {
            var _a, _b;
            swapButton(saveBtn, 'Saving...');
            const sidebarData = DISCOURSS_STATE.sidebarData;
            const fields = [];
            const fieldElements = Array.from(document.querySelectorAll('*[name]'));
            for (const child of fieldElements) {
                let value = child.value;
                const datatype = (_a = child.getAttribute('type')) !== null && _a !== void 0 ? _a : child.dataset['type'];
                if (datatype === 'number') {
                    value = parseInt(value);
                }
                else if (datatype === 'boolean') {
                    value = value === 'true';
                }
                fields.push([child.name, value]);
            }
            const saveRequest = {
                isNew: sidebarData.sheets[sidebarData.sheetId].isSet === false,
                sheetId: sidebarData.sheetId,
                fields: fields,
            };
            const res = await DISCOURSS_BACKEND.setSettings(saveRequest);
            swapButton(saveBtn);
            if (!res) {
                DISCOURSS_BACKEND.alert('Failed to save. Please try again.');
                return;
            }
            if (!res.sheetData) {
                return;
            }
            const sheetId = res.sheetData.sheetId;
            DISCOURSS_STATE.sidebarData.sheets[sheetId] = res.sheetData;
            if (sheetId === ((_b = DISCOURSS_STATE.sidebarData) === null || _b === void 0 ? void 0 : _b.sheetId)) {
                await renderSidebar();
            }
        });
        async function refresh() {
            var _a, _b;
            try {
                const res = await DISCOURSS_BACKEND.pollCurrentSheet();
                if (res === null)
                    return;
                versionLabel.innerText = res.version;
                for (const [sheetId, sheetName] of res.sheetNames) {
                    const sheet = (_a = DISCOURSS_STATE.sidebarData) === null || _a === void 0 ? void 0 : _a.sheets[sheetId];
                    if (sheet && sheet.name != sheetName) {
                        sheet.name = sheetName;
                        if (sheet.sheetId === ((_b = DISCOURSS_STATE.sidebarData) === null || _b === void 0 ? void 0 : _b.sheetId)) {
                            renderSheetName(sheet);
                        }
                    }
                }
                if (res.sheetId !== DISCOURSS_STATE.sidebarData.sheetId) {
                    DISCOURSS_STATE.sidebarData.sheetId = res.sheetId;
                    await renderSidebar();
                }
            }
            finally {
                window.setTimeout(refresh, 100);
            }
        }
        refresh();
        renderSidebar().catch(unexpectedError);
    }
    log('loading');
    try {
        onLoad(await DISCOURSS_BACKEND.getSidebarData());
    }
    catch (e) {
        failureHandler(e);
    }
});
console.log(`${DEFAULT_APP_NAME} online`);
