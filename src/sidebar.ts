/** sidebar.js - this is compiled into sidebar.html during the build step */

import { CELL_VALUE, DEFAULT_APP_NAME, SidebarData } from "./common.js";

interface GoogleScriptRun {
  withSuccessHandler<T=unknown>(func: (val: T) => void): GoogleScriptRun,
  withFailureHandler(error: unknown): GoogleScriptRun,
  run(): void,
  setup(sheet: string): void,
  toggleTimer(): boolean,
  getSidebarData(): SidebarData,
  setSettings(sheet: string, settings: [string, CELL_VALUE][]): string[] | null,
  deleteSettings(sheet: string): void,
  pollCurrentSheet(): string,
}

declare global {
  const google: {script: {run: GoogleScriptRun}}
}

function swapButton(btn: HTMLInputElement, value?: string) {
  if (value) {
    btn.dataset['value'] = btn.value;
    btn.value = value;
  } else {
    value = btn.dataset['value'];
    if (value) {
      delete btn.dataset['value'];
      btn.value = value;
    }
  }
}

function getById<T=HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw Error(`Failed to locate element with id "${id}"`)
  }
  return el as T;
}

document.addEventListener("DOMContentLoaded", () => {
  function log(...args: any) {
    console.log(DEFAULT_APP_NAME, ...args);
  }

  // const STATE = {
  //   sidebarData: undefined as SidebarData|undefined
  // }

  const settings = getById('settings')!;
  const sheetNameLabel = getById('sheetName');
  const setupBtn = getById<HTMLInputElement>('setupBtn');
  const runBtn = getById<HTMLInputElement>('runBtn');
  const timerBtn  = getById<HTMLInputElement>('timerBtn');
  const saveBtn = getById<HTMLInputElement>('saveBtn');
  const deleteBtn = getById<HTMLInputElement>('deleteBtn');
  const refreshBtn = getById<HTMLInputElement>('refreshBtn');

  function timerButton(state: boolean) {
    timerBtn.value = state ? 'Disable Timer' : 'Enable Timer';
  }

  function failureHandler(e: unknown) {
    console.error(DEFAULT_APP_NAME, e);
    alert(e!.toString());
  }

  function onLoad(data: SidebarData) {
    log(`Loaded:`, data);
    const STATE = {sidebarData:  data};

    function renderSidebar() {
      const data = STATE.sidebarData.sheets[STATE.sidebarData.active];
      if (data === undefined) {
        document.body.classList.remove('loaded')
        refreshData();
        return;
      }
      if (data.isSet) {
        sheetNameLabel.innerText = `Sheet ${STATE.sidebarData.active}`;
        saveBtn.value = 'Save'
        deleteBtn.style.display = 'block';
        settings.querySelector('div')!.style.display = 'block'
      } else {
        sheetNameLabel.innerText = `Setup ${STATE.sidebarData.active}`;
        saveBtn.value = 'Create';
        deleteBtn.style.display = 'none';
        settings.querySelector('div')!.style.display = 'none'
      }
      settings.innerHTML = '';
      for (const [name, value, _] of data?.settings ?? []) {
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

    document.getElementById('version')!.innerText = data.version;
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
      google.script.run.withSuccessHandler((state: boolean) => {
        timerButton(state);
      }).toggleTimer();
    });

    deleteBtn.addEventListener('click', () => {
      swapButton(deleteBtn, 'Deleting...');
      google.script.run.withSuccessHandler(() => {
        swapButton(deleteBtn);
      }).deleteSettings(STATE.sidebarData!.active);
    });

    function refreshData() {
      google.script.run.withSuccessHandler((data: SidebarData) => {
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
      
      const values: [string, CELL_VALUE][] = [];
      for (let child of Array.from(settings.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'input') {
          const input = child as HTMLInputElement;
          if (input.getAttribute('type') === 'number') {
            values.push([input.name, parseInt(input.value)]);
          } else {
            values.push([input.name, input.value]);
          }
        } else if (tag === 'select') {
          const select = child as HTMLInputElement;
          values.push([select.name, select.value === 'true']);
        }
      }

      google.script.run.withSuccessHandler((errors: string[]) => {
        swapButton(saveBtn);
        if (errors?.length) {
          console.error('Errors occurred during saving: ', JSON.stringify(errors));
        }
        refreshData();
      }).setSettings(STATE.sidebarData!.active, values);
    });

    function refresh() {
      console.log(new Date(), 'refreshing: ');
      google.script.run.withSuccessHandler((sheet: string) => {
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