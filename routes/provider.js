const express = require('express');
const router = express.Router();
const pool = require('../db');

// PATCH /api/provider/:id/status
router.patch('/:id/status', async (req, res) => {
    const providerId = req.params.id;
    const { online_status, current_lat, current_lng } = req.body;

    try {
        // First, check if provider is verified
        const checkResult = await pool.query(
            `SELECT verification_status FROM providers WHERE user_id = $1`,
            [providerId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Provider not found' });
        }

        if (checkResult.rows[0].verification_status !== 'approved' && online_status === true) {
            return res.status(403).json({ 
                success: false, 
                message: 'Cannot go online. Account pending admin verification.' 
            });
        }

        // Update status and coordinates (Crucial for the Haversine matching engine)
        const updateResult = await pool.query(
            `UPDATE providers 
             SET online_status = $1, current_lat = $2, current_lng = $3 
             WHERE user_id = $4 
             RETURNING online_status, current_lat, current_lng`,
            [online_status, current_lat, current_lng, providerId]
        );

        res.json({
            success: true,
            message: online_status ? 'Provider is now ONLINE and ready for jobs' : 'Provider is now OFFLINE',
            data: updateResult.rows[0]
        });

    } catch (error) {
        console.error('Status Update Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;