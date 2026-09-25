const express = require('express');
const router = express.Router();
const pool = require('../db');

// PATCH /api/admin/providers/:id/approve
router.patch('/providers/:id/approve', async (req, res) => {
    const providerId = req.params.id;

    try {
        await pool.query('BEGIN');

        // 1. Approve the provider's profile
        const updateResult = await pool.query(
            `UPDATE providers 
             SET verification_status = 'approved' 
             WHERE user_id = $1 
             RETURNING user_id, verification_status`,
            [providerId]
        );

        if (updateResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Provider not found' });
        }

        // 2. Approve their requested services (MVP assumption: all requested services are approved)
        await pool.query(
            `UPDATE provider_services 
             SET approval_status = 'approved' 
             WHERE provider_id = $1`,
            [providerId]
        );

        await pool.query('COMMIT');

        res.json({
            success: true,
            message: 'Provider approved successfully. They can now go online.',
            data: updateResult.rows[0]
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Admin Approval Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // 1. Marketplace Financial Health
        const financeResult = await pool.query(`
            SELECT 
                COUNT(b.id) as total_completed_bookings,
                COALESCE(SUM(b.gross_amount), 0) as gross_marketplace_value,
                COALESCE(SUM(c.commission_amount), 0) as med_at_home_revenue,
                COALESCE(SUM(c.provider_earning), 0) as total_provider_payouts
            FROM bookings b
            LEFT JOIN commissions c ON b.id = c.booking_id
            WHERE b.status = 'completed'
        `);

        // 2. Provider Supply & Availability
        const supplyResult = await pool.query(`
            SELECT 
                COUNT(user_id) as total_approved_providers,
                SUM(CASE WHEN online_status = true THEN 1 ELSE 0 END) as online_and_ready
            FROM providers
            WHERE verification_status = 'approved'
        `);

        // 3. Live Operations / Dispatch Board
        const liveOpsResult = await pool.query(`
            SELECT 
                b.id as booking_id, 
                b.status, 
                s.name as service_name,
                b.location_address, 
                b.scheduled_time
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            WHERE b.status NOT IN ('completed', 'cancelled', 'failed')
            ORDER BY b.scheduled_time ASC
        `);

        res.json({
            success: true,
            message: 'Admin Command Centre data retrieved',
            data: {
                marketplace_health: financeResult.rows[0],
                provider_supply: supplyResult.rows[0],
                live_operations: liveOpsResult.rows
            }
        });

    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        res.status(500).json({ success: false, message: 'Server error loading dashboard' });
    }
});
module.exports = router;