const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// ------------------- BATCH COLLECTION (Main Endpoint) -------------------
router.post('/collect_batch', async (req, res) => {
    const { batch, api_key } = req.body;

    const VALID_API_KEY = process.env.API_KEY || 'research-lab-2026';
    if (api_key !== VALID_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!batch || !Array.isArray(batch) || batch.length === 0) {
        return res.status(400).json({ error: 'Invalid batch payload' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertPromises = batch.map(async (item) => {
            const query = `
                INSERT INTO test_payloads 
                (payload_type, app_name, data, device_id, captured_at) 
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id;
            `;
            const values = [
                item.type || 'unknown',
                item.app || null,
                item.data || '{}',
                item.device_id || 'unknown',
                item.timestamp ? new Date(item.timestamp) : new Date()
            ];
            return client.query(query, values);
        });

        const results = await Promise.all(insertPromises);
        await client.query('COMMIT');

        const ids = results.map(r => r.rows[0].id);
        console.log(`✅ Inserted ${ids.length} records from batch.`);

        // Broadcast to dashboard via WebSocket
        if (global.io) {
            const newRows = await client.query(
                `SELECT * FROM test_payloads WHERE id = ANY($1)`,
                [ids]
            );
            global.io.emit('newData', newRows.rows);
            console.log(`📡 Broadcast ${newRows.rows.length} new records to dashboard.`);
        }

        res.status(200).json({ 
            success: true, 
            inserted: ids.length,
            ids: ids 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Batch insert failed:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// ------------------- VIEW DATA (Excludes soft-deleted) -------------------
router.get('/view', async (req, res) => {
    const { limit = 100, offset = 0, app = null, type = null } = req.query;

    let query = `SELECT * FROM test_payloads WHERE deleted = FALSE`;
    const params = [];
    let paramIndex = 1;

    if (app) {
        query += ` AND app_name = $${paramIndex++}`;
        params.push(app);
    }
    if (type) {
        query += ` AND payload_type = $${paramIndex++}`;
        params.push(type);
    }

    query += ` ORDER BY captured_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('View error:', err);
        res.status(500).json({ error: 'Query failed' });
    }
});

// ------------------- STATISTICS -------------------
router.get('/stats', async (req, res) => {
    try {
        const totalQuery = `SELECT COUNT(*) FROM test_payloads WHERE deleted = FALSE`;
        const todayQuery = `SELECT COUNT(*) FROM test_payloads WHERE deleted = FALSE AND DATE(captured_at) = CURRENT_DATE`;
        const breakdownQuery = `
            SELECT payload_type, COUNT(*) as count 
            FROM test_payloads 
            WHERE deleted = FALSE 
            GROUP BY payload_type
        `;
        const appBreakdownQuery = `
            SELECT app_name, COUNT(*) as count 
            FROM test_payloads 
            WHERE deleted = FALSE AND app_name IS NOT NULL
            GROUP BY app_name 
            ORDER BY count DESC 
            LIMIT 10
        `;

        const [totalRes, todayRes, breakdownRes, appBreakdownRes] = await Promise.all([
            pool.query(totalQuery),
            pool.query(todayQuery),
            pool.query(breakdownQuery),
            pool.query(appBreakdownQuery)
        ]);

        res.json({
            total: parseInt(totalRes.rows[0].count),
            today: parseInt(todayRes.rows[0].count),
            breakdown: breakdownRes.rows,
            topApps: appBreakdownRes.rows
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Stats failed' });
    }
});

// ------------------- SOFT DELETE (Single) -------------------
router.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE test_payloads SET deleted = TRUE WHERE id = $1 RETURNING id`,
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ------------------- SOFT DELETE (All from an App) -------------------
router.delete('/delete_app/:app_name', async (req, res) => {
    const { app_name } = req.params;
    try {
        const result = await pool.query(
            `UPDATE test_payloads SET deleted = TRUE WHERE app_name = $1 AND deleted = FALSE`,
            [app_name]
        );
        res.json({ success: true, deleted_count: result.rowCount });
    } catch (err) {
        console.error('Delete app error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ------------------- RESTORE (For forensic recovery) -------------------
router.post('/restore/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE test_payloads SET deleted = FALSE WHERE id = $1 RETURNING id`,
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Restore error:', err);
        res.status(500).json({ error: 'Restore failed' });
    }
});

module.exports = router;