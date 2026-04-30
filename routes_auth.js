const express = require('express');
const axios = require('axios');
const { getDB } = require('./database');
const { generateTokens } = require('./auth');
const jwt = require('jsonwebtoken');

const router = express.Router();
const rateLimit = require('express-rate-limit');

// Rate limiting for auth endpoints (10 requests / minute)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.headers['fly-client-ip'] || req.ip,
    message: { status: 'error', message: 'Too many requests' }
});

router.use(authLimiter);

router.get('/github', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    const client_id = process.env.GITHUB_CLIENT_ID;
    if (!client_id) return res.status(500).json({ status: 'error', message: 'OAuth not configured' });
    
    const params = new URLSearchParams({
        client_id,
        redirect_uri: process.env.GITHUB_CALLBACK_WEB,
        scope: 'read:user user:email'
    });
    
    for (const [key, value] of Object.entries(req.query)) {
        if (!['client_id', 'redirect_uri', 'scope'].includes(key)) {
            params.append(key, value);
        }
    }
    
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (req, res) => {
    // Web Flow callback
    try {
        const { code, state } = req.query;
        if (!state) return res.status(400).json({ status: 'error', message: 'Missing state' });
        if (!code) return res.status(400).json({ status: 'error', message: 'No code provided' });

        const user = await exchangeCodeForUser(code, process.env.GITHUB_CALLBACK_WEB);
        const { access_token, refresh_token } = generateTokens(user.id, user.role);
        
        const db = getDB();
        const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db.run('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [refresh_token, user.id, expires_at]);
        
        res.cookie('access_token', access_token, { httpOnly: true, secure: false, maxAge: 3 * 60 * 1000 });
        res.cookie('refresh_token', refresh_token, { httpOnly: true, secure: false, maxAge: 5 * 60 * 1000 });
        
        res.json({
            status: 'success',
            access_token,
            refresh_token,
            user: { id: user.id, role: user.role }
        });
    } catch (error) {
        console.error("Web OAuth Error:", error.message);
        res.status(400).json({ status: 'error', message: 'Invalid code or state' });
    }
});

// For CLI
router.post('/github/cli', async (req, res) => {
    try {
        const { code, redirect_uri, code_verifier } = req.body;
        if (!code) return res.status(400).json({ status: 'error', message: 'No code provided' });

        const user = await exchangeCodeForUser(code, redirect_uri); // Using the explicit redirect URI from CLI
        const { access_token, refresh_token } = generateTokens(user.id, user.role);
        
        const db = getDB();
        const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db.run('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [refresh_token, user.id, expires_at]);

        res.json({ status: 'success', access_token, refresh_token });
    } catch (error) {
        console.error("CLI OAuth Error:", error.message);
        res.status(500).json({ status: 'error', message: 'Authentication failed' });
    }
});

const enforcePost = (req, res, next) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
    }
    next();
};

router.use('/refresh', enforcePost);
router.use('/logout', enforcePost);

router.post('/refresh', async (req, res) => {
    const refresh_token = req.body.refresh_token || (req.cookies && req.cookies.refresh_token);
    if (!refresh_token) return res.status(400).json({ status: 'error', message: 'No refresh token' });

    const db = getDB();
    const tokenRecord = await db.get('SELECT * FROM refresh_tokens WHERE token = ?', refresh_token);
    
    if (!tokenRecord) {
        return res.status(403).json({ status: 'error', message: 'Invalid or revoked token' });
    }
    
    try {
        const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || 'refresh_secret');
        const user = await db.get('SELECT * FROM users WHERE id = ?', decoded.id);
        
        if (!user || user.is_active === 0) throw new Error('User inactive');

        await db.run('DELETE FROM refresh_tokens WHERE token = ?', refresh_token);

        const newTokens = generateTokens(user.id, user.role);
        const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db.run('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [newTokens.refresh_token, user.id, expires_at]);

        if (req.cookies && req.cookies.refresh_token) {
            res.cookie('access_token', newTokens.access_token, { httpOnly: true, secure: false, maxAge: 3 * 60 * 1000 });
            res.cookie('refresh_token', newTokens.refresh_token, { httpOnly: true, secure: false, maxAge: 5 * 60 * 1000 });
        }

        res.json({
            status: 'success',
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token
        });

    } catch (err) {
        await db.run('DELETE FROM refresh_tokens WHERE token = ?', refresh_token);
        return res.status(403).json({ status: 'error', message: 'Refresh token expired or invalid' });
    }
});

router.post('/logout', async (req, res) => {
    const refresh_token = req.body.refresh_token || (req.cookies && req.cookies.refresh_token);
    if (refresh_token) {
        const db = getDB();
        await db.run('DELETE FROM refresh_tokens WHERE token = ?', refresh_token);
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ status: 'success', message: 'Logged out successfully' });
});


// Helper
async function exchangeCodeForUser(code, redirect_uri) {
    const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri
    }, {
        headers: { Accept: 'application/json' }
    });

    if (tokenRes.data.error) {
        throw new Error(tokenRes.data.error_description || 'OAuth token exchange failed');
    }

    const access_token = tokenRes.data.access_token;
    const [userRes, emailRes] = await Promise.all([
        axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${access_token}` } }),
        axios.get('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${access_token}` } })
    ]);

    const ghUser = userRes.data;
    const primaryEmail = emailRes.data.find(e => e.primary)?.email || ghUser.email;

    const db = getDB();
    let user = await db.get('SELECT * FROM users WHERE github_id = ?', ghUser.id.toString());
    
    if (!user) {
        const { v7: uuidv7 } = await import('uuid');
        const id = uuidv7();
        const countRes = await db.get('SELECT COUNT(*) as count FROM users');
        const role = (countRes.count === 0) ? 'admin' : 'analyst';
        const now = new Date().toISOString();

        await db.run(
            `INSERT INTO users (id, github_id, username, email, avatar_url, role, last_login_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, ghUser.id.toString(), ghUser.login, primaryEmail, ghUser.avatar_url, role, now, now]
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', id);
    } else {
        const now = new Date().toISOString();
        await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [now, user.id]);
        user.last_login_at = now;
    }

    return user;
}

module.exports = router;
