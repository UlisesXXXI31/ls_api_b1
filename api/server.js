const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

// --- CONFIGURACIÓN ---
app.use(cors({ origin: 'https://ulisesxxxi31.github.io' }));
app.use(express.json());

const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
  .then(() => console.log('✅ Conexión exitosa a MongoDB Atlas'))
  .catch(err => console.error('❌ Error de conexión:', err));

const User = require('../models/user');
const Progress = require('../models/progress');

// --- RUTAS PÚBLICAS ---
app.get('/', (req, res) => {
  res.send('🚀 API de voKblo B1 funcionando correctamente');
});

// --- AUTENTICACIÓN Y REGISTRO ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Credenciales inválidas' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Credenciales inválidas' });

    res.status(200).json({ 
        user: { id: user._id, name: user.name, email: user.email, role: user.role, stats: user.stats } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el login' });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
        name, email, password: hashedPassword, role,
        stats: { points: 0, streak: 0 } // Inicialización para el Ranking
    });
    
    await newUser.save();
    res.status(201).json({ message: 'Usuario registrado con éxito' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Email ya existe' });
    res.status(500).json({ error: error.message });
  }
});

// --- GESTIÓN DE PUNTOS Y PROGRESO (RANKING + HISTORIAL) ---
app.post('/api/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;
        const puntosAñadir = parseInt(score) || 0;

        // 1. Guardar/Actualizar en el historial (Progress)
        await Progress.findOneAndUpdate(
            { user, lessonName, taskName },
            { $inc: { score: puntosAñadir }, $set: { completed: !!completed, completedAt: new Date() } },
            { upsert: true, new: true }
        );

        // 2. ACTUALIZAR EL TOTAL DEL USUARIO (Para que el Ranking NO sea 0)
        const userActualizado = await User.findByIdAndUpdate(
            user,
            { $inc: { "stats.points": puntosAñadir } },
            { new: true }
        );

        res.status(201).json({ 
            message: "¡Puntos y ranking actualizados!", 
            totalXP: userActualizado.stats.points 
        });
    } catch (error) {
        console.error("Error al guardar progreso:", error);
        res.status(500).json({ error: "Error interno al guardar" });
    }
});

// --- PANEL DEL PROFESOR (RUTAS A2 INTEGRADAS) ---

// Obtener todos los alumnos
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password').sort({ name: 1 });
    res.status(200).json({ users });
  } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// Historial detallado de un alumno
app.get('/api/progress/:userId', async (req, res) => {
  try {
    const progressHistory = await Progress.find({ user: req.params.userId }).sort({ completedAt: -1 });
    res.status(200).json({ progress: progressHistory });
  } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// Leaderboard para el Ranking
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topStudents = await User.find({ role: 'student' })
            .select('name stats.points')
            .sort({ 'stats.points': -1 })
            .limit(10);
        res.status(200).json({ leaderboard: topStudents });
    } catch (error) { res.status(500).json({ error: "Error en ranking" }); }
});

module.exports = app;
