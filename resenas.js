// Reemplazar la detección incorrecta de BASE_URL por API_BASE
const API_BASE = (typeof BASE_URL !== 'undefined') ? BASE_URL : 'https://ucv-backend-2ohp.onrender.com';

document.addEventListener('DOMContentLoaded', function() {
    // Estado inicial
    let currentRating = 0;
    let currentPage = 1;
    const reviewsPerPage = 5;
    
    // Función mejorada para publicar reseña con mejor manejo de errores
    async function postReview(reviewData) {
        try {
            // Verificar sesión antes de intentar publicar
            const currentEmail = localStorage.getItem('currentUser');
            const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
            const user = currentEmail && users[currentEmail];

            if (!user) {
                throw new Error('no_session');
            }

            const response = await fetch(`${BASE_URL}/api/reviews`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(reviewData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'server_error');
            }

            const data = await response.json();
            return data.review;
        } catch (err) {
            console.error('Error publicando reseña:', err);
            if (err.message === 'no_session') {
                alert('Debes iniciar sesión para publicar una reseña');
            } else if (err.message === 'user_has_review') {
                alert('Ya has publicado una reseña anteriormente');
            } else {
                alert('Error al publicar la reseña. Por favor intenta nuevamente.');
            }
            throw err;
        }
    }

    // Función mejorada para cargar reseñas (usa API_BASE)
    async function loadReviews() {
        try {
            console.log('Fetching from:', `${API_BASE}/api/reviews?page=${currentPage}&limit=${reviewsPerPage}`); // Debug
            const response = await fetch(`${API_BASE}/api/reviews?page=${currentPage}&limit=${reviewsPerPage}`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('server_error');
            }

            const data = await response.json();
            return data.ok ? {
                reviews: data.reviews,
                total: data.total
            } : { reviews: [], total: 0 };
        } catch (err) {
            console.error('Error completo:', err); // Debug más detallado
            return { reviews: [], total: 0 };
        }
    }

    // Manejar estrellas de calificación (guardando null-safety)
    const starContainer = document.querySelector('.star-rating');
    let stars = [];
    if (starContainer) {
        stars = Array.from(starContainer.querySelectorAll('i'));
        stars.forEach(star => {
            star.addEventListener('mouseover', function() {
                const rating = this.dataset.rating;
                updateStars(rating);
            });
            
            star.addEventListener('mouseout', function() {
                updateStars(currentRating);
            });
            
            star.addEventListener('click', function() {
                currentRating = this.dataset.rating;
                updateStars(currentRating);
            });
        });
    }

    function updateStars(rating) {
        stars.forEach(star => {
            const starRating = Number(star.dataset.rating);
            if (starRating <= Number(rating)) {
                star.classList.add('fas'); star.classList.remove('far');
            } else {
                star.classList.add('far'); star.classList.remove('fas');
            }
        });
    }

    // Manejar envío de reseñas
    document.getElementById('submitReview').addEventListener('click', async function() {
        const reviewText = document.getElementById('reviewText').value.trim();
        if (!reviewText || currentRating === 0) {
            alert('Por favor, escribe una reseña y selecciona una calificación');
            return;
        }

        const currentEmail = localStorage.getItem('currentUser');
        const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const user = currentEmail ? users[currentEmail] : null;

        if (!user) {
            alert('Debes iniciar sesión para dejar una reseña');
            return;
        }

        try {
            await postReview({
                text: reviewText,
                rating: parseInt(currentRating),
                user: {
                    name: user.name || 'Usuario',
                    email: user.email,
                    picture: user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name||'U')}&background=4285F4&color=fff`
                }
            });

            // Limpiar formulario
            document.getElementById('reviewText').value = '';
            currentRating = 0;
            updateStars(0);

            // Recargar reseñas y actualizar UI
            displayReviews();
            updateOverallRating();

            alert('¡Gracias por tu reseña!');
        } catch (err) {
            if (err.message === 'user_has_review') {
                alert('Ya has publicado una reseña anteriormente');
            } else {
                alert('Error al publicar la reseña. Por favor intenta nuevamente.');
            }
        }
    });

    // Función para mostrar reseñas (actualizada paginación usando total)
    async function displayReviews() {
        const container = document.querySelector('.reviews-list');
        if (!container) return;

        const { reviews, total } = await loadReviews();

        container.innerHTML = (reviews || []).map(review => `
            <div class="review-card">
                <div class="review-header">
                    <img src="${escapeHtml(review.user.picture)}" alt="Avatar" class="reviewer-avatar">
                    <div class="reviewer-info">
                        <div class="reviewer-name">${escapeHtml(review.user.name)}</div>
                        <div class="review-date">${new Date(review.date).toLocaleDateString()}</div>
                    </div>
                    <div class="review-stars">
                        ${getStarHTML(review.rating)}
                    </div>
                </div>
                <div class="review-content">${escapeHtml(review.text)}</div>
            </div>
        `).join('');

        // Actualizar paginación a partir del total devuelto por el servidor
        const totalPages = Math.max(1, Math.ceil((total || 0) / reviewsPerPage));
        const currentPageEl = document.getElementById('currentPage');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');

        if (currentPageEl) currentPageEl.textContent = currentPage;
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }

    // Generar HTML de estrellas (soporta medias para promedios)
    function getStarHTML(rating) {
        const r = Number(rating);
        let html = '';
        for (let i = 1; i <= 5; i++) {
            if (r >= i) {
                html += `<i class="fas fa-star" style="color:#ffc107"></i>`;
            } else if (r >= i - 0.5) {
                html += `<i class="fas fa-star-half-alt" style="color:#ffc107"></i>`;
            } else {
                html += `<i class="far fa-star" style="color:#ddd"></i>`;
            }
        }
        return html;
    }

    // Actualizar función para rating general => solicitar muchas reseñas para calcular promedio real
    async function updateOverallRating() {
        try {
            // pedir muchas reseñas para calcular el promedio global (si la API permite)
            const limitForAll = 10000;
            const res = await fetch(`${API_BASE}/api/reviews?page=1&limit=${limitForAll}`, { credentials: 'include' });
            if (!res.ok) throw new Error('server_error');
            const data = await res.json();
            const all = data && data.reviews ? data.reviews : [];
            const total = data && data.total ? data.total : (all.length || 0);

            if (total === 0) {
                const br = document.querySelector('.big-rating');
                const tr = document.querySelector('.total-reviews');
                const rs = document.querySelector('.rating-stars');
                if (br) br.textContent = '0.0';
                if (tr) tr.textContent = 'No hay reseñas aún';
                if (rs) rs.innerHTML = getStarHTML(0);
                return;
            }

            const totalStars = all.reduce((sum, review) => sum + Number(review.rating || 0), 0);
            const average = totalStars / (all.length || total);
            const roundedAverage = Math.round(average * 10) / 10;

            const big = document.querySelector('.big-rating');
            const totalEl = document.querySelector('.total-reviews');
            const starsEl = document.querySelector('.rating-stars');

            if (big) big.textContent = roundedAverage.toFixed(1);
            if (totalEl) totalEl.textContent = `Basado en ${total} reseña${total !== 1 ? 's' : ''}`;
            if (starsEl) starsEl.innerHTML = getStarHTML(roundedAverage);
        } catch (err) {
            console.error('Error calculando rating global:', err);
        }
    }

    // Eventos de paginación (usar currentPage y displayReviews)
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                displayReviews();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            currentPage++;
            displayReviews();
        });
    }

    // util: escapar HTML simple
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, s => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[s]));
    }

    // Inicialización
    displayReviews();
    updateOverallRating();
});
