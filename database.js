const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDB() {
    db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            gender TEXT,
            gender_probability REAL,
            age INTEGER,
            age_group TEXT,
            country_id TEXT,
            country_name TEXT,
            country_probability REAL,
            created_at TEXT
        )
    `);

    // Add users table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            github_id TEXT UNIQUE,
            username TEXT,
            email TEXT,
            avatar_url TEXT,
            role TEXT DEFAULT 'analyst',
            is_active BOOLEAN DEFAULT 1,
            last_login_at TEXT,
            created_at TEXT
        )
    `);

    // Add refresh_tokens table to track standard valid tokens or invalidations if needed
    // (Actually the requirement is just invalidates server-side, 
    // we can either store active refresh tokens or simply delete them when used/logged out)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            expires_at TEXT
        )
    `);

    return db;
}

function getDB() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

module.exports = { initDB, getDB };
