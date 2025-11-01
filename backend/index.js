// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 5000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '903625348841-bmkhrd53eok4bgo2j4pfhrijck43pgdb.apps.googleusercontent.com';
const MONGODB_URI = process.env.MONGODB_URI || ''; // Set in Render

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(bodyParser.json());

// CORS configurado para tu frontend en GitHub Pages y Render
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

// Conectar a MongoDB
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

// Schemas y modelos
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
    name: String,
    type: String,
    url: String,
    path: String
  }]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Review = mongoose.model('Review', reviewSchema);
const Document = mongoose.model('Document', documentSchema);

// Helper: upsert user
async function upsertUser(userObj) {
  if (!userObj || !userObj.email) return null;
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  const u = await User.findOneAndUpdate({ email: userObj.email }, userObj, opts).exec();
  return u;
}

// POST /api/session_login  { id_token }
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

// POST /api/logout
app.post('/api/logout', (req, res) => {
  // Si usas cookies/JWT limpiar aquí
  res.json({ ok: true });
});

// GET /api/reviews?page=1&limit=10
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

// POST /api/reviews  { text, rating, user: { email, name, picture } }
app.post('/api/reviews', async (req, res) => {
  try {
    const { text, rating, user } = req.body;
    if (!text || !rating || !user || !user.email) return res.status(400).json({ ok: false, error: 'invalid' });

    // Evitar múltiples reseñas por mismo email
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
    // Asegurar usuario en collection Users
    await upsertUser({ email: user.email, name: user.name, picture: user.picture, registeredWith: 'google', createdAt: Date.now() });
    res.json({ ok: true, review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

// GET /api/users/:email
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

// GET /api/documents?page=1&limit=10
app.get('/api/documents', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.max(1, parseInt(req.query.limit || '10'));
    const skip = (page - 1) * limit;
    
    const [total, items] = await Promise.all([
      Document.countDocuments(),
      Document.find()
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    res.json({ ok: true, documents: items, total });
  } catch (err) {
    console.error('Error cargando documentos:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar documentos' });
  }
});

// POST /api/documents (crear nuevo documento)
app.post('/api/documents', async (req, res) => {
  try {
    const { content, author, authorEmail } = req.body;
    if (!content || !authorEmail) {
      return res.status(400).json({ ok: false, error: 'Faltan datos requeridos' });
    }

    const user = await User.findOne({ email: authorEmail });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Usuario no autorizado' });
    }

    const doc = new Document({
      content,
      author,
      authorEmail,
      authorPic: user.picture,
      files: []
    });

    await doc.save();
    res.json({ ok: true, document: doc, postId: doc._id });
  } catch (err) {
    console.error('Error creando documento:', err);
    res.status(500).json({ ok: false, error: 'Error al crear documento' });
  }
});

// POST /api/documents/upload (subir archivos)
app.post('/api/documents/upload', upload.array('files', 5), async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId || !req.files?.length) {
      return res.status(400).json({ ok: false, error: 'Faltan archivos o postId' });
    }

    const doc = await Document.findById(postId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }

    // Procesar archivos subidos
    const files = req.files.map(file => ({
      name: file.originalname,
      type: file.mimetype,
      url: `${process.env.BASE_URL}/uploads/${file.filename}`,
      path: file.path
    }));

    doc.files.push(...files);
    await doc.save();

    res.json({ ok: true, files });
  } catch (err) {
    console.error('Error subiendo archivos:', err);
    res.status(500).json({ ok: false, error: 'Error al subir archivos' });
  }
});

// GET /api/documents/search
app.get('/api/documents/search', async (req, res) => {
  try {
    const { q } = req.query;
    const query = q ? {
      $or: [
        { content: { $regex: q, $options: 'i' } },
        { author: { $regex: q, $options: 'i' } }
      ]
    } : {};

    const documents = await Document.find(query)
      .sort({ date: -1 })
      .limit(20)
      .lean();

    res.json({ ok: true, documents });
  } catch (err) {
    console.error('Error buscando documentos:', err);
    res.status(500).json({ ok: false, error: 'Error en búsqueda' });
  }
});

// Configuración para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// Middleware de manejo de errores (si hay un error, devolver JSON en vez de HTML)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  // intentar enviar JSON con mensaje y stack en dev
  const payload = { ok: false, error: err && err.message ? err.message : 'server_error' };
  if (process.env.NODE_ENV !== 'production' && err && err.stack) {
    payload.stack = err.stack;
  }
  // si ya se comenzó a enviar respuesta, terminar
  if (res.headersSent) {
    return next(err);
  }
  res.status(status).json(payload);
});

// Opcional: servir frontend estático si lo subes aquí
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
