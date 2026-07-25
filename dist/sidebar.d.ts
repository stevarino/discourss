/** sidebar.js - this is compiled into sidebar.html during the build step */
import { Button, ButtonSet, SidebarData, SidebarPollResponse, SidebarSaveRequest, SidebarSaveResponse } from "./common.js";
type GoogleScriptRun = {
    withSuccessHandler<T = unknown>(func: (val: T) => void): GoogleScriptRun;
    withFailureHandler(error: unknown): GoogleScriptRun;
} & {
    [key: string]: (...arg: any[]) => any;
};
declare global {
    const google: {
        script: {
            run: GoogleScriptRun;
        };
    };
}
export declare const DISCOURSS_BACKEND: {
    readonly run: (...args: any[]) => Promise<void | null>;
    readonly toggleTimer: () => Promise<boolean | null>;
    readonly getSidebarData: () => Promise<SidebarData | null>;
    readonly setSettings: (req: SidebarSaveRequest) => Promise<SidebarSaveResponse | null>;
    readonly deleteSettings: (sheetId: string) => Promise<SidebarSaveResponse | null>;
    readonly pollCurrentSheet: () => Promise<SidebarPollResponse | null>;
    readonly alert: (msg: string, buttons?: ButtonSet | undefined) => Promise<Button | null>;
    readonly performRssFinder: (url: string) => Promise<boolean | null>;
};
export {};
