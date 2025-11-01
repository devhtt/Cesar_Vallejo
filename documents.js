// Definir BASE_URL y funciones helper
const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://ucv-backend-2ohp.onrender.com';

const API_URL = 'https://ucv-backend-2ohp.onrender.com/api';

// Helper functions
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
}

document.addEventListener('DOMContentLoaded', function() {
    // Estado inicial
    let currentPage = 1;
    const postsPerPage = 5;

    // Función para publicar documento (similar a postReview)
    async function postDocument(content, files) {
        try {
            const currentEmail = localStorage.getItem('currentUser');
            const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
            const user = currentEmail && users[currentEmail];

            if (!user) {
                throw new Error('no_session');
            }

            // Enviar solo JSON al endpoint de documentos
            const response = await fetch(`${BASE_URL}/api/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: content,
                    author: user.name || 'Usuario',
                    authorEmail: user.email
                }),
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'server_error');
            }

            const data = await response.json();
            const postId = data.document._id;

            // Subir archivos si existen
            if (files && files.length) {
                const formData = new FormData();
                Array.from(files).forEach(file => formData.append('files', file));
                formData.append('postId', postId);

                const uploadResp = await fetch(`${BASE_URL}/api/documents/upload`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                });

                if (!uploadResp.ok) {
                    const err = await uploadResp.json();
                    console.error('Error subiendo archivos:', err);
                }
            }

            return data;
        } catch (err) {
            console.error('Error publicando documento:', err);
            if (err.message === 'no_session') {
                alert('Debes iniciar sesión con Google para publicar');
            } else {
                alert('Error al publicar. Por favor intenta nuevamente.');
            }
            throw err;
        }
    }

    // Función para cargar documentos
    async function loadDocuments(searchQuery = '') {
        try {
            const url = searchQuery 
                ? `${BASE_URL}/api/documents/search?q=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${postsPerPage}`
                : `${BASE_URL}/api/documents?page=${currentPage}&limit=${postsPerPage}`;

            const response = await fetch(url, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('server_error');
            const data = await response.json();
            return data.ok ? {
                documents: data.documents,
                total: data.total
            } : { documents: [], total: 0 };
        } catch (err) {
            console.error('Error cargando documentos:', err);
            return { documents: [], total: 0 };
        }
    }

    // Función para mostrar documentos en el DOM
    async function displayDocuments() {
        const container = document.querySelector('.posts-list');
        const { documents, total } = await loadDocuments();

        if (container) {
            container.innerHTML = documents.length ? documents.map(doc => `
                <div class="post">
                    <div class="post-header">
                        <img src="${doc.authorPic || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.author)}`}" 
                             class="post-author-pic" alt="">
                        <div class="post-info">
                            <div class="post-author">${escapeHtml(doc.author)}</div>
                            <div class="post-date">${new Date(doc.date).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="post-content">${escapeHtml(doc.content)}</div>
                    ${doc.files && doc.files.length ? `
                        <div class="post-attachments">
                            ${doc.files.map(file => `
                                <a href="${file.url}" target="_blank" class="attachment-link" download>
                                    ${getFileIcon(file.type)} ${escapeHtml(file.name)}
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('') : '<p class="no-documents">No hay documentos publicados aún</p>';
        }
    }

    // Formulario de publicación corregido
    const form = document.getElementById('postForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const content = document.getElementById('postContent').value.trim();
            const files = document.getElementById('fileInput').files;

            if (!content && (!files || !files.length)) {
                alert('Por favor escribe un mensaje o adjunta archivos');
                return;
            }

            const submitBtn = document.querySelector('.btn-submit');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await postDocument(content, files);

                // Limpiar formulario y recargar documentos
                form.reset();
                const previewContainer = document.getElementById('filePreviewContainer');
                if (previewContainer) {
                    previewContainer.innerHTML = '';
                    previewContainer.style.display = 'none';
                }
                displayDocuments();
                alert('¡Publicado correctamente!');

            } catch (err) {
                console.error('Error al publicar documento:', err);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Búsqueda con debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', function() {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                currentPage = 1;
                displayDocuments();
            }, 300);
        });
    }

    // Inicialización
    displayDocuments();
});

// Debounce helper
function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    }
}

// Función para iconos
function getFileIcon(type) {
    const icons = {
        'image': '🖼️',
        'pdf': '📄',
        'word': '📝',
        'excel': '📊',
        'video': '🎥',
        'audio': '🎵',
        'text': '📃',
        'default': '📎'
    };

    if (type.startsWith('image/')) return icons.image;
    if (type.includes('pdf')) return icons.pdf;
    if (type.includes('word') || type.includes('document')) return icons.word;
    if (type.includes('sheet') || type.includes('excel')) return icons.excel;
    if (type.includes('video')) return icons.video;
    if (type.includes('audio')) return icons.audio;
    if (type.includes('text')) return icons.text;
    return icons.default;
}

// Previsualización de archivos
function createFilePreview(file) {
    if (file.type.startsWith('image/')) {
        return `
            <div class="preview-item">
                <img src="${URL.createObjectURL(file)}" alt="${file.name}" class="preview-image">
                <div class="preview-info">
                    <span class="preview-name">${file.name}</span>
                    <span class="preview-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="preview-remove" data-name="${file.name}">×</button>
            </div>
        `;
    } else if (file.type.includes('pdf')) {
        return `
            <div class="preview-item pdf">
                <div class="preview-icon">📄</div>
                <div class="preview-info">
                    <span class="preview-name">${file.name}</span>
                    <span class="preview-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="preview-remove" data-name="${file.name}">×</button>
            </div>
        `;
    } else if (file.type.includes('video')) {
        return `
            <div class="preview-item video">
                <video src="${URL.createObjectURL(file)}" controls muted class="preview-video"></video>
                <div class="preview-info">
                    <span class="preview-name">${file.name}</span>
                    <span class="preview-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="preview-remove" data-name="${file.name}">×</button>
            </div>
        `;
    } else {
        return `
            <div class="preview-item default">
                <div class="preview-icon">${getFileIcon(file.type)}</div>
                <div class="preview-info">
                    <span class="preview-name">${file.name}</span>
                    <span class="preview-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="preview-remove" data-name="${file.name}">×</button>
            </div>
        `;
    }
}

// Manejo del input de archivos
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('filePreviewContainer');

if (fileInput && previewContainer) {
    fileInput.addEventListener('change', function() {
        const files = Array.from(this.files);
        if (!files.length) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
            return;
        }

        previewContainer.innerHTML = files.map(file => createFilePreview(file)).join('');
        previewContainer.style.display = 'block';

        previewContainer.querySelectorAll('.preview-remove').forEach(btn => {
            btn.onclick = function() {
                const fileName = this.dataset.name;
                const dt = new DataTransfer();
                Array.from(fileInput.files)
                    .filter(f => f.name !== fileName)
                    .forEach(f => dt.items.add(f));
                fileInput.files = dt.files;
                
                if (fileInput.files.length === 0) {
                    previewContainer.innerHTML = '';
                    previewContainer.style.display = 'none';
                } else {
                    this.closest('.preview-item').remove();
                }
            };
        });
    });
}
