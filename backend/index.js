// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '903625348841-bmkhrd53eok4bgo2j4pfhrijck43pgdb.apps.googleusercontent.com';
const MONGODB_URI = process.env.MONGODB_URI || '';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(bodyParser.json());

app.use(cors({ 
    origin: [
        'http://localhost:5000',
        'https://devhtt.github.io',
        'https://ucv-backend-2ohp.onrender.com',
        'https://srv-d42n9915pdvs73d802p0.onrender.com'
    ], 
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

(async () => {
  try {
    if (!MONGODB_URI) {
      console.warn('MONGODB_URI no definido. Conexión a MongoDB no intentada.');
      return;
    }
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Conectado a MongoDB');
  } catch (err) {
    console.error('Error conectando a MongoDB:', err);
  }
})();

const userSchema = new mongoose.Schema({
  id: String,
  email: { type: String, required: true, unique: true },
  name: String,
  picture: String,
  registeredWith: String,
  createdAt: Number
}, { timestamps: true });

const reviewSchema = new mongoose.Schema({
  text: String,
  rating: Number,
  date: { type: Date, default: Date.now },
  user: {
    name: String,
    email: String,
    picture: String
  }
}, { timestamps: true });

const documentSchema = new mongoose.Schema({
  content: String,
  date: { type: Date, default: Date.now },
  author: String,
  authorEmail: String,
  authorPic: String,
  files: [{
    name: { type: String },
    mime: { type: String },
    url: { type: String },
    path: { type: String }
  }]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Review = mongoose.model('Review', reviewSchema);
const Document = mongoose.model('Document', documentSchema);

async function upsertUser(userObj) {
  if (!userObj || !userObj.email) return null;
  return await User.findOneAndUpdate({ email: userObj.email }, userObj, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
}

// LOGIN
app.post('/api/session_login', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ ok: false, error: 'Missing id_token' });
  try {
    const ticket = await client.verifyIdToken({ idToken: id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      registeredWith: 'google',
      createdAt: Date.now()
    };
    await upsertUser(user);
    return res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }
});

app.post('/api/logout', (req, res) => {
  res.json({ ok: true });
});

// REVIEWS
app.get('/api/reviews', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.max(1, parseInt(req.query.limit || '10'));
    const skip = (page - 1) * limit;
    const total = await Review.countDocuments().exec();
    const items = await Review.find().sort({ date: -1 }).skip(skip).limit(limit).lean().exec();
    res.json({ ok: true, reviews: items, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { text, rating, user } = req.body;
    if (!text || !rating || !user || !user.email) return res.status(400).json({ ok: false, error: 'invalid' });

    const exists = await Review.findOne({ 'user.email': user.email }).exec();
    if (exists) return res.status(409).json({ ok: false, error: 'user_has_review' });

    const review = new Review({
      text,
      rating: Number(rating),
      user: {
        name: user.name,
        email: user.email,
        picture: user.picture
      }
    });

    await review.save();
    await upsertUser({ email: user.email, name: user.name, picture: user.picture, registeredWith: 'google', createdAt: Date.now() });
    res.json({ ok: true, review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

app.get('/api/users/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const u = await User.findOne({ email }).lean().exec();
    if (!u) return res.status(404).json({ ok: false });
    res.json({ ok: true, user: u });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

// DOCUMENTS
app.get('/api/documents', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.max(1, parseInt(req.query.limit || '10'));
    const skip = (page - 1) * limit;
    
    const [total, items] = await Promise.all([
      Document.countDocuments(),
      Document.find().sort({ date: -1 }).skip(skip).limit(limit).lean()
    ]);

    res.json({ ok: true, documents: items, total });
  } catch (err) {
    console.error('Error cargando documentos:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar documentos' });
  }
});

// Configuración de multer y uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Servir archivos estáticos con cache-control y permitir CORS para medios
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(uploadDir, {
  maxAge: '1h',
  etag: true
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// REEMPLAZO: único handler robusto para /api/documents/upload
// (sustituir cualquier otro handler /api/documents/upload anterior)
app.post('/api/documents/upload', upload.array('files', 8), async (req, res) => {
  try {
    const postId = req.body.postId;
    if (!postId || !req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Faltan archivos o postId' });
    }

    const doc = await Document.findById(postId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    // Construir base URL desde env o desde la petición (protocol + host)
    const baseUrl = (process.env.BASE_URL && process.env.BASE_URL.length > 0)
      ? process.env.BASE_URL.replace(/\/$/, '')
      : `${req.protocol}://${req.get('host')}`;

    const files = req.files.map(f => ({
      name: f.originalname,
      // guardar ambas claves para compatibilidad: mime y type
      mime: f.mimetype,
      type: f.mimetype,
      url: `${baseUrl}/uploads/${f.filename}`,
      path: f.path ? f.path.replace(/^\/+/, '') : `uploads/${f.filename}`
    }));

    doc.files = (doc.files || []).concat(files);
    await doc.save();

    // devolver las URLs absolutas al frontend
    res.json({ ok: true, files });
  } catch (err) {
    console.error('Error subiendo archivos:', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al subir archivos' });
  }
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  const payload = { ok: false, error: err && err.message ? err.message : 'server_error' };
  if (process.env.NODE_ENV !== 'production' && err && err.stack) payload.stack = err.stack;
  if (res.headersSent) return next(err);
  res.status(status).json(payload);
});

// CREATE DOCUMENT
app.post('/api/documents', upload.none(), async (req, res) => {
  try {
    const content = (req.body.content || '').toString();
    const author = req.body.author || req.body.authorName || 'Usuario';
    const authorEmail = req.body.authorEmail || req.body.email;

    if (!authorEmail) return res.status(400).json({ ok: false, error: 'Faltan datos requeridos: authorEmail' });

    let user = await User.findOne({ email: authorEmail }).lean().exec();
    if (!user) {
      await upsertUser({
        email: authorEmail,
        name: author || '',
        picture: req.body.authorPic || '',
        registeredWith: req.body.registeredWith || 'unknown',
        createdAt: Date.now()
      });
      user = await User.findOne({ email: authorEmail }).lean().exec();
    }

    const doc = new Document({
      content,
      author,
      authorEmail,
      authorPic: req.body.authorPic || (user && user.picture) || '',
      files: []
    });

    await doc.save();
    return res.json({ ok: true, document: doc, postId: doc._id });
  } catch (err) {
    console.error('Error creando documento:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error al crear documento' });
  }
});

// UPLOAD FILES
app.post('/api/documents/upload', upload.array('files', 8), async (req, res) => {
  try {
    const postId = req.body.postId;
    if (!postId || !req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: 'Faltan archivos o postId' });
    }

    const doc = await Document.findById(postId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

    // Force HTTPS in URLs to evitar mixed content
    const baseUrl = process.env.BASE_URL
      ? process.env.BASE_URL.replace(/\/$/, '')
      : `https://${req.get('host')}`;

    const files = req.files.map(f => ({
      name: f.originalname,
      mime: f.mimetype,
      url: `${baseUrl}/uploads/${f.filename}`,
      path: f.path
    }));

    doc.files = (doc.files || []).concat(files);
    await doc.save();

    res.json({ ok: true, files });
  } catch (err) {
    console.error('Error subiendo archivos:', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al subir archivos' });
  }
});

// SEARCH DOCUMENTS
app.get('/api/documents/search', async (req, res) => {
  try {
    const { q } = req.query;
    const query = q ? { $or: [{ content: { $regex: q, $options: 'i' } }, { author: { $regex: q, $options: 'i' } }] } : {};
    const documents = await Document.find(query).sort({ date: -1 }).limit(20).lean();
    res.json({ ok: true, documents });
  } catch (err) {
    console.error('Error buscando documentos:', err);
    res.status(500).json({ ok: false, error: 'Error en búsqueda' });
  }
});

// DELETE /api/documents/:id - borrar documento (validar autor)
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const authorEmail = req.query.authorEmail;
    
    if (!docId || !authorEmail) {
      return res.status(400).json({ ok: false, error: 'Faltan datos requeridos' });
    }

    const doc = await Document.findById(docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    // Validar que el solicitante sea el autor
    if (doc.authorEmail !== authorEmail) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    await Document.findByIdAndDelete(docId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando documento:', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al borrar documento' });
  }
});

// PUT /api/documents/:id - editar documento (validar autor)
app.put('/api/documents/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const { content, authorEmail } = req.body;
    
    if (!docId || !authorEmail) {
      return res.status(400).json({ ok: false, error: 'Faltan datos requeridos' });
    }

    const doc = await Document.findById(docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    // Validar que el solicitante sea el autor
    if (doc.authorEmail !== authorEmail) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }

    doc.content = content;
    await doc.save();
    res.json({ ok: true, document: doc });
  } catch (err) {
    console.error('Error actualizando documento:', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al actualizar documento' });
  }
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


