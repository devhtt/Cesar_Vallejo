require('dotenv').config();
const express = require('express');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

// Sesión
app.use(session({
    secret: "secretcode",
    resave: false,
    saveUninitialized: true,
}));

app.use(passport.initialize());
app.use(passport.session());

// Estrategia de Google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://127.0.0.1:3000/auth/google/callback",
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Rutas
app.get("/", (req, res) => {
    res.send("<a href='/auth/google'>Login with Google</a>");
});

app.get("/auth/google", passport.authenticate('google', { scope: ["profile", "email"] }));

app.get("/auth/google/callback", passport.authenticate('google', { failureRedirect: "/" }), (req, res) => {
    res.redirect('/profile');
});

app.get("/profile", (req, res) => {
    res.send(`Welcome ${req.user ? req.user.displayName : "Guest"}`);
});

app.get("/logout", (req, res) => {
    req.logout(() => res.redirect("/"));
});

// Servidor
app.listen(3000, () => console.log("Server running on http://127.0.0.1:3000"));
