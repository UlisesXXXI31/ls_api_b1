const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- 1. Modelos ---
// Importante: Verifica que en tu carpeta 'models' los archivos se llamen exactamente user.js y progress.js
const User = require('../models/user');
const Progress = require('../models/progress');

const app = express();

// --- 2. Middlewares ---
app.use(cors({ origin: 'https://ulisesxxxi31.github.io' }));
app.use(express.json());

// --- 3. Conexión a MongoDB (Optimizada para Vercel) ---
const uri = process.env.MONGODB_URI;
let cachedConnection = null;

async function connectToDatabase() {
    if (cachedConnection) return cachedConnection;
    if (!uri) throw new Error("Falta la variable MONGODB_URI en Vercel");
    cachedConnection = await mongoose.connect(uri);
    return cachedConnection;
}

// Conectar antes de procesar cualquier ruta
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        res.status(500).send("Error de conexión a la base de datos");
    }
});

// --- 4. RUTAS ---

// A. RUTA RAÍZ (Para evitar el "Cannot GET /")
app.get('/', (req, res) => {
    res.status(200).send("API de Ligas funcionando correctamente 🚀");
});

// B. Leaderboard
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

// C. Progreso y Rachas
app.post('/api/progress', async (req, res) => {
    try {
        const { user, score, completed, lessonName, taskName } = req.body;
        
        // Lógica de racha y puntos (la que ya tenías)
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const alumno = await User.findById(user);
        let nuevaRacha = alumno.stats?.racha_actual || 0;
        
        if (alumno.stats?.ultima_actividad) {
            const ultimaActividad = new Date(alumno.stats.ultima_actividad);
            ultimaActividad.setHours(0, 0, 0, 0);
            const diffDias = Math.floor((hoy - ultimaActividad) / (1000 * 60 * 60 * 24));

            if (diffDias === 1) nuevaRacha += 1;
            else if (diffDias > 1 && !alumno.stats.protector_activo) nuevaRacha = 1;
        } else {
            nuevaRacha = 1;
        }

        await User.findByIdAndUpdate(user, {
            $set: { 'stats.racha_actual': nuevaRacha, 'stats.ultima_actividad': hoy },
            $inc: { 'stats.puntos_semanales': score, 'stats.puntos_totales': score }
        });

        res.status(200).json({ message: "Progreso guardado", racha: nuevaRacha });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// D. RUTA PARA EL CRON (Ligas y Reset Semanal)
// Esta ruta debe coincidir con el path de tu vercel.json
app.get('/api/cron/reset-ligas', async (req, res) => {
    try {
        // Ejemplo de lógica: Resetear puntos semanales de todos
        // Aquí puedes añadir tu lógica de ascensos/descensos
        await User.updateMany({}, { $set: { 'stats.puntos_semanales': 0 } });
        
        res.status(200).json({ message: "Ligas actualizadas y puntos reseteados" });
    } catch (error) {
        res.status(500).json({ error: "Error en el Cron" });
    }
});

// E. Login (Simplificado para el ejemplo)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ user });
    } else {
        res.status(401).json({ message: "Error" });
    }
});

// --- 5. Exportar ---
module.exports = app;
