// server.js - CORRECCIÓN RUTA PROGRESO INDIVIDUAL
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongoose').Types;
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
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password');
    res.status(200).json({ users: users }); 
  } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// 2. RUTA QUE ESTÁ FALLANDO: Progreso de un alumno específico
app.get('/progress/:userId', async (req, res) => {
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


app.post('/progress', async (req, res) => {
    try {
        const { user, score, lessonName, taskName, completed } = req.body;
        const puntosAñadir = parseInt(score) || 0;

        // 1. Guardamos el historial del examen
        const nuevoProgreso = new Progress({
            user: new mongoose.Types.ObjectId(user),
            lessonName,
            taskName,
            score: puntosAñadir,
            completed,
            completedAt: new Date()
        });
        await nuevoProgreso.save();

        // 2. ACTUALIZAMOS EL RANKING (Aquí estaba el fallo)
        // Usamos { upsert: true } para que si el alumno no tiene el objeto 'stats', lo cree de cero
        const usuarioActualizado = await User.findByIdAndUpdate(
            user,
            { $inc: { "stats.points": puntosAñadir } }, // Suma los puntos al total
            { new: true, upsert: true } 
        );

        res.status(201).json({ message: "Puntos guardados", total: usuarioActualizado.stats.points });
    } catch (error) {
        console.error("Error crítico:", error);
        res.status(500).json({ error: "Error interno al sumar puntos" });
    }
});

// 3. Login, Leaderboard y demás (Mantener como estaban antes)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ user: { id: user._id, name: user.name, role: user.role, stats: user.stats } });
    } else { res.status(401).json({ message: 'Credenciales inválidas' }); }
  } catch (error) { res.status(500).json({ error: 'Error' }); }
});

// RUTA: Obtener el Leaderboard (Clasificación)
app.get('/leaderboard', async (req, res) => {
    try {
        // Buscamos a los alumnos, ordenados por sus puntos (de mayor a menor)
        // Limitamos a los 10 mejores
        const topStudents = await User.find({ role: 'student' })
            .select('name stats.points') // Solo traemos nombre y puntos
            .sort({ 'stats.points': -1 })
            .limit(10);

        res.status(200).json({ leaderboard: topStudents });
    } catch (error) {
        console.error("Error al obtener clasificación:", error);
        res.status(500).json({ error: "Error al obtener la clasificación" });
    }
});

app.get('/', (req, res) => {
    res.send('API de voKblo funcionando correctamente 🚀');
});
module.exports = app;
