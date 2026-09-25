const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Connects to your Neon PostgreSQL database

const router = express.Router();

// --- REGISTER A NEW USER ---
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 1. Check if the email is already registered
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // 2. Encrypt the password using bcrypt (Salt & Hash)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Save the new user to the Neon database
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
      [name, email, hashedPassword, role || 'customer'] // Defaults to customer if no role is provided
    );

    res.status(201).json({ 
      success: true, 
      message: "User registered successfully", 
      data: newUser.rows[0] 
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ success: false, message: "Server Error during registration" });
  }
});

// --- LOGIN EXISITING USER ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 1. Find the user in the database
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    
    const user = userResult.rows[0];

    // 2. Compare the typed password with the encrypted password in the database
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // 3. Generate the JSON Web Token (The digital keycard)
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' } // Token expires in 7 days, forcing them to log in again
    );

    res.json({ 
      success: true, 
      message: "Login successful", 
      token: token, 
      user: { 
        id: user.id, 
        name: user.name, 
        role: user.role 
      } 
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ success: false, message: "Server Error during login" });
  }
});

module.exports = router;