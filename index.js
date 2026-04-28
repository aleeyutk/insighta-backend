require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { initDB } = require('./database');
const routes = require('./routes');
const authRoutes = require('./routes_auth');
const { requireAuth } = require('./auth');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Logging: Method Endpoint Status ResponseTime
app.use(morgan(':method :url :status :response-time ms'));

app.use('/auth', authRoutes);

// Rate limit: 60 requests / minute per user
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => req.user?.id || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    validate: { ip: false },
    message: { status: 'error', message: 'Too many requests' }
});

app.use('/api', requireAuth, apiLimiter, routes);

const PORT = process.env.PORT || 3000;

initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT}`);
    });
}).catch(console.error);
