// VERSIÓN CORREGIDA DE api/server.js

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
  .then(() => console.log('Conexión exitosa a MongoDB Atlas'))
  .catch(err => console.error('Error de conexión a MongoDB Atlas:', err));

// --- 5. Importación de Modelos ---
const User = require('../models/user');
const Progress = require('../models/progress');

// --- 6. Rutas de la API ---
app.get('/', (req, res) => {
  res.send('¡Hola, mundo desde el servidor!');
});

// REEMPLAZA TU RUTA /api/seed CON ESTA VERSIÓN CORREGIDA

app.get('/api/seed', async (req, res) => {
    try {
        console.log("Iniciando la creación de datos de prueba (seed)...");

        // 1. Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        // 2. Crear un usuario de prueba (profesor)
        const testUser = new User({
            name: 'Profesor de Prueba',
            email: 'prof.prueba@seed.com', // Un email único para evitar errores
            password: hashedPassword,
            role: 'teacher'
        });
        await testUser.save();
        console.log("Usuario de prueba creado con éxito.");

        // 3. (Opcional) Crear un registro de progreso para ese usuario
        const testProgress = new Progress({
            user: testUser._id,
            lessonName: 'Lección de Prueba',
            taskName: 'Prueba iniciual A1',
            score: 100,
            completed: true
        });
        await testProgress.save();
        console.log("Progreso de prueba creado con éxito.");

        res.status(200).json({ message: 'Datos de prueba creados con éxito. Ya puedes hacer login.' });

    } catch (error) {
        // Este error aparecerá en los logs de Vercel si algo falla
        console.error("Error al crear datos de prueba:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // 1. Hashear la contraseña antes de guardarla
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 2. Crear el nuevo usuario con la contraseña hasheada
        const newUser = new User({
            name,
            email,
            password: hashedPassword, // ¡Importante! Usar la contraseña encriptada
            role
        });
        
        // 3. Guardar el usuario en la base de datos
        await newUser.save();
        
        res.status(201).json({ message: 'Usuario registrado con éxito' });

    } catch (error) {
        // Manejo de error para email duplicado (muy útil)
        if (error.code === 11000) {
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }
        // Para otros errores
        res.status(500).json({ error: error.message });
    }
});

// REEMPLAZA TU RUTA DE PROGRESO CON ESTA VERSIÓN ROBUSTA

app.post('/api/progress', async (req, res) => {
    console.log("--- Petición POST a /api/progress recibida ---");
    
    try {
        const { user, lessonName, taskName, score, completed } = req.body;
        console.log("Datos recibidos:", { user, lessonName, taskName, score, completed });

        if (!user || !lessonName || !taskName || score === undefined) {
            console.log("Validación fallida: Faltan datos.");
            return res.status(400).json({ message: "Faltan datos para guardar el progreso." });
        }

        const filter = { user, lessonName, taskName };
        const updateData = { $inc: { score: score }, $set: { completedAt: new Date() } };
        if (completed) {
            updateData.$set.completed = true;
        }

        console.log("Intentando findOneAndUpdate con el filtro:", filter);
        console.log("Y los datos de actualización:", updateData);

        const updatedProgress = await Progress.findOneAndUpdate(
            filter,
            updateData,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // --- ¡VERIFICACIÓN CRUCIAL! ---
        if (updatedProgress) {
            console.log("¡Éxito! Documento guardado/actualizado:", updatedProgress);
            res.status(200).json({ message: 'Progreso guardado/actualizado con éxito', progress: updatedProgress });
        } else {
            // Esto solo ocurriría si 'upsert: true' fallara, lo cual es muy raro.
            console.error("ERROR: findOneAndUpdate no devolvió un documento.");
            throw new Error("No se pudo guardar el progreso en la base de datos.");
        }
        // ---------------------------------

    } catch (error) {
        console.error("### ERROR CATASTRÓFICO EN LA RUTA /api/progress:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/progress/students', async (req, res) => {
  try {
    const studentProgress = await Progress.find().populate('user', 'name email');
    const groupedProgress = studentProgress.reduce((acc, progress) => {
      const { user, ...rest } = progress._doc;
      if (!acc[user.name]) {
        acc[user.name] = {
          name: user.name,
          email: user.email,
          tasks: []
        };
      }
      acc[user.name].tasks.push(rest);
      return acc;
    }, {});
    res.status(200).json(Object.values(groupedProgress));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta de autenticación (login)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    if (user.role !== 'teacher' && user.role !== 'student') {
      return res.status(403).json({ message: 'Acceso denegado' });
    }
    res.status(200).json({ message: 'Inicio de sesión exitoso', user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor. Inténtalo de nuevo.' });
  }
});

app.get('/api/users/by-email', async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.status(200).json({ 
      message: 'Usuario encontrado',
      user: { id: user._id, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor. Inténtalo de nuevo.' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password');
    if (!users) {
      return res.status(404).json({ message: 'No hay usuarios registrados.' });
    }
    res.status(200).json({ users: users });
  } catch (error) {
    console.error('Error al obtener los usuarios:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// En backend/api/server.js

app.get('/api/progress/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // --- ¡CORRECCIÓN AQUÍ! ---
    // Buscamos en el campo 'user' y ordenamos por 'completedAt'.
    const progressHistory = await Progress.find({ user: userId }).sort({ completedAt: 1 });

    if (!progressHistory || progressHistory.length === 0) {
      return res.status(404).json({ message: 'No se encontró historial de progreso para este usuario.' });
    }
    
    res.status(200).json({ progress: progressHistory });

  } catch (error) {
    console.error('Error al obtener el progreso del usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});


// --- 7. Export de la App ---
module.exports = app;











