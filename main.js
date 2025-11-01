// Definir URL base según el ambiente
const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://ucv-backend-2ohp.onrender.com';
const STORAGE_KEY = 'app_ratings';

const useServer = BASE_URL.includes('localhost');
let currentUser = null;

// Callback de Google: registra usuario en localStorage o delega al servidor
function handleCredentialResponse(response) {
    const token = response && response.credential;
    if (!token) return;
    if (useServer) {
        fetch(`${BASE_URL}/api/session_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id_token: token })
        })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                currentUser = data.user;
                if (currentUser && currentUser.email) localStorage.setItem('currentUser', currentUser.email);
                localStorage.setItem('lastLoginTime', new Date().toISOString());
                showWelcome(currentUser);
            } else {
                alert('Error login: ' + (data.error || ''));
            }
        }).catch(err => {
            console.error(err);
            alert('Error de red al iniciar sesión en servidor.');
        });
    } else {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const email = (payload.email || '').trim().toLowerCase();
            const userObj = {
                email: email,
                name: payload.name || '',
                picture: payload.picture || '',
                registeredWith: 'google',
                createdAt: Date.now()
            };
            const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
            users[email] = userObj;
            localStorage.setItem('registeredUsers', JSON.stringify(users));
            localStorage.setItem('currentUser', email);
            localStorage.setItem('lastLoginTime', new Date().toISOString());
            currentUser = userObj;
            showWelcome(currentUser);
        } catch (e) {
            console.error(e);
            alert('Token inválido');
        }
    }
}
window.handleCredentialResponse = handleCredentialResponse;

function finalizeLogoutUI() {
    currentUser = null;
    const wm = document.querySelector('.welcome-msg'); if (wm) wm.remove();
    const headerBtn = document.getElementById('btnLogout'); if (headerBtn) headerBtn.style.display = 'none';
    try { localStorage.removeItem('currentUser'); } catch(e){/*silencio*/ }
    try { localStorage.removeItem('lastLoginTime'); } catch(e){/*silencio*/ }
    setTimeout(() => { window.location.href = 'index.html'; }, 100);
}

// Enlazar logout
const btnLogoutEl = document.getElementById('btnLogout');
if (btnLogoutEl) {
    btnLogoutEl.addEventListener('click', () => {
        if (useServer) {
            fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' })
            .finally(finalizeLogoutUI);
        } else {
            finalizeLogoutUI();
        }
    });
}

// showWelcome simplificada
function showWelcome(user) {
    if (!user) return;
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage === '' || currentPage === 'index.html') {
        setTimeout(() => { window.location.href = 'seleccion.html'; }, 150);
    }
}

// showWelcomeNoRedirect
function showWelcomeNoRedirect(user) {
    if (!user) return;
    localStorage.setItem('lastLoginTime', new Date().toISOString());
}

(function(){
    function loadUsers() {
        try { return JSON.parse(localStorage.getItem('registeredUsers') || '{}'); }
        catch(e) { return {}; }
    }
    function saveUsers(u) { localStorage.setItem('registeredUsers', JSON.stringify(u)); }
    function setCurrentUserLocal(email) { localStorage.setItem('currentUser', email); }
    function clearCurrentUserLocal() { localStorage.removeItem('currentUser'); }

    function parseJwt(token) {
        if(!token) return null;
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    const localLoginForm = document.getElementById('localLoginForm');
    const loginError = document.getElementById('localLoginError');
    if (localLoginForm) {
        localLoginForm.addEventListener('submit', function(e){
            e.preventDefault(); e.stopPropagation();
            const email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
            const password = document.getElementById('loginPassword').value || '';
            const users = loadUsers();
            if (users[email] && users[email].registeredWith === 'google') {
                setCurrentUserLocal(email);
                currentUser = users[email];
                if (loginError) { loginError.style.display = 'none'; loginError.textContent = ''; }
                window.location.href = "seleccion.html";
                return false;
            }
            if (loginError) {
                loginError.textContent = 'Por favor usa el botón de Google para iniciar sesión';
                loginError.style.display = 'block';
            }
            return false;
        });
    }

    document.addEventListener('DOMContentLoaded', function(){
        const params = new URLSearchParams(window.location.search);
        if (params.get('notification') === 'saved') {
            const notification = document.getElementById('notification');
            if (notification) {
                notification.style.display = 'block';
                setTimeout(() => {
                    notification.style.display = 'none';
                }, 3000);
            }
        }

        const btnContinue = document.getElementById('btnContinue');
        if (btnContinue) {
            btnContinue.addEventListener('click', function () {
                const savedSession = localStorage.getItem('sessionSaved');
                const savedUser = JSON.parse(localStorage.getItem('savedUser') || 'null');
                if (savedSession === 'true' && savedUser && savedUser.email) {
                    localStorage.setItem('currentUser', savedUser.email);
                    localStorage.setItem('lastLoginTime', new Date().toISOString());
                    const users = loadUsers();
                    if (!users[savedUser.email]) {
                        users[savedUser.email] = savedUser;
                        localStorage.setItem('registeredUsers', JSON.stringify(users));
                    }
                    window.location.href = 'seleccion.html';
                } else {
                    alert('No hay una sesión guardada.\nPor favor inicie sesión con Google y use "Guardar sesión" en el panel de perfil para poder usar esta opción.');
                }
            });
        }

        const current = localStorage.getItem('currentUser');
        const users = loadUsers();
        if (current && users[current]) {
            currentUser = users[current];
            const params = new URLSearchParams(window.location.search);
            if (params.get('from') === 'seleccion') {
                showWelcomeNoRedirect(currentUser);
            } else {
                showWelcome(currentUser);
            }
        } else {
            const loginSection = document.getElementById('loginSection');
            const profileSection = document.getElementById('profileSection');
            if (loginSection) loginSection.style.display = 'block';
            if (profileSection) profileSection.style.display = 'none';
        }
    });
})();
