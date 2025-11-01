// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES module: definir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const User = mongoose.model('User', userSchema);
const Review = mongoose.model('Review', reviewSchema);

// Helper: upsert user
async function upsertUser(userObj) {
  if (!userObj || !userObj.email) return null;
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  return await User.findOneAndUpdate({ email: userObj.email }, userObj, opts).exec();
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

// Servir frontend estático
app.use(express.static(join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

