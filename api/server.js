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
// Necesitamos importar los tipos de Mongoose al principio de server.js
const { ObjectId } = require('mongoose').Types;

app.post('/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;

        // 1. VALIDACIÓN: Verificar si el ID es válido
        if (!mongoose.Types.ObjectId.isValid(user)) {
            return res.status(400).json({ error: "ID de usuario no válido" });
        }

        const puntosAñadir = parseInt(score) || 0;

        // 2. GUARDAR HISTORIAL
        const newProgress = new Progress({
            user: new ObjectId(user), // Convertimos a ObjectId real
            lessonName,
            taskName,
            score: puntosAñadir,
            completed: !!completed, // Forzamos booleano
            completedAt: new Date()
        });
        await newProgress.save();

        // 3. ACTUALIZAR PUNTOS DEL USUARIO
        // Usamos un método más directo para evitar errores de esquema
        const usuarioActualizado = await User.findOneAndUpdate(
            { _id: new ObjectId(user) },
            { $inc: { "stats.points": puntosAñadir } },
            { new: true, runValidators: false } // Desactivamos validadores por si el esquema es estricto
        );

        if (!usuarioActualizado) {
            return res.status(404).json({ error: "Usuario no encontrado en la DB" });
        }

        res.status(201).json({ 
            message: "¡Puntos guardados!",
            puntosTotales: usuarioActualizado.stats ? usuarioActualizado.stats.points : puntosAñadir 
        });

    } catch (error) {
        // --- ESTO NOS DIRÁ EL ERROR REAL EN LA RESPUESTA ---
        console.error("DETALLE DEL ERROR:", error);
        res.status(500).json({ 
            error: "Error interno al guardar", 
            detalle: error.message 
        });
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
module.exports = app;
