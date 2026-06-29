import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import env from '../config/env';
import { encryptConfig, tryParseConfigToken } from '../utils/cryptoConfig';
import {
    authEnabled, verifyPassword, createSession, isAuthenticated,
    sessionCookieHeader, requireAuth,
} from '../utils/webauth';
import { loginLimiter } from '../middleware/rateLimiter';
import { listConfigs, getConfig, saveConfig, deleteConfig } from '../utils/configStore';
import { getCategories as stalkerCategories } from '../providers/stalkerProvider';
import { validatePublicUrl } from '../utils/validateUrl';

const router = Router();

// ── Auth ────────────────────────────────────────────────────────────────────
router.get('/api/auth/status', (req, res) => {
    res.json({ authEnabled: authEnabled(), authenticated: isAuthenticated(req) });
});

router.post('/api/login', loginLimiter, (req, res) => {
    if (!authEnabled()) return res.json({ ok: true, authEnabled: false });
    const { password } = req.body || {};
    if (!verifyPassword(password)) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    const token = createSession();
    res.setHeader('Set-Cookie', sessionCookieHeader(token, !!req.secure));
    res.json({ ok: true });
});

router.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', sessionCookieHeader(null, !!req.secure));
    res.json({ ok: true });
});

// ── Saved configurations (server-side, gated) ─────────────────────────────────
router.get('/api/configs', requireAuth, (_req, res) => {
    res.json({ configs: listConfigs() });
});

router.get('/api/configs/:id', requireAuth, (req, res) => {
    const config = getConfig(req.params.id);
    if (!config) return res.status(404).json({ error: 'Not found' });
    res.json({ config });
});

router.post('/api/configs', requireAuth, (req, res) => {
    const { name, config, id } = req.body || {};
    if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Missing config' });
    }
    try {
        const meta = saveConfig(name, config, id);
        res.json({ ok: true, ...meta });
    } catch (e: any) {
        res.status(500).json({ error: 'Save failed' });
    }
});

router.delete('/api/configs/:id', requireAuth, (req, res) => {
    const removed = deleteConfig(req.params.id);
    res.json({ ok: true, removed });
});

// Stalker portal categories (live TV + movies, typed) for the config UI.
router.post('/api/stalker/categories', requireAuth, async (req, res) => {
    const { url, mac } = req.body || {};
    if (!url || !mac) return res.status(400).json({ error: 'Portal URL and MAC required' });
    try {
        await validatePublicUrl(String(url));
        const categories = await stalkerCategories({ url: String(url), mac: String(mac) });
        if (!categories.length) return res.status(502).json({ error: 'No categories (check URL/MAC)' });
        res.json({ categories });
    } catch {
        res.status(502).json({ error: 'Stalker portal unreachable' });
    }
});

router.post('/encrypt', requireAuth, (req, res) => {
    if (!env.CONFIG_SECRET) {
        return res.status(400).json({ error: 'Encryption not enabled on server (CONFIG_SECRET missing)' });
    }
    try {
        const jsonStr = JSON.stringify(req.body || {});
        const token = encryptConfig(jsonStr);
        if (!token) return res.status(500).json({ error: 'Encrypt failed' });
        res.json({ token });
    } catch {
        res.status(400).json({ error: 'Invalid config payload' });
    }
});

// Decode a manifest token back into its config (for restoring the form when
// reconfiguring from Stremio). Auth-gated: it returns plaintext credentials.
router.post('/api/decode-token', requireAuth, (req, res) => {
    const token = (req.body && req.body.token) ? String(req.body.token) : '';
    if (!token) return res.status(400).json({ error: 'Token required' });
    try {
        const config = tryParseConfigToken(token);
        if (!config || typeof config !== 'object') return res.status(422).json({ error: 'Invalid token' });
        res.json({ config });
    } catch {
        res.status(422).json({ error: 'Cannot decode token' });
    }
});

router.get('/api/addon-info', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
        name: env.ADDON_NAME,
        description: env.ADDON_DESCRIPTION,
        logoUrl: env.ADDON_LOGO_URL
    });
});

router.get('/api/capabilities', (req, res) => {
    res.json({ encryptionEnabled: !!env.CONFIG_SECRET });
});

// Resolve correctly in both dev (src/routes) and prod (dist/src/routes)
const isDist = __dirname.split(path.sep).includes('dist');
const PUBLIC_PLAYLISTS_PATH = isDist
    ? path.join(__dirname, '..', '..', '..', '..', '..', 'config', 'public-playlists.json')
    : path.join(__dirname, '..', '..', '..', '..', 'config', 'public-playlists.json');

router.get('/api/public-playlists', (req, res) => {
    try {
        const raw = fs.readFileSync(PUBLIC_PLAYLISTS_PATH, 'utf8');
        const playlists = JSON.parse(raw);
        if (!Array.isArray(playlists)) return res.json([]);
        res.json(playlists);
    } catch {
        res.json([]);
    }
});

import prefetchRouter from './prefetch';
router.use(prefetchRouter);

export default router;
