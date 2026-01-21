// --- 1. Imports ---
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- 2. Creación de la App ---
const app = express();

// --- 3. Middlewares ---
app.use(cors({
    origin: 'https://ulisesxxxi31.github.io'
}));
app.use(express.json());

// --- 4. Conexión a la Base de Datos ---
const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
  .then(() => {
    console.log('✅ Conexión exitosa a MongoDB Atlas');
    // IMPORTANTE: El cron se activa solo cuando la BD está lista
    require('./cronJobs'); 
    console.log('⏰ Automatización de Ligas (Cron Jobs) activada');
  })
  .catch(err => console.error('❌ Error de conexión a MongoDB Atlas:', err));

// --- 5. Importación de Modelos ---
const User = require('../models/user');
const Progress = require('../models/progress');

// --- 6. Rutas de Gamificación (Ligas y Notificaciones) ---

// Obtener el Ranking de una liga específica
app.get('/api/leaderboard/:liga', async (req, res) => {
  try {
    const { liga } = req.params;
    const ranking = await User.find({ 
      'stats.liga_actual': liga,
      role: 'student' 
    })
    .sort({ 'stats.puntos_semanales': -1 }) // De mayor a menor puntuación
    .select('name stats') // Traemos solo nombre y estadísticas
    .limit(30);
    
    res.status(200).json(ranking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpiar la bandera de notificación cuando el alumno ve su ascenso
app.post('/api/users/confirmar-ascenso', async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, { 
      $set: { 'stats.notificacion_ascenso': false } 
    });
    res.status(200).json({ message: 'Notificación de ascenso marcada como leída' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 7. Rutas de Progreso (EL MOTOR DE LA APP) ---

app.post('/api/progress', async (req, res) => {
    try {
        const { user, lessonName, taskName, score, completed } = req.body;

        if (!user || !lessonName || !taskName || score === undefined) {
            return res.status(400).json({ message: "Faltan datos para guardar el progreso." });
        }

        // A. Actualizar/Crear registro en la colección de progreso detallado
        const filter = { user, lessonName, taskName };
        const updateData = { 
            $inc: { score: score }, 
            $set: { completedAt: new Date() } 
        };
        if (completed) updateData.$set.completed = true;

        const updatedProgress = await Progress.findOneAndUpdate(
            filter, updateData, { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // B. Lógica de Rachas y Puntos en el documento del Usuario
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); // Normalizamos a medianoche para comparar días

        const alumno = await User.findById(user);
        let nuevaRacha = alumno.stats?.racha_actual || 0;
        const ultimaActividad = alumno.stats?.ultima_actividad;

        if (ultimaActividad) {
            const fechaUltima = new Date(ultimaActividad);
            fechaUltima.setHours(0, 0, 0, 0);
            const diffMs = hoy - fechaUltima;
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDias === 1) {
                // Completó ayer, la racha sube
                nuevaRacha += 1;
            } else if (diffDias > 1) {
                // Pasó más de un día sin actividad
                if (!alumno.stats.protector_activo) {
                    nuevaRacha = 1; // Racha rota, empieza de nuevo
                }
                // Si el protector está activo, nuevaRacha se mantiene igual
            }
            // Si diffDias es 0, ya hizo algo hoy, no sumamos pero mantenemos racha
        } else {
            nuevaRacha = 1; // Es su primera actividad histórica
        }

        // C. Guardar estadísticas actualizadas en el Usuario
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
            message: 'Progreso y estadísticas actualizadas', 
            progress: updatedProgress,
            racha: nuevaRacha 
        });

    } catch (error) {
        console.error("Error en /api/progress:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- 8. Rutas de Gestión y Auth (Mantener Originales) ---

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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    // Devolvemos el usuario con sus estadísticas para el frontend
    res.status(200).json({ 
        message: 'Inicio de sesión exitoso', 
        user: { 
            id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            stats: user.stats // <--- MUY IMPORTANTE PARA LA UI
        } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/progress/:userId', async (req, res) => {
  try {
    const progressHistory = await Progress.find({ user: req.params.userId }).sort({ completedAt: 1 });
    res.status(200).json({ progress: progressHistory });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener historial' });
  }
});

// Ruta Seed (Uso exclusivo desarrollo)
app.get('/api/seed', async (req, res) => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);
        const testUser = new User({
            name: 'Profesor de Prueba',
            email: `prof.${Date.now()}@seed.com`,
            password: hashedPassword,
            role: 'teacher'
        });
        await testUser.save();
        res.status(200).json({ message: 'Datos de prueba creados.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 9. Exportación ---
module.exports = app;






