import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logError } from '../logger/index.js';
import { SESSION_DIR, ACCOUNTS_DIR, RATE_LIMIT_HOURS } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_PATH = path.resolve(__dirname, '..', '..', SESSION_DIR);
const ACCOUNTS_PATH = path.join(SESSION_PATH, ACCOUNTS_DIR);
const TOKENS_FILE = path.join(SESSION_PATH, 'tokens.json');

let pointer = 0;

function ensureSessionDir() {
    if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });
    if (!fs.existsSync(ACCOUNTS_PATH)) fs.mkdirSync(ACCOUNTS_PATH, { recursive: true });
}

export function loadTokens() {
    ensureSessionDir();
    if (!fs.existsSync(TOKENS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) {
        logError('TokenManager: ошибка чтения tokens.json', e);
        return [];
    }
}

export function saveTokens(tokens) {
    ensureSessionDir();
    try {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    } catch (e) {
        logError('TokenManager: ошибка сохранения tokens.json', e);
    }
}

export async function getAvailableToken() {
    const tokens = loadTokens();
    const now = Date.now();
    const valid = tokens.filter(t => (!t.resetAt || new Date(t.resetAt).getTime() <= now) && !t.invalid);
    if (!valid.length) return null;
    const token = valid[pointer % valid.length];
    pointer = (pointer + 1) % valid.length;
    return token;
}

export function hasValidTokens() {
    const tokens = loadTokens();
    const now = Date.now();
    return tokens.some(t => (!t.resetAt || new Date(t.resetAt).getTime() <= now) && !t.invalid);
}

export function markRateLimited(id, hours = RATE_LIMIT_HOURS) {
    const tokens = loadTokens();
    const idx = tokens.findIndex(t => t.id === id);
    if (idx !== -1) {
        tokens[idx].resetAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
        saveTokens(tokens);
    }
}

export function removeToken(id) {
    saveTokens(loadTokens().filter(t => t.id !== id));
}

export { removeToken as removeInvalidToken };

export function markInvalid(id) {
    const tokens = loadTokens();
    const idx = tokens.findIndex(t => t.id === id);
    if (idx !== -1) { tokens[idx].invalid = true; saveTokens(tokens); }
}

export function markValid(id, newToken) {
    const tokens = loadTokens();
    const idx = tokens.findIndex(t => t.id === id);
    if (idx !== -1) {
        tokens[idx].invalid = false;
        tokens[idx].resetAt = null;
        if (newToken) tokens[idx].token = newToken;
        saveTokens(tokens);
    }
}

// Обновляет токен существующего аккаунта (relogin из дашборда):
// markValid (обновляет token + сбрасывает invalid/resetAt) + перезапись token.txt.
export function updateAccountToken(id, rawToken) {
    if (typeof id !== 'string' || !/^acc_[a-zA-Z0-9]+$/.test(id)) {
        return { error: 'Некорректный id аккаунта' };
    }
    const token = String(rawToken || '').trim();
    if (!token.startsWith('eyJ') || token.split('.').length !== 3) {
        return { error: 'Невалидный токен: ожидается JWT (eyJ...)' };
    }
    const tokens = loadTokens();
    const acc = tokens.find(t => t.id === id);
    if (!acc) return { error: 'Аккаунт не найден' };
    if (tokens.some(t => t.id !== id && t.token === token)) {
        return { error: 'Этот токен уже используется другим аккаунтом' };
    }
    const dir = path.join(ACCOUNTS_PATH, id);
    if (!path.resolve(dir).startsWith(path.resolve(ACCOUNTS_PATH) + path.sep)) {
        return { error: 'Недопустимый путь аккаунта' };
    }
    markValid(id, token);
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'token.txt'), token, 'utf8');
    } catch (e) {
        logError('TokenManager: не удалось записать token.txt для ' + id, e);
    }
    const info = decodeTokenInfo(token);
    return { ok: true, id, exp: info.exp };
}

export function listTokens() {
    return loadTokens();
}

// Декодирует payload JWT без проверки подписи — для отображения срока и id аккаунта.
export function decodeTokenInfo(token) {
    try {
        const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
        return { exp: payload.exp ? payload.exp * 1000 : null, accountId: payload.id || null };
    } catch {
        return { exp: null, accountId: null };
    }
}

// Добавляет токен вручную (из дашборда), без запуска браузера.
// Возвращает { id } при успехе либо { error }.
export function addTokenFromString(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token.startsWith('eyJ') || token.split('.').length !== 3) {
        return { error: 'Невалидный токен: ожидается JWT (eyJ...)' };
    }
    const tokens = loadTokens();
    if (tokens.some(t => t.token === token)) {
        return { error: 'Этот токен уже добавлен' };
    }
    let n = 2;
    const ids = new Set(tokens.map(t => t.id));
    while (ids.has('acc_' + n)) n++;
    const id = 'acc_' + n;

    const accDir = path.join(ACCOUNTS_PATH, id);
    fs.mkdirSync(accDir, { recursive: true });
    fs.writeFileSync(path.join(accDir, 'token.txt'), token, 'utf8');

    tokens.push({ id, token, resetAt: null });
    saveTokens(tokens);
    return { id };
}

// Полностью удаляет аккаунт: запись в tokens.json и папку с token.txt.
export function deleteAccount(id) {
    // Защита от path traversal: id попадает в путь файловой системы.
    if (typeof id !== 'string' || !/^acc_[a-zA-Z0-9]+$/.test(id)) {
        return { error: 'Некорректный id аккаунта' };
    }
    const dir = path.join(ACCOUNTS_PATH, id);
    if (!path.resolve(dir).startsWith(path.resolve(ACCOUNTS_PATH) + path.sep)) {
        return { error: 'Недопустимый путь аккаунта' };
    }
    removeToken(id);
    try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        logError('TokenManager: не удалось удалить папку аккаунта ' + id, e);
    }
    return { ok: true };
}
