/** sidebar.js - this is compiled into sidebar.html during the build step */
import { DEFAULT_APP_NAME } from "./common.js";
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
document.addEventListener("DOMContentLoaded", () => {
    function log(...args) {
        console.log(DEFAULT_APP_NAME, ...args);
    }
    // const STATE = {
    //   sidebarData: undefined as SidebarData|undefined
    // }
    const settings = getById('settings');
    const sheetNameLabel = getById('sheetName');
    const setupBtn = getById('setupBtn');
    const runBtn = getById('runBtn');
    const timerBtn = getById('timerBtn');
    const saveBtn = getById('saveBtn');
    const deleteBtn = getById('deleteBtn');
    const refreshBtn = getById('refreshBtn');
    function timerButton(state) {
        timerBtn.value = state ? 'Disable Timer' : 'Enable Timer';
    }
    function failureHandler(e) {
        console.error(DEFAULT_APP_NAME, e);
        alert(e.toString());
    }
    function onLoad(data) {
        log(`Loaded:`, data);
        const STATE = { sidebarData: data };
        function renderSidebar() {
            var _a;
            const data = STATE.sidebarData.sheets[STATE.sidebarData.active];
            if (data === undefined) {
                document.body.classList.remove('loaded');
                refreshData();
                return;
            }
            sheetNameLabel.innerText = STATE.sidebarData.active + (data.isSet ? '' : '*');
            settings.innerHTML = '';
            for (const [name, value, _] of (_a = data === null || data === void 0 ? void 0 : data.settings) !== null && _a !== void 0 ? _a : []) {
                const h2 = document.createElement('h2');
                h2.innerText = name;
                settings.appendChild(h2);
                if (typeof value === 'boolean') {
                    const select = document.createElement('select');
                    select.classList.add();
                    select.name = name;
                    const optionTrue = document.createElement('option');
                    optionTrue.innerText = 'True';
                    optionTrue.value = 'true';
                    optionTrue.selected = value;
                    select.appendChild(optionTrue);
                    const optionFalse = document.createElement('option');
                    optionFalse.innerText = 'False';
                    optionFalse.value = 'false';
                    optionFalse.selected = !value;
                    select.appendChild(optionFalse);
                    settings.appendChild(select);
                    continue;
                }
                const input = document.createElement('input');
                input.name = name;
                input.value = String(value);
                if (typeof value === 'number') {
                    input.type = 'number';
                }
                settings.appendChild(input);
            }
            document.body.classList.add('loaded');
        }
        document.getElementById('version').innerText = data.version;
        timerButton(data.timer);
        setupBtn.addEventListener('click', () => {
            swapButton(setupBtn, 'Setting Up...');
            google.script.run.withSuccessHandler(() => {
                swapButton(setupBtn);
            }).setup(STATE.sidebarData.active);
        });
        runBtn.addEventListener('click', () => {
            swapButton(runBtn, 'Running...');
            google.script.run.withSuccessHandler(() => {
                swapButton(runBtn);
            }).run();
        });
        timerBtn.addEventListener('click', () => {
            swapButton(timerBtn, '...');
            google.script.run.withSuccessHandler((state) => {
                timerButton(state);
            }).toggleTimer();
        });
        deleteBtn.addEventListener('click', () => {
            swapButton(deleteBtn, 'Deleting...');
            google.script.run.withSuccessHandler(() => {
                swapButton(deleteBtn);
            }).deleteSettings(STATE.sidebarData.active);
        });
        function refreshData() {
            google.script.run.withSuccessHandler((data) => {
                swapButton(refreshBtn);
                STATE.sidebarData = data;
                renderSidebar();
            }).getSidebarData();
        }
        refreshBtn.addEventListener('click', () => {
            swapButton(refreshBtn, 'Refreshing...');
            refreshData();
        });
        saveBtn.addEventListener('click', () => {
            swapButton(saveBtn, 'Saving...');
            const values = [];
            for (let child of Array.from(settings.children)) {
                const tag = child.tagName.toLowerCase();
                if (tag === 'input') {
                    const input = child;
                    if (input.getAttribute('type') === 'number') {
                        values.push([input.name, parseInt(input.value)]);
                    }
                    else {
                        values.push([input.name, input.value]);
                    }
                }
                else if (tag === 'select') {
                    const select = child;
                    values.push([select.name, select.value === 'true']);
                }
            }
            google.script.run.withSuccessHandler((errors) => {
                swapButton(saveBtn);
                if (errors === null || errors === void 0 ? void 0 : errors.length) {
                    console.error('Errors occurred during saving: ', JSON.stringify(errors));
                }
            }).setSettings(STATE.sidebarData.active, values);
        });
        function refresh() {
            console.log(new Date(), 'refreshing: ');
            google.script.run.withSuccessHandler((sheet) => {
                window.setTimeout(refresh, 100);
                if (sheet !== STATE.sidebarData.active) {
                    STATE.sidebarData.active = sheet;
                    renderSidebar();
                }
                console.log(new Date(), 'refresh returned: ', sheet);
            }).withFailureHandler(() => {
                window.setTimeout(refresh, 100);
                console.log(new Date(), 'refresh failed');
            }).pollCurrentSheet();
        }
        refresh();
        renderSidebar();
    }
    log('loading');
    google.script.run
        .withSuccessHandler(onLoad)
        .withFailureHandler(failureHandler)
        .getSidebarData();
});
console.log(`${DEFAULT_APP_NAME} online`);
