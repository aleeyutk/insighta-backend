const jwt = require('jsonwebtoken');
const { getDB } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

function generateTokens(userId, role) {
    const access_token = jwt.sign({ id: userId, role }, JWT_SECRET, { expiresIn: '3m' });
    const refresh_token = jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: '5m' });
    return { access_token, refresh_token };
}

async function requireAuth(req, res, next) {
    // Access control require HTTP headers or cookies
    const versionHeader = req.headers['x-api-version'];
    if (versionHeader !== '1') {
        return res.status(400).json({ status: 'error', message: 'API version header required' });
    }

    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
        token = req.cookies.access_token;
    }

    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = getDB();
        const user = await db.get('SELECT * FROM users WHERE id = ?', decoded.id);
        
        if (!user || user.is_active === 0) {
            return res.status(403).json({ status: 'error', message: 'Forbidden: Inactive or missing user' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ status: 'error', message: 'Invalid or expired access token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ status: 'error', message: 'Admin privileges required' });
    }
}

module.exports = {
    generateTokens,
    requireAuth,
    requireAdmin
};
