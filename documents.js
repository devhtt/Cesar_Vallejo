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

// helper: parsear respuesta con fallback a texto (por si el server devuelve HTML de error)
async function parseResponse(res) {
	// intentar JSON sólo cuando el content-type indica JSON
	const ct = res.headers.get('content-type') || '';
	if (ct.includes('application/json')) {
		return res.json();
	}
	// si no es JSON devolver texto crudo (puede ser HTML de error)
	const text = await res.text();
	return { ok: res.ok, _rawText: text };
}

document.addEventListener('DOMContentLoaded', function() {
    // Estado inicial
    let currentPage = 1;
    const postsPerPage = 5;

    // Función para publicar documento (similar a postReview)
    async function postDocument(content) {
        try {
            const currentEmail = localStorage.getItem('currentUser');
            const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
            const user = currentEmail && users[currentEmail];

            if (!user) {
                throw new Error('no_session');
            }

            const body = {
                content,
                author: user.name || 'Usuario',
                authorEmail: user.email,
                authorPic: user.picture || ''
            };

            const res = await fetch(`${BASE_URL}/api/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });

            const parsed = await parseResponse(res);
            if (!res.ok) {
                const errMsg = (parsed && parsed.error) ? parsed.error : (parsed && parsed._rawText) ? parsed._rawText : 'server_error';
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }

            // Esperamos { ok:true, document, postId } desde backend
            return parsed;
        } catch (err) {
            console.error('Error publicando documento:', err);
            throw err;
        }
    }

    // Función para subir archivos a /api/documents/upload usando FormData (GridFS/multer en backend)
    async function uploadFiles(files, postId) {
	// files: FileList o array
	if (!files || files.length === 0) return { ok: true, files: [] };

	const fd = new FormData();
	Array.from(files).forEach(f => fd.append('files', f));
	fd.append('postId', postId);

	const res = await fetch(`${BASE_URL}/api/documents/upload`, {
		method: 'POST',
		body: fd,
		credentials: 'include'
	});
	const parsed = await parseResponse(res);
	if (!res.ok) {
		const errMsg = (parsed && parsed.error) ? parsed.error : (parsed && parsed._rawText) ? parsed._rawText : 'upload_error';
		throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
	}
	return parsed;
}

    // Función para cargar documentos corregida (antes loadPosts)
    async function loadDocuments(searchQuery = '') {
        try {
            const url = searchQuery 
                ? `${BASE_URL}/api/documents/search?q=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${postsPerPage}`
                : `${BASE_URL}/api/documents?page=${currentPage}&limit=${postsPerPage}`;

            const response = await fetch(url, {
                credentials: 'include'
            });

            const parsed = await parseResponse(response);

            if (!response.ok) {
                const errMsg = (parsed && parsed.error) ? parsed.error : (parsed && parsed._rawText) ? parsed._rawText : 'server_error';
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }

            return parsed.ok ? {
                documents: parsed.documents,
                total: parsed.total
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

    // Manejar formulario de publicación
    const form = document.getElementById('postForm');
    if (form) {
        form.addEventListener('submit', async function (e) {
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
                // 1) Crear documento (JSON)
                const createResult = await postDocument(content);
                const postId = (createResult && (createResult.postId || (createResult.document && createResult.document._id))) 
                    ? (createResult.postId || (createResult.document && createResult.document._id))
                    : null;

                // 2) Si hay archivos y tenemos postId, subirlos
                if (files && files.length) {
                    if (!postId) throw new Error('No se obtuvo postId para subir archivos');
                    await uploadFiles(files, postId);
                }

                // Limpiar formulario y preview
                form.reset();
                const preview = document.getElementById('filePreviewContainer');
                if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }

                // Recargar listado
                await displayDocuments();

                alert('¡Publicado correctamente!');
            } catch (err) {
                console.error('Error:', err);
                // mostrar mensaje útil si el backend devolvió HTML/text
                alert('Error al publicar. ' + (err.message || 'Intenta nuevamente.'));
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

// Buscar posts
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
        currentPage = 1;
        displayDocuments();
    }, 300));
}

// Debounce helper
function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    }
}

// Función mejorada para iconos y previsualizaciones
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

// Función para previsualizar archivos
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

// Mejorar manejo de archivos en el input
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

        // Agregar listeners para remover archivos
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
