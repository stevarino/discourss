import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Project } from "ts-morph";
function getFunctionSignature(func) {
    return {
        parameters: Object.fromEntries(func.getParameters().map(p => {
            return [p.getName(), {
                    optional: p.isOptional(),
                    isRest: p.isRestParameter(),
                    type: p.getType().getText(),
                }];
        })),
        returns: func.getReturnType().getText(),
    };
}
describe('sidebar.ts unit tests', () => {
    test('index.ts interface supports sidebar.ts calls', () => {
        const project = new Project({ tsConfigFilePath: "tsconfig.json" });
        const sidebarFile = project.addSourceFileAtPath('src/sidebar.ts');
        const indexFile = project.addSourceFileAtPath('src/index.ts');
        const sidebarCaller = sidebarFile.getVariableDeclarationOrThrow('DISCOURSS_BACKEND');
        const endpoints = sidebarCaller.getType().getProperties();
        assert.ok(endpoints.length > 0, 'DISCOURSS_BACKEND should have properties');
        for (const endpoint of endpoints) {
            const name = endpoint.getName();
            const indexFunc = indexFile.getFunction(name);
            assert.ok(indexFunc, `'${name}' not found in index.ts`);
            assert.ok(indexFunc.isExported(), `'${name}' in index.ts must be exported`);
            const sigs = endpoint.getTypeAtLocation(sidebarCaller).getCallSignatures();
            assert.strictEqual(1, sigs.length, `${name}: expected 1 signature`);
            const callSig = getFunctionSignature(sigs[0].getDeclaration());
            const indexSig = getFunctionSignature(indexFunc);
            // modify return type to an async nullable call as its now an RPC, janky but works
            indexSig.returns = `Promise<${indexSig.returns.replace(/\s*\|\s*null/, '')} | null>`;
            assert.strictEqual(indexSig.returns, callSig.returns, `${name} - mismatched returns`);
            verifyParams(indexSig.parameters, callSig.parameters);
        }
    });
});
function verifyParams(indexParams, callerParams) {
    const iParams = Object.entries(indexParams);
    const cParams = Object.values(callerParams);
    for (let i = 0; i < Math.max(iParams.length, cParams.length); i++) {
        const [name, iParam] = iParams[i];
        const cParam = cParams[i];
        // greedy param consumes all.
        // TODO: verify isRest types?
        if ((iParam === null || iParam === void 0 ? void 0 : iParam.isRest) || (cParam === null || cParam === void 0 ? void 0 : cParam.isRest)) {
            return;
        }
        // ran out of required params, no longer care.
        if ((iParam === null || iParam === void 0 ? void 0 : iParam.optional) && cParam === undefined) {
            return;
        }
        // mismatch
        if (iParam === undefined || cParam === undefined) {
            throw new Error(`Uneven argument match: declaration has ${iParams.length}, caller has ${cParams.length}`);
        }
        if (iParam.optional === false && cParam.optional) {
            throw new Error(`Non-optional param marked optional: ${name}`);
        }
        if (iParam.type !== cParam.type) {
            throw new Error(`Unmatched types: expected "${iParam.type}", got ${cParam.type}`);
        }
    }
    return;
}
