// Verificar BASE_URL al inicio
if (typeof BASE_URL === 'undefined') {
    const BASE_URL = 'https://ucv-backend-2ohp.onrender.com';
}

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

    // Función mejorada para cargar reseñas
    async function loadReviews() {
        try {
            console.log('Fetching from:', `${BASE_URL}/api/reviews`); // Debug
            const response = await fetch(`${BASE_URL}/api/reviews?page=${currentPage}&limit=${reviewsPerPage}`, {
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

    // Manejar estrellas de calificación
    const starContainer = document.querySelector('.star-rating');
    const stars = starContainer.querySelectorAll('i');
    
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

    // Función para mostrar reseñas
    async function displayReviews() {
        const container = document.querySelector('.reviews-list');
        const { reviews, total } = await loadReviews();

        container.innerHTML = reviews.map(review => `
            <div class="review-card">
                <div class="review-header">
                    <img src="${review.user.picture}" alt="Avatar" class="reviewer-avatar">
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

        // Actualizar paginación
        const totalPages = Math.ceil(total / reviewsPerPage);
        document.getElementById('currentPage').textContent = currentPage;
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage === totalPages;
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

    // Actualizar función para rating general
    async function updateOverallRating() {
        const { reviews, total } = await loadReviews();
        
        if (total === 0) {
            document.querySelector('.big-rating').textContent = '0.0';
            document.querySelector('.total-reviews').textContent = 'No hay reseñas aún';
            document.querySelector('.rating-stars').innerHTML = getStarHTML(0);
            return;
        }

        const totalStars = reviews.reduce((sum, review) => sum + Number(review.rating), 0);
        const average = totalStars / reviews.length;
        const roundedAverage = Math.round(average * 10) / 10;

        document.querySelector('.big-rating').textContent = roundedAverage.toFixed(1);
        document.querySelector('.total-reviews').textContent = 
            `Basado en ${total} reseña${total !== 1 ? 's' : ''}`;
        document.querySelector('.rating-stars').innerHTML = getStarHTML(roundedAverage);
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(reviews.length / reviewsPerPage));
        document.getElementById('currentPage').textContent = currentPage;
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage === totalPages;
    }

    // Eventos de paginación
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayReviews();
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(reviews.length / reviewsPerPage));
        if (currentPage < totalPages) {
            currentPage++;
            displayReviews();
        }
    });

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
