// backend/models/progress.js (VERSIÓN ESTÁNDAR)

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const progressSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lessonName: { // <-- 'n' minúscula
    type: String,
    required: true
  },
  taskName: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
});

// Usa el patrón singleton para evitar errores en Vercel
module.exports = mongoose.models.Progress || mongoose.model('Progress', progressSchema);