const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- Modelos (Asegúrate de que los nombres de archivo coincidan exactamente) ---
const User = require('../models/user');
const Progress = require('../models/progress');

const app = express();

// --- Middlewares ---
app.use(cors({
    origin: 'https://ulisesxxxi31.github.io'
}));
app.use(express.json());

// --- Gestión de Conexión MongoDB (Optimizado para Vercel) ---
const uri = process.env.MONGODB_URI;
let cachedConnection = null;

async function connectToDatabase() {
    if (cachedConnection) return cachedConnection;
    if (!uri) throw new Error("La variable MONGODB_URI no está definida en Vercel");

    cachedConnection = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Conectado a MongoDB Atlas');
    return cachedConnection;
}

// Middleware para conectar a la BD en cada petición
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        res.status(500).json({ error: "Error de conexión a la base de datos" });
    }
});

// --- RUTAS ---

// 1. Leaderboard por Liga
app.get('/api/leaderboard/:liga', async (req, res) => {
  try {
    const { liga } = req.params;
    const ranking = await User.find({ 
      'stats.liga_actual': liga,
      role: 'student' 
    })
    .sort({ 'stats.puntos_semanales': -1 })
    .select('name stats')
    .limit(30);
    
    res.status(200).json(ranking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Confirmar Notificación de Ascenso
app.post('/api/users/confirmar-ascenso', async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, { 
      $set: { 'stats.notificacion_ascenso': false } 
    });
    res.status(200).json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Registro de Progreso (Lógica de Rachas y Puntos)
app.post('/api/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;

        if (!user || !lessonName || !taskName || score === undefined) {
            return res.status(400).json({ message: "Faltan datos." });
        }

        // A. Actualizar/Crear registro de progreso
        const filter = { user, lessonName, taskName };
        const updateData = { 
            $inc: { score: score }, 
            $set: { completedAt: new Date() } 
        };
        if (completed) updateData.$set.completed = true;

        const updatedProgress = await Progress.findOneAndUpdate(filter, updateData, { 
            new: true, upsert: true 
        });

        // B. Lógica de Rachas
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const alumno = await User.findById(user);
        if (!alumno) return res.status(404).json({ error: "Usuario no encontrado" });

        let nuevaRacha = alumno.stats?.racha_actual || 0;
        const ultimaActividad = alumno.stats?.ultima_actividad;

        if (ultimaActividad) {
            const fechaUltima = new Date(ultimaActividad);
            fechaUltima.setHours(0, 0, 0, 0);
            const diffMs = hoy - fechaUltima;
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDias === 1) {
                nuevaRacha += 1;
            } else if (diffDias > 1) {
                if (!alumno.stats.protector_activo) {
                    nuevaRacha = 1; 
                }
            }
        } else {
            nuevaRacha = 1;
        }

        // C. Guardar estadísticas en el Usuario
        await User.findByIdAndUpdate(user, {
            $set: { 
                'stats.racha_actual': nuevaRacha,
                'stats.ultima_actividad': new Date()
            },
            $inc: { 
                'stats.puntos_semanales': score, 
                'stats.puntos_totales': score 
            }
        });

        res.status(200).json({ 
            message: 'Éxito', 
            progress: updatedProgress,
            racha: nuevaRacha 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Login con estadísticas
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    res.status(200).json({ 
        user: { 
            id: user._id, 
            name: user.name, 
            role: user.role,
            stats: user.stats 
        } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// 5. Historial de progreso por usuario
app.get('/api/progress/:userId', async (req, res) => {
    try {
      const progressHistory = await Progress.find({ user: req.params.userId }).sort({ completedAt: 1 });
      res.status(200).json({ progress: progressHistory });
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener historial' });
    }
});

// 6. Ruta para el Administrador (Lógica que antes estaba en cronJobs)
// En Vercel, ejecutaremos esta ruta mediante un Vercel Cron
app.get('/api/admin/update-leagues', async (req, res) => {
    // Aquí pondrías el código que tienes en cronJobs.js para 
    // subir/bajar alumnos de liga y resetear puntos_semanales
    try {
        // Ejemplo rápido: Reset de puntos semanales
        await User.updateMany({}, { $set: { 'stats.puntos_semanales': 0 } });
        res.status(200).json({ message: "Ligas actualizadas correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Exportar para Vercel ---
module.exports = app;
