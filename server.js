const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const app = express();
app.use(cors()); 
app.use(express.json()); 

// --- IMPORT ROUTES ---
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const providerRoutes = require('./routes/provider');
const bookingRoutes = require('./routes/booking'); // ADD THIS

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/bookings', bookingRoutes); // ADD THIS

// --- TEST ROUTE ---
app.get('/api/health', (req, res) => {
    res.json({ message: "Med At Home Local Server is running perfectly!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});