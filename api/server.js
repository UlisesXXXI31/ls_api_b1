// VERSIÓN UNIFICADA: Ligas + Rachas + Panel Profesor
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

// --- Middlewares ---
app.use(cors({
  origin: 'https://ulisesxxxi31.github.io'
}));
app.use(express.json());

// --- Conexión a la Base de Datos (Optimización Vercel) ---
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

// --- Modelos ---
const User = require('../models/user');
const Progress = require('../models/progress');

// --- RUTAS DE LA API ---

app.get('/', (req, res) => {
  res.send('API voKblo: Ligas, Rachas y Panel Profesor activos 🚀');
});

// 1. LOGIN (Corregido para enviar estadísticas)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Credenciales inválidas' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Credenciales inválidas' });

    // ENVIAMOS EL OBJETO COMPLETO (Incluyendo stats para que el alumno vea su racha)
    res.status(200).json({ 
        message: 'Inicio de sesión exitoso', 
        user: { 
            id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            stats: user.stats // <-- MUY IMPORTANTE
        } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// 2. PROGRESO (Híbrido: Guarda detalle para profesor y racha para alumno)
app.post('/api/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;

        if (!user || !lessonName || !taskName || score === undefined) {
            return res.status(400).json({ message: "Faltan datos" });
        }

        // A. Actualizar/Crear registro en Progress (Para el profesor)
        const filter = { user, lessonName, taskName };
        const updateData = { $inc: { score: score }, $set: { completedAt: new Date() } };
        if (completed) updateData.$set.completed = true;

        await Progress.findOneAndUpdate(filter, updateData, { new: true, upsert: true });

        // B. Lógica de Rachas y Puntos en el Alumno
        const alumno = await User.findById(user);
        if (!alumno) return res.status(404).json({ error: "No existe el usuario" });

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        let nuevaRacha = alumno.stats?.racha_actual || 0;
        const ultimaActividad = alumno.stats?.ultima_actividad;

        if (ultimaActividad) {
            const fechaUltima = new Date(ultimaActividad);
            fechaUltima.setHours(0, 0, 0, 0);
            const diffDias = Math.floor((hoy - fechaUltima) / (1000 * 60 * 60 * 24));

            if (diffDias === 1) nuevaRacha += 1;
            else if (diffDias > 1 && !alumno.stats.protector_activo) nuevaRacha = 1;
        } else {
            nuevaRacha = 1;
        }

        // C. Guardar estadísticas en Usuario
        const updatedUser = await User.findByIdAndUpdate(user, {
            $set: { 'stats.racha_actual': nuevaRacha, 'stats.ultima_actividad': new Date() },
            $inc: { 'stats.puntos_semanales': score, 'stats.puntos_totales': score }
        }, { new: true });

        res.status(200).json({ 
            message: 'Ok', 
            racha: nuevaRacha,
            stats: updatedUser.stats 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. PANEL PROFESOR: Obtener lista de alumnos (Corregido el formato)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password');
    // Enviamos el array directo para que el frontend no de error
    res.status(200).json(users); 
  } catch (error) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// 4. PANEL PROFESOR: Progreso agrupado
app.get('/api/progress/students', async (req, res) => {
  try {
    const studentProgress = await Progress.find().populate('user', 'name email');
    const groupedProgress = studentProgress.reduce((acc, progress) => {
      const { user, ...rest } = progress._doc;
      if (!user) return acc;
      if (!acc[user.name]) {
        acc[user.name] = { name: user.name, email: user.email, tasks: [] };
      }
      acc[user.name].tasks.push(rest);
      return acc;
    }, {});
    res.status(200).json(Object.values(groupedProgress));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. CLASIFICACIÓN / LEADERBOARD (Para la copa de liga)
app.get('/api/leaderboard/:liga', async (req, res) => {
    try {
      const { liga } = req.params;
      const ranking = await User.find({ 'stats.liga_actual': liga, role: 'student' })
        .sort({ 'stats.puntos_semanales': -1 })
        .select('name stats')
        .limit(30);
      res.status(200).json(ranking);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// 6. HISTORIAL INDIVIDUAL (Para "Ver historial")
app.get('/api/progress/:userId', async (req, res) => {
  try {
    const progressHistory = await Progress.find({ user: req.params.userId }).sort({ completedAt: 1 });
    res.status(200).json({ progress: progressHistory });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial' });
  }
});

// 7. CONFIRMAR ASCENSO (Quitar notificación)
app.post('/api/users/confirmar-ascenso', async (req, res) => {
    try {
      await User.findByIdAndUpdate(req.body.userId, { $set: { 'stats.notificacion_ascenso': false } });
      res.status(200).json({ message: 'Ok' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = app;
