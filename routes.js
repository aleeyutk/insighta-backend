const express = require('express');

const { enrichProfile, APIError } = require('./services');
const { getDB } = require('./database');
const { requireAdmin } = require('./auth');
const { Parser } = require('json2csv');

const router = express.Router();

function buildLinks(queryStr, page, totalPages, limit, path) {
    const qObj = new URLSearchParams();
    for (let key in queryStr) {
        if (key !== 'page' && key !== 'limit') {
            qObj.set(key, queryStr[key]);
        }
    }
    const makeUrl = (p) => {
        const urlParams = new URLSearchParams(qObj);
        urlParams.set('page', p);
        urlParams.set('limit', limit);
        let prefixStr = urlParams.toString();
        prefixStr = prefixStr ? '&' + prefixStr : '';
        return `/api${path}?page=${p}&limit=${limit}${prefixStr}`;
    };
    return {
        self: makeUrl(page),
        next: page < totalPages ? makeUrl(page + 1) : null,
        prev: page > 1 ? makeUrl(page - 1) : null
    };
}

router.post('/profiles', requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ status: "error", message: "Missing or empty name" });
        }
        if (typeof name !== 'string') {
            return res.status(422).json({ status: "error", message: "Invalid type" });
        }
        if (name.trim() === '') {
            return res.status(400).json({ status: "error", message: "Missing or empty name" });
        }
        const cleanName = name.trim().toLowerCase();

        const db = getDB();

        const existing = await db.get('SELECT * FROM profiles WHERE name = ?', cleanName);
        if (existing) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existing
            });
        }

        const enriched = await enrichProfile(cleanName);
        const { v7: uuidv7 } = await import('uuid');
        const id = uuidv7();
        const created_at = new Date().toISOString();

        await db.run(
            `INSERT INTO profiles (id, name, gender, gender_probability, age, age_group, country_id, country_probability, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, cleanName, enriched.gender, enriched.gender_probability, enriched.age, enriched.age_group, enriched.country_id, enriched.country_probability, created_at]
        );

        res.status(201).json({
            status: "success",
            data: {
                id,
                name: cleanName,
                gender: enriched.gender,
                gender_probability: enriched.gender_probability,
                sample_size: enriched.sample_size,
                age: enriched.age,
                age_group: enriched.age_group,
                country_id: enriched.country_id,
                country_probability: enriched.country_probability,
                created_at
            }
        });

    } catch (error) {
        console.error("Create profile error:", error);
        if (error instanceof APIError) {
            return res.status(502).json({ status: "502", message: error.message });
        }
        return res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.get('/profiles', async (req, res) => {
    try {
        const { gender, country_id, age_group, min_age, max_age, min_gender_probability, min_country_probability, sort_by, order, page, limit } = req.query;
        let query = 'SELECT * FROM profiles';
        let countQuery = 'SELECT COUNT(*) as count FROM profiles';
        const params = [];
        const conditions = [];

        if (gender && typeof gender === 'string') {
            conditions.push('LOWER(gender) = ?');
            params.push(gender.toLowerCase());
        }
        if (country_id && typeof country_id === 'string') {
            conditions.push('LOWER(country_id) = ?');
            params.push(country_id.toLowerCase());
        }
        if (age_group && typeof age_group === 'string') {
            conditions.push('LOWER(age_group) = ?');
            params.push(age_group.toLowerCase());
        }
        if (min_age) {
            conditions.push('age >= ?');
            params.push(parseInt(min_age, 10));
        }
        if (max_age) {
            conditions.push('age <= ?');
            params.push(parseInt(max_age, 10));
        }
        if (min_gender_probability) {
            conditions.push('gender_probability >= ?');
            params.push(parseFloat(min_gender_probability));
        }
        if (min_country_probability) {
            conditions.push('country_probability >= ?');
            params.push(parseFloat(min_country_probability));
        }

        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = ' WHERE ' + conditions.join(' AND ');
        }
        query += whereClause;
        countQuery += whereClause;

        if (sort_by && ['age', 'created_at', 'gender_probability'].includes(sort_by.toLowerCase())) {
            const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
            query += ` ORDER BY ${sort_by.toLowerCase()} ${sortOrder}`;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        let limitNum = Math.max(1, parseInt(limit, 10) || 10);
        if (limitNum > 50) limitNum = 50;

        query += ` LIMIT ? OFFSET ?`;
        params.push(limitNum, (pageNum - 1) * limitNum);

        const db = getDB();
        const [totalResult, profiles] = await Promise.all([
            db.get(countQuery, params.slice(0, conditions.length)),
            db.all(query, params)
        ]);

        const totalPages = Math.max(1, Math.ceil(totalResult.count / limitNum));

        res.status(200).json({
            status: "success",
            page: pageNum,
            limit: limitNum,
            total: totalResult.count,
            total_pages: totalPages,
            links: buildLinks(req.query, pageNum, totalPages, limitNum, '/profiles'),
            data: profiles
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.get('/profiles/search', async (req, res) => {
    try {
        const { q, page, limit } = req.query;
        if (!q) {
            return res.status(400).json({ status: "error", message: "Invalid query parameters" });
        }
        
        const { parseNaturalLanguageQuery } = require('./services');
        const filters = parseNaturalLanguageQuery(q);
        
        if (!filters) {
            return res.status(400).json({ status: "error", message: "Unable to interpret query" });
        }

        let query = 'SELECT * FROM profiles';
        let countQuery = 'SELECT COUNT(*) as count FROM profiles';
        const params = [];
        const conditions = [];

        if (filters.gender) {
            conditions.push('LOWER(gender) = ?');
            params.push(filters.gender.toLowerCase());
        }
        if (filters.country_id) {
            conditions.push('LOWER(country_id) = ?');
            params.push(filters.country_id.toLowerCase());
        }
        if (filters.age_group) {
            conditions.push('LOWER(age_group) = ?');
            params.push(filters.age_group.toLowerCase());
        }
        if (filters.min_age !== undefined) {
            conditions.push('age >= ?');
            params.push(filters.min_age);
        }
        if (filters.max_age !== undefined) {
            conditions.push('age <= ?');
            params.push(filters.max_age);
        }

        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = ' WHERE ' + conditions.join(' AND ');
        }
        query += whereClause;
        countQuery += whereClause;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        let limitNum = Math.max(1, parseInt(limit, 10) || 10);
        if (limitNum > 50) limitNum = 50;

        query += ` LIMIT ? OFFSET ?`;
        params.push(limitNum, (pageNum - 1) * limitNum);

        const db = getDB();
        const [totalResult, profiles] = await Promise.all([
            db.get(countQuery, params.slice(0, conditions.length)),
            db.all(query, params)
        ]);

        const totalPages = Math.max(1, Math.ceil(totalResult.count / limitNum));

        res.status(200).json({
            status: "success",
            page: pageNum,
            limit: limitNum,
            total: totalResult.count,
            total_pages: totalPages,
            links: buildLinks(req.query, pageNum, totalPages, limitNum, '/profiles/search'),
            data: profiles
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.get('/profiles/export', async (req, res) => {
    try {
        if (req.query.format !== 'csv') {
            return res.status(400).json({ status: "error", message: "Invalid format" });
        }
        const { gender, country_id, age_group, min_age, max_age, sort_by, order } = req.query;
        let query = 'SELECT * FROM profiles';
        const params = [];
        const conditions = [];

        if (gender) { conditions.push('LOWER(gender) = ?'); params.push(gender.toLowerCase()); }
        if (country_id) { conditions.push('LOWER(country_id) = ?'); params.push(country_id.toLowerCase()); }
        if (age_group) { conditions.push('LOWER(age_group) = ?'); params.push(age_group.toLowerCase()); }
        if (min_age) { conditions.push('age >= ?'); params.push(parseInt(min_age, 10)); }
        if (max_age) { conditions.push('age <= ?'); params.push(parseInt(max_age, 10)); }

        if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }

        if (sort_by && ['age', 'created_at', 'gender_probability'].includes(sort_by.toLowerCase())) {
            const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
            query += ` ORDER BY ${sort_by.toLowerCase()} ${sortOrder}`;
        }

        const db = getDB();
        const profiles = await db.all(query, params);

        const fields = ['id', 'name', 'gender', 'gender_probability', 'age', 'age_group', 'country_id', 'country_name', 'country_probability', 'created_at'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(profiles);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="profiles_${Date.now()}.csv"`);
        res.status(200).send(csv);

    } catch (error) {
        console.error("CSV Export error:", error);
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.get('/profiles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDB();
        const profile = await db.get('SELECT * FROM profiles WHERE id = ?', id);
        if (!profile) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }

        res.status(200).json({
            status: "success",
            data: profile
        });
    } catch (error) {
         res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.delete('/profiles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDB();
        await db.run('DELETE FROM profiles WHERE id = ?', id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

router.get('/profiles/export', async (req, res) => {
    try {
        if (req.query.format !== 'csv') {
            return res.status(400).json({ status: "error", message: "Invalid format" });
        }
        const { gender, country_id, age_group, min_age, max_age, sort_by, order } = req.query;
        let query = 'SELECT * FROM profiles';
        const params = [];
        const conditions = [];

        if (gender) { conditions.push('LOWER(gender) = ?'); params.push(gender.toLowerCase()); }
        if (country_id) { conditions.push('LOWER(country_id) = ?'); params.push(country_id.toLowerCase()); }
        if (age_group) { conditions.push('LOWER(age_group) = ?'); params.push(age_group.toLowerCase()); }
        if (min_age) { conditions.push('age >= ?'); params.push(parseInt(min_age, 10)); }
        if (max_age) { conditions.push('age <= ?'); params.push(parseInt(max_age, 10)); }

        if (conditions.length > 0) { query += ' WHERE ' + conditions.join(' AND '); }

        if (sort_by && ['age', 'created_at', 'gender_probability'].includes(sort_by.toLowerCase())) {
            const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
            query += ` ORDER BY ${sort_by.toLowerCase()} ${sortOrder}`;
        }

        const db = getDB();
        const profiles = await db.all(query, params);

        const fields = ['id', 'name', 'gender', 'gender_probability', 'age', 'age_group', 'country_id', 'country_name', 'country_probability', 'created_at'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(profiles);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="profiles_${Date.now()}.csv"`);
        res.status(200).send(csv);

    } catch (error) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

module.exports = router;
