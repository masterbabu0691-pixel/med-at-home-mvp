const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/bookings/create
router.post('/create', async (req, res) => {
    const { customer_id, service_id, scheduled_time, address, lat, lng } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Get Service details and price
        const serviceResult = await pool.query('SELECT name, base_price FROM services WHERE id = $1', [service_id]);
        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }
        const servicePrice = serviceResult.rows[0].base_price;

        // 2. Generate Booking ID (e.g., MAH-20260925-4592)
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const randomCode = Math.floor(1000 + Math.random() * 9000); 
        const bookingId = `MAH-${dateStr}-${randomCode}`;

        // 3. Create the Booking in 'searching' status
        await pool.query(
            `INSERT INTO bookings (
                id, customer_id, service_id, status, scheduled_time, 
                location_address, location_lat, location_lng, gross_amount
            ) VALUES ($1, $2, $3, 'searching', $4, $5, $6, $7, $8)`,
            [bookingId, customer_id, service_id, scheduled_time, address, lat, lng, servicePrice]
        );

        // 4. THE HAVERSINE MATCHING ENGINE
        // This calculates exact distance and filters out offline, unverified, or incapable providers
        const matchingQuery = `
            WITH EligibleProviders AS (
                SELECT 
                    p.user_id,
                    u.name,
                    p.rating,
                    (6371 * acos(
                        cos(radians($1)) * cos(radians(p.current_lat)) * 
                        cos(radians(p.current_lng) - radians($2)) + 
                        sin(radians($1)) * sin(radians(p.current_lat))
                    )) AS distance_km,
                    p.service_radius_km
                FROM providers p
                JOIN users u ON p.user_id = u.id
                JOIN provider_services ps ON p.user_id = ps.provider_id
                WHERE p.online_status = true
                  AND p.verification_status = 'approved'
                  AND ps.service_id = $3
                  AND ps.approval_status = 'approved'
            )
            SELECT * FROM EligibleProviders 
            WHERE distance_km <= service_radius_km 
            ORDER BY distance_km ASC 
            LIMIT 5;
        `;

        // Run the engine
        const matchResult = await pool.query(matchingQuery, [lat, lng, service_id]);

        await pool.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Booking created and matching engine executed.',
            data: {
                booking_id: bookingId,
                status: 'searching',
                gross_amount: servicePrice,
                matched_providers: matchResult.rows // In a real app, we send push notifications to these providers next
            }
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Booking Error:', error);
        res.status(500).json({ success: false, message: 'Server error during booking' });
    }
});
// POST /api/bookings/:id/accept
router.post('/:id/accept', async (req, res) => {
    const bookingId = req.params.id;
    const { provider_id } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Verify the booking is still available
        const bookingResult = await pool.query(
            `SELECT b.gross_amount, b.status, s.platform_commission_pct 
             FROM bookings b 
             JOIN services s ON b.service_id = s.id 
             WHERE b.id = $1`,
            [bookingId]
        );

        if (bookingResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }
        if (bookingResult.rows[0].status !== 'searching') {
            return res.status(400).json({ success: false, message: 'Booking is no longer available' });
        }

        const grossAmount = parseFloat(bookingResult.rows[0].gross_amount);
        const commissionPct = parseFloat(bookingResult.rows[0].platform_commission_pct);

        // 2. Calculate the finances
        const commissionAmount = (grossAmount * (commissionPct / 100)).toFixed(2);
        const providerNet = (grossAmount - commissionAmount).toFixed(2);

        // 3. Lock the booking to this provider
        await pool.query(
            `UPDATE bookings 
             SET status = 'provider_accepted', provider_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [provider_id, bookingId]
        );

        // 4. Record Med At Home's Commission
        await pool.query(
            `INSERT INTO commissions (booking_id, commission_percentage, commission_amount, provider_earning)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, commissionPct, commissionAmount, providerNet]
        );

        // 5. Add to Provider's Wallet/Ledger
        await pool.query(
            `INSERT INTO provider_earnings (provider_id, booking_id, gross_amount, commission_deducted, net_payable)
             VALUES ($1, $2, $3, $4, $5)`,
            [provider_id, bookingId, grossAmount, commissionAmount, providerNet]
        );

        await pool.query('COMMIT');

        res.json({
            success: true,
            message: 'Job accepted successfully. Navigation can now begin.',
            data: {
                booking_id: bookingId,
                status: 'provider_accepted',
                financials: {
                    gross_customer_payment: grossAmount,
                    med_at_home_commission: commissionAmount,
                    provider_net_earning: providerNet
                }
            }
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Acceptance Error:', error);
        res.status(500).json({ success: false, message: 'Server error during acceptance' });
    }
});
// PATCH /api/bookings/:id/status
router.patch('/:id/status', async (req, res) => {
    const bookingId = req.params.id;
    const { provider_id, new_status, completion_notes } = req.body;

    // Valid statuses a provider can set
    const validStatuses = ['provider_arrived', 'service_in_progress', 'completed'];

    if (!validStatuses.includes(new_status)) {
        return res.status(400).json({ success: false, message: 'Invalid status update' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Verify the booking belongs to this provider
        const checkResult = await pool.query(
            `SELECT status FROM bookings WHERE id = $1 AND provider_id = $2`,
            [bookingId, provider_id]
        );

        if (checkResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Unauthorized or booking not found' });
        }

        // 2. Update the status
        let updateQuery = `UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP`;
        let queryParams = [new_status, bookingId, provider_id];

        // If completing, we also save the medical/completion notes
        if (new_status === 'completed' && completion_notes) {
            updateQuery += `, instructions = CONCAT(instructions, '\nCompletion Notes: ', $4::text)`;
            queryParams.push(completion_notes);
        }

        updateQuery += ` WHERE id = $2 AND provider_id = $3 RETURNING id, status, updated_at`;

        const updateResult = await pool.query(updateQuery, queryParams);

        await pool.query('COMMIT');

        res.json({
            success: true,
            message: `Booking status successfully updated to: ${new_status}`,
            data: updateResult.rows[0]
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Status Update Error:', error);
        res.status(500).json({ success: false, message: 'Server error during status update' });
    }
});
module.exports = router;