/** sidebar.js - this is compiled into sidebar.html during the build step */
import { CELL_VALUE, SidebarData } from "./common.js";
interface GoogleScriptRun {
    withSuccessHandler<T = unknown>(func: (val: T) => void): GoogleScriptRun;
    withFailureHandler(error: unknown): GoogleScriptRun;
    run(): void;
    setup(sheet: string): void;
    toggleTimer(): boolean;
    getSidebarData(): SidebarData;
    setSettings(sheet: string, settings: [string, CELL_VALUE][]): string[] | null;
    deleteSettings(sheet: string): void;
    pollCurrentSheet(): string;
}
declare global {
    const google: {
        script: {
            run: GoogleScriptRun;
        };
    };
}
export {};
