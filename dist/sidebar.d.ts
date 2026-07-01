/** sidebar.js - this is compiled into sidebar.html during the build step */
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
export {};
