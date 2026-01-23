// server.js - COMPATIBILIDAD TOTAL (Ligas + Profesor)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

// --- Middlewares ---
app.use(cors({ origin: 'https://ulisesxxxi31.github.io' }));
app.use(express.json());

// --- Conexión MongoDB Atlas (Optimizado para Vercel) ---
const uri = process.env.MONGODB_URI;
let cachedConnection = null;

async function connectDB() {
    if (cachedConnection) return cachedConnection;
    cachedConnection = await mongoose.connect(uri);
    return cachedConnection;
}

app.use(async (req, res, next) => {
    try { await connectDB(); next(); } 
    catch (err) { res.status(500).json({ error: "Error conexión BD" }); }
});

// --- Modelos ---
const User = require('../models/user');
const Progress = require('../models/progress');

// --- RUTAS ---

app.get('/', (req, res) => {
  res.send('API voKblo: Servidor funcionando 🚀');
});

// LOGIN (Mantiene las rachas del alumno)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    res.status(200).json({ 
        message: 'Éxito', 
        user: { 
            id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            stats: user.stats 
        } 
    });
  } catch (error) { res.status(500).json({ error: 'Error servidor' }); }
});

// PROGRESO (Rachas + Guardado para profesor)
app.post('/api/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;
        if (!user || !lessonName || !taskName) return res.status(400).json({ message: "Faltan datos" });

        // Actualizar Progress (Para el panel del profesor)
        await Progress.findOneAndUpdate(
            { user, lessonName, taskName },
            { $inc: { score: score || 0 }, $set: { completedAt: new Date(), ...(completed && { completed: true }) } },
            { new: true, upsert: true }
        );

        // Lógica de Rachas (Para el alumno)
        const alumno = await User.findById(user);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        let nuevaRacha = alumno.stats?.racha_actual || 0;
        const ultima = alumno.stats?.ultima_actividad;

        if (ultima) {
            const fechaUltima = new Date(ultima);
            fechaUltima.setHours(0, 0, 0, 0);
            const diff = Math.floor((hoy - fechaUltima) / (1000 * 60 * 60 * 24));
            if (diff === 1) nuevaRacha += 1;
            else if (diff > 1 && !alumno.stats.protector_activo) nuevaRacha = 1;
        } else { nuevaRacha = 1; }

        const updatedUser = await User.findByIdAndUpdate(user, {
            $set: { 'stats.racha_actual': nuevaRacha, 'stats.ultima_actividad': new Date() },
            $inc: { 'stats.puntos_semanales': score || 0, 'stats.puntos_totales': score || 0 }
        }, { new: true });

        res.status(200).json({ racha: nuevaRacha, stats: updatedUser.stats });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// RUTA CRÍTICA: Obtener usuarios (Formato exacto que espera teacher.js)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password');
    // VOLVEMOS AL FORMATO ORIGINAL: Enviamos un objeto con la llave "users"
    res.status(200).json({ users: users }); 
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

// PROGRESO AGRUPADO (Para teacher.js)
app.get('/api/progress/students', async (req, res) => {
  try {
    const studentProgress = await Progress.find().populate('user', 'name email');
    const grouped = studentProgress.reduce((acc, p) => {
      if (!p.user) return acc;
      if (!acc[p.user.name]) acc[p.user.name] = { name: p.user.name, email: p.user.email, tasks: [] };
      acc[p.user.name].tasks.push(p._doc);
      return acc;
    }, {});
    res.status(200).json(Object.values(grouped));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// LEADERBOARD (Ranking de la liga)
app.get('/api/leaderboard/:liga', async (req, res) => {
    try {
      const ranking = await User.find({ 'stats.liga_actual': req.params.liga, role: 'student' })
        .sort({ 'stats.puntos_semanales': -1 }).select('name stats').limit(30);
      res.status(200).json(ranking);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = app;
