const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    author: {
        type: String,
        required: true
    },
    authorEmail: {
        type: String,
        required: true
    },
    files: [{
        name: String,
        type: String,
        url: String,
        path: String
    }],
    date: {
        type: Date,
        default: Date.now
    }
});

// Índice para búsqueda
documentSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Document', documentSchema);
