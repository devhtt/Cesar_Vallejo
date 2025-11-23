document.addEventListener('DOMContentLoaded', function() {
    // Cargar datos del usuario desde localStorage
    const currentEmail = localStorage.getItem('currentUser');
    const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
    const user = currentEmail ? users[currentEmail] : null;

    // Elementos del perfil
    const profilePic = document.getElementById('userProfilePic');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const loginTime = document.getElementById('loginTime');
    const btnLogout = document.getElementById('btnLogout');

    if (user) {
        // Usuario de Google: mostrar datos reales
        profilePic.src = user.picture || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name||'U')}&background=4285F4&color=fff`;
        userName.textContent = user.name || 'Usuario';
        userEmail.textContent = user.email || '';
        loginTime.textContent = localStorage.getItem('lastLoginTime') ? 
            new Date(localStorage.getItem('lastLoginTime')).toLocaleString() : 'No disponible';

        // Configurar botón guardar sesión
        const btnSaveSession = document.getElementById('btnSaveSession');
        btnSaveSession.addEventListener('click', function() {
            localStorage.setItem('sessionSaved', 'true');
            localStorage.setItem('savedUser', JSON.stringify(user));
            
            // Mostrar notificación en la página actual
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = 'Sesión guardada';
            document.body.appendChild(notification);
            
            // Mostrar y ocultar la notificación
            setTimeout(() => {
                notification.style.display = 'block';
                setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => notification.remove(), 300);
                }, 2000);
            }, 100);
        });

        // Configurar botón logout para Google
        btnLogout.addEventListener('click', function() {
            // Primero eliminar current user y lastLoginTime
            localStorage.removeItem('currentUser');
            localStorage.removeItem('lastLoginTime');
            
            // Mantener sessionSaved y savedUser para poder reiniciar sesión después
            // localStorage.removeItem('sessionSaved');
            // localStorage.removeItem('savedUser');
            
            if (google && google.accounts && google.accounts.id) {
                google.accounts.id.disableAutoSelect();
                google.accounts.id.revoke(localStorage.getItem('currentUser'), () => {
                    window.location.href = 'index.html';
                });
            } else {
                window.location.href = 'index.html';
            }
        });
    } else {
        // Modo invitado: mostrar datos por defecto
        profilePic.src = 'https://ui-avatars.com/api/?name=I&background=888888&color=fff';
        userName.textContent = 'Invitado';
        userEmail.textContent = 'Invitado@gmail.com';
        loginTime.textContent = new Date().toLocaleString();

        // Botón logout simple para invitado
        btnLogout.addEventListener('click', function() {
            window.location.href = 'index.html';
        });
    }
});
