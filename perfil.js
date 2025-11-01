(function () {
    // Evitar errores si el script se carga en otra página
    if (!window.document) return;

    function formatDate(ts) {
        try {
            return new Date(ts).toLocaleString();
        } catch (e) {
            return ts || 'No disponible';
        }
    }

    function loadProfile() {
        const currentEmail = localStorage.getItem('currentUser');
        const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const user = currentEmail ? users[currentEmail] : null;

        if (!user) {
            // No hay sesión activa: redirigir a index para login
            window.location.href = 'index.html';
            return;
        }

        const picEl = document.getElementById('userProfilePic');
        const nameEl = document.getElementById('userName');
        const emailEl = document.getElementById('userEmail');
        const timeEl = document.getElementById('loginTime');

        if (picEl) picEl.src = user.picture || (`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name||user.email||'U')}&background=4285F4&color=fff`);
        if (nameEl) nameEl.textContent = user.name || user.email || 'Usuario';
        if (emailEl) emailEl.textContent = user.email || '';
        if (timeEl) {
            const last = localStorage.getItem('lastLoginTime') || user.createdAt || '';
            timeEl.textContent = 'Último inicio de sesión: ' + (last ? formatDate(last) : 'No disponible');
        }

        // Los campos Record / Logros / Porcentaje quedan en blanco (placeholder ya en HTML)
    }

    window.addEventListener('DOMContentLoaded', function () {
        loadProfile();

        // Botón volver (abajo en la página)
        const btnBack = document.getElementById('btnBack');
        if (btnBack) {
            btnBack.addEventListener('click', function () {
                window.location.href = 'seleccion.html';
            });
        }

        // Ya no intentamos usar finalizeLogoutUI ni btnLogout en esta página.
    });
})();
