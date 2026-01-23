// server.js - CORRECCIÓN RUTA PROGRESO INDIVIDUAL
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors({ origin: 'https://ulisesxxxi31.github.io' }));
app.use(express.json());

const uri = process.env.MONGODB_URI;
let cachedConnection = null;

async function connectDB() {
    if (cachedConnection) return cachedConnection;
    cachedConnection = await mongoose.connect(uri);
    return cachedConnection;
}

app.use(async (req, res, next) => {
    try { await connectDB(); next(); } 
    catch (err) { res.status(500).json({ error: "Error BD" }); }
});

const User = require('../models/user');
const Progress = require('../models/progress');

// --- RUTAS ---

// 1. Obtener todos los alumnos (formato para teacher.js)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password');
    res.status(200).json({ users: users }); 
  } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// 2. RUTA QUE ESTÁ FALLANDO: Progreso de un alumno específico
app.get('/api/progress/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // Buscamos todo el progreso de ese ID
        const progressHistory = await Progress.find({ user: userId }).sort({ completedAt: -1 });
        
        // Enviamos el objeto con la llave "progress" que espera teacher.js
        res.status(200).json({ progress: progressHistory });
    } catch (error) {
        res.status(500).json({ error: "Error al obtener historial" });
    }
});

// 3. Login, Leaderboard y demás (Mantener como estaban antes)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ user: { id: user._id, name: user.name, role: user.role, stats: user.stats } });
    } else { res.status(401).json({ message: 'Credenciales inválidas' }); }
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

module.exports = app;
