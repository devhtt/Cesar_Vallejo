from flask import Flask, request, jsonify, session, g, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import time

# Optional: google token verification
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
    GOOGLE_AVAILABLE = True
except Exception:
    GOOGLE_AVAILABLE = False

DB_PATH = os.path.join(os.path.dirname(__file__), 'comments.db')
APP = Flask(__name__, static_folder='.', static_url_path='')
CORS(APP, supports_credentials=True, origins=['http://localhost:5000', 'http://127.0.0.1:5000'])
APP.secret_key = os.environ.get('FLASK_SECRET_KEY', 'change-me-to-secure-key')

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@APP.teardown_appcontext
def close_db(exc):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = get_db()
    db.execute('''
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            name TEXT,
            rating INTEGER,
            comment TEXT,
            timestamp INTEGER
        )
    ''')
    db.commit()

CLIENT_ID = '903625348841-bmkhrd53eok4bgo2j4pfhrijck43pgdb.apps.googleusercontent.com'

@APP.route('/session_login', methods=['POST'])
def session_login():
    data = request.get_json() or {}
    id_token_str = data.get('id_token')
    if not id_token_str:
        return jsonify(ok=False, error='no id_token'), 400

    try:
        req = grequests.Request()
        claims = id_token.verify_oauth2_token(id_token_str, req, CLIENT_ID)
        user_info = {
            'email': claims.get('email'),
            'name': claims.get('name'),
            'picture': claims.get('picture')
        }
        session['user'] = user_info
        return jsonify(ok=True, user=user_info)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 400

@APP.route('/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify(ok=True)

@APP.route('/api/comments', methods=['POST'])
def post_comment():
    if 'user' not in session:
        return jsonify(ok=False, error='not authenticated'), 401
    data = request.get_json() or {}
    rating = int(data.get('rating', 0))
    comment = data.get('comment', '').strip()
    if rating < 1 or rating > 5:
        return jsonify(ok=False, error='rating must be 1..5'), 400
    user = session.get('user', {})
    email = user.get('email')
    name = user.get('name')
    ts = int(time.time() * 1000)
    db = get_db()
    db.execute('INSERT INTO comments (user_email,name,rating,comment,timestamp) VALUES (?,?,?,?,?)',
               (email, name, rating, comment, ts))
    db.commit()
    return jsonify(ok=True)

@APP.route('/api/reputation', methods=['GET'])
def get_reputation():
    db = get_db()
    cur = db.execute('SELECT user_email,name,rating,comment,timestamp FROM comments ORDER BY timestamp DESC')
    rows = [dict(r) for r in cur.fetchall()]
    return jsonify(ok=True, data=rows)

# Serve static files (index.html already in project root)
@APP.route('/')
def index():
    return send_from_directory('.', 'index.html')

with APP.app_context():
    init_db()

if __name__ == '__main__':
    APP.run(host='0.0.0.0', port=5000, debug=True)

