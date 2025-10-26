import fs from 'fs/promises';
import path from 'path';

let resolvedDir = '';
let initPromise = null;
let hasLogged = false;

function candidates() {
    const envDir = process.env.DATA_DIR && process.env.DATA_DIR.trim();
    return [envDir, path.join(process.cwd(), 'data')].filter(Boolean);
}

async function tryResolve(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
        const test = path.join(dir, '.write_test');
        await fs.writeFile(test, 'ok');
        await fs.unlink(test).catch(() => {});
        return true;
    } catch (e) {
        return false;
    }
}

export function getDataDir() {
    return resolvedDir || path.join(process.cwd(), 'data');
}

export async function ensureDataDir() {
    if (resolvedDir) return resolvedDir;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        for (const dir of candidates()) {
            if (await tryResolve(dir)) {
                resolvedDir = dir;
                if (!hasLogged) {
                    hasLogged = true;
                    try { console.info(`📁 Using data directory: ${resolvedDir}`); } catch(_) {}
                }
                return resolvedDir;
            }
        }
        // final fallback
        const fallback = path.join(process.cwd(), 'data');
        await fs.mkdir(fallback, { recursive: true });
        resolvedDir = fallback;
        if (!hasLogged) {
            hasLogged = true;
            try { console.info(`📁 Using fallback data directory: ${resolvedDir}`); } catch(_) {}
        }
        return resolvedDir;
    })();
    return initPromise;
}

export function dataFile(fileName) {
    return path.join(getDataDir(), fileName);
}

