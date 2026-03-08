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
/ --- CAMBIO: Quitamos '/api' para que coincida con el frontend ---
app.post('/users/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validar que los campos no estén vacíos
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
        name,
        email,
        password: hashedPassword,
        role: role || 'student',
        // Aseguramos que empiece con stats para evitar errores futuros
        stats: { points: 0, streak: 0 } 
    });
    
    await newUser.save();
    res.status(201).json({ message: 'Usuario registrado con éxito' });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
    }
   res.status(500).json({ message: 'Error en el servidor: ' + error.message });
  }
});
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

        // 1. Guardar el progreso en el historial
        const nuevoProgreso = new Progress({
            user: new mongoose.Types.ObjectId(user),
            lessonName,
            taskName,
            score: puntosAñadir,
            completed,
            completedAt: new Date()
        });
        await nuevoProgreso.save();

        // 2. ACTUALIZAR PUNTOS (Con validación de objeto stats)
        const usuarioActualizado = await User.findByIdAndUpdate(
            user,
            { $inc: { "stats.points": puntosAñadir } },
            { new: true, upsert: true }
        );

        // 3. RESPUESTA SEGURA (Aquí estaba el error)
        // Verificamos que stats y points existan antes de leerlos
        const totalXP = (usuarioActualizado.stats && usuarioActualizado.stats.points) 
                        ? usuarioActualizado.stats.points 
                        : puntosAñadir;

        res.status(201).json({ 
            status: "success", 
            puntosTotales: totalXP 
        });

    } catch (error) {
        console.error("Error en servidor:", error);
        res.status(500).json({ error: "Fallo en el servidor", detalle: error.message });
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
            .select('name stats.points') // taremos solo el nomnbre y los puntos
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
