// Definir BASE_URL y funciones helper
const BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://ucv-backend-2ohp.onrender.com';

// helper: parsear respuesta con fallback a texto (por si el server devuelve HTML de error)
async function parseResponse(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  const text = await res.text();
  return { ok: res.ok, _rawText: text };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k,i)).toFixed(1) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function getFileIcon(typeOrMime) {
  const t = typeOrMime || '';
  if (!t) return '📎';
  if (t.startsWith('image/')) return '🖼️';
  if (t.includes('pdf')) return '📄';
  if (t.includes('word') || t.includes('document')) return '📝';
  if (t.includes('sheet') || t.includes('excel')) return '📊';
  if (t.includes('video')) return '🎥';
  if (t.includes('audio')) return '🎵';
  if (t.includes('text')) return '📃';
  return '📎';
}

// --- NUEVO: helper para obtener/normalizar usuario actual ---
async function getCurrentUser() {
	// 1) intentar obtener email desde currentUser o savedUser
	let email = localStorage.getItem('currentUser');
	if (!email) {
		try {
			const saved = JSON.parse(localStorage.getItem('savedUser') || 'null');
			email = saved && saved.email ? saved.email : null;
		} catch (e) {
			email = null;
		}
	}

	const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
	let user = email && users[email] ? users[email] : null;

	// 2) si tenemos email pero no user en storage, intentar solicitar al backend
	if (!user && email) {
		try {
			const res = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(email)}`, { credentials: 'include' });
			if (res.ok) {
				const parsed = await res.json();
				if (parsed && parsed.ok && parsed.user) {
					user = parsed.user;
					// guardar en registeredUsers local para uso futuro
					const next = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
					next[email] = user;
					localStorage.setItem('registeredUsers', JSON.stringify(next));
					localStorage.setItem('currentUser', email);
				}
			}
		} catch (err) {
			// silencioso: si falla la petición, devolvemos null y el caller mostrará mensaje
			console.warn('No se pudo recuperar usuario desde backend:', err);
		}
	}

	return user || null;
}

// Nuevo helper: normalizar entradas de "files" (soporta objetos, cadenas JSON y rutas relativas)
function normalizeFileEntry(entry) {
	// entry puede ser: objeto {name,mime,url,path}, objeto con mimetype, o string (JSON o ruta)
	if (!entry) return null;

	let f = entry;
	if (typeof f === 'string') {
		// intentar parsear JSON
		try {
			f = JSON.parse(f);
		} catch (e) {
			// no es JSON: tratar como nombre o ruta simple
			const url = f;
			const base = (BASE_URL && BASE_URL.startsWith('http')) ? BASE_URL.replace(/\/$/, '') : window.location.origin;
			const fullUrl = /^https?:\/\//i.test(url) ? url : (url.startsWith('/') ? base + url : base + '/' + url);
			return { name: url.split('/').pop(), mime: '', url: fullUrl, path: url };
		}
	}

	// ahora f es objeto
	const name = f.name || f.originalname || f.filename || (f.url ? f.url.split('/').pop() : '');
	const mime = f.mime || f.mimetype || f.type || '';
	let url = f.url || '';

	// si tenemos path pero no url, construir url desde BASE_URL
    if (!url && f.path) {
       const p = String(f.path).replace(/^\/+/, '');
       let base = (BASE_URL && BASE_URL.startsWith('http')) ? BASE_URL.replace(/\/$/, '') : window.location.origin;
       base = base.replace(/^http:\/\//, 'https://'); // evita Mixed Content
       url = base + '/' + p;
    }


	// si url es relativo (no comienza con http) lo convertimos a absoluto
	if (url && !/^https?:\/\//i.test(url)) {
		const base = (BASE_URL && BASE_URL.startsWith('http')) ? BASE_URL.replace(/\/$/, '') : window.location.origin;
		url = url.replace(/^\/+/, '');
		url = base + '/' + url;
	}

	return { name: name || '', mime: mime || '', url: url || '', path: f.path || '' };
}

// Variables globales
let currentPage = 1;
const postsPerPage = 10;

// Funciones auxiliares globales
async function loadDocuments(q = '') {
  try {
    const url = q
      ? `${BASE_URL}/api/documents/search?q=${encodeURIComponent(q)}&page=${currentPage}&limit=${postsPerPage}`
      : `${BASE_URL}/api/documents?page=${currentPage}&limit=${postsPerPage}`;
    const res = await fetch(url, { credentials: 'include' });
    const parsed = await parseResponse(res);
    if (!res.ok) {
      const err = parsed && parsed.error ? parsed.error : parsed._rawText || 'Error cargando documentos';
      throw new Error(err);
    }
    return parsed.ok ? { documents: parsed.documents, total: parsed.total } : { documents: parsed.documents || [], total: parsed.total || 0 };
  } catch (err) {
    console.error('loadDocuments error:', err);
    return { documents: [], total: 0 };
  }
}

function handleFileError(element) {
  element.onerror = () => {
    if (element.tagName === 'IMG') {
      element.src = 'placeholder.png';
    } else if (element.tagName === 'VIDEO') {
      element.style.display = 'none';
      element.insertAdjacentHTML('afterend', '<div class="error-message">Video no disponible</div>');
    }
  };
}

// Función principal de renderizado (global)
async function displayDocuments(q = '') {
  const postsList = document.getElementById('postsList');
  const { documents } = await loadDocuments(q);
  const currentUser = await getCurrentUser();
  
  if (!postsList) return;
  if (!documents || documents.length === 0) {
    postsList.innerHTML = '<p>No hay publicaciones aún</p>';
    return;
  }

  postsList.innerHTML = documents.map(doc => {
    // Verificar si el usuario actual es el autor del documento
    const isAuthor = currentUser && currentUser.email === doc.authorEmail;
    
    // Agregar botones de editar/borrar solo si es el autor
    const actionButtons = isAuthor ? `
      <div class="post-actions">
        <button class="btn-edit" onclick="editDocument('${doc._id}')">✏️ Editar</button>
        <button class="btn-delete" onclick="deleteDocument('${doc._id}')">🗑️ Borrar</button>
      </div>
    ` : '';

    // Normalizar archivos (soporta objetos, cadenas JSON y paths relativos)
    const rawFiles = Array.isArray(doc.files) ? doc.files : (doc.files ? [doc.files] : []);
    const filesArr = rawFiles.map(normalizeFileEntry).filter(f => f && f.url);

    // Construir HTML para attachments (usar filesArr)
    const attachmentsHtml = (filesArr && filesArr.length) ? `
      <div class="post-attachments">
        ${filesArr.map(file => {
          const mime = file.mime || file.type || '';
          const url = file.url || '';
          if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(url)) {
            return `
                <a href="${escapeHtml(url)}" target="_blank" class="attachment-link attachment-image">
                    <img src="${escapeHtml(url)}" alt="${escapeHtml(file.name)}" 
                         class="attachment-thumb" onerror="this.src='placeholder.png'">
                    <span class="attachment-name">${escapeHtml(file.name)}</span>
                </a>
            `;
          }
          if (mime.startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(url)) {
            return `
                <div class="attachment-video">
                    <video src="${escapeHtml(url)}" controls class="attachment-video-elem"></video>
                    <div class="attachment-name">${escapeHtml(file.name)}</div>
                </div>
            `;
          }
          if (mime.startsWith('audio/') || /\.(mp3|wav|ogg)$/i.test(url)) {
            return `
                <div class="attachment-audio">
                    <audio src="${escapeHtml(url)}" controls></audio>
                    <div class="attachment-name">${escapeHtml(file.name)}</div>
                </div>
            `;
          }
          return `
              <a href="${escapeHtml(url)}" target="_blank" class="attachment-link" rel="noopener noreferrer" download>
                  ${getFileIcon(mime)} ${escapeHtml(file.name)}
              </a>
          `;
        }).join('')}
      </div>
    ` : '';

    return `
      <div class="post" data-id="${doc._id}">
        <div class="post-header">
          <img src="${escapeHtml(doc.authorPic || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.author||'U')}`)}" 
               class="post-author-pic" alt="">
          <div class="post-info">
            <div class="post-author">${escapeHtml(doc.author)}</div>
            <div class="post-date">${new Date(doc.date).toLocaleString()}</div>
          </div>
          ${actionButtons}
        </div>
        <div class="post-content">${escapeHtml(doc.content)}</div>
        ${attachmentsHtml}
      </div>
    `;
  }).join('');

  // Agregar handlers de error a todos los medios cargados
  postsList.querySelectorAll('img, video').forEach(handleFileError);
}

// Exponer funciones globalmente de inmediato
window.displayDocuments = displayDocuments;
window.loadDocuments = loadDocuments;

document.addEventListener('DOMContentLoaded', () => {
  const postsList = document.getElementById('postsList');
  const searchInput = document.getElementById('searchInput');
  const form = document.getElementById('postForm');
  const fileInput = document.getElementById('fileInput');
  const previewContainer = document.getElementById('filePreviewContainer');

  // REEMPLAZAR createDocument para usar getCurrentUser()
  async function createDocument(content) {
    // obtener usuario actual de forma robusta
    const user = await getCurrentUser();
    if (!user || !user.email) {
        // mensaje claro al usuario
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
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const parsed = await parseResponse(res);
    if (!res.ok) {
      const err = parsed && parsed.error ? parsed.error : parsed._rawText || 'Error al crear documento';
      throw new Error(err);
    }
    return parsed; // esperado { ok:true, document, postId }
  }

  // Subir archivos a upload endpoint
  async function uploadFiles(files, postId) {
    if (!files || files.length === 0) return null;
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
      const err = parsed && parsed.error ? parsed.error : parsed._rawText || 'Error al subir archivos';
      throw new Error(err);
    }
    return parsed;
  }

  // Form submit handler: create -> upload (if files)
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = (document.getElementById('postContent') || {}).value || '';
      const files = fileInput ? fileInput.files : null;
      if (!content.trim() && (!files || files.length === 0)) {
        alert('Escribe algo o adjunta archivos');
        return;
      }

      const submitBtn = document.querySelector('.btn-submit');
      if (submitBtn) submitBtn.disabled = true;
      try {
        // validar sesión local antes de intentar crear
        const user = await getCurrentUser();
        if (!user || !user.email) {
          // instrucción para el usuario y opción de redirigir al login
          if (confirm('No se detectó una sesión válida. ¿Deseas iniciar sesión con Google ahora?')) {
            window.location.href = 'index.html';
          }
          throw new Error('no_session');
        }

        const createRes = await createDocument(content.trim());
        const postId = createRes.postId || (createRes.document && createRes.document._id);
        if (files && files.length) {
          if (!postId) throw new Error('No se obtuvo postId para subir archivos');
          await uploadFiles(files, postId);
        }
        form.reset();
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
        await displayDocuments();
        alert('Publicado correctamente');
      } catch (err) {
        console.error('Publish error:', err);
        if (err && err.message === 'no_session') {
          alert('Necesitas iniciar sesión con Google antes de publicar. Serás redirigido al login.');
          // opcional: redirigir automáticamente
          window.location.href = 'index.html';
          return;
        }
        const msg = (err && err.message) ? err.message : 'Error al publicar';
        alert('Error al publicar: ' + (msg.length > 300 ? msg.slice(0,300)+'...' : msg));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Preview handling
  function renderPreview(files) {
    if (!previewContainer) return;
    if (!files || files.length === 0) {
      previewContainer.innerHTML = '';
      previewContainer.style.display = 'none';
      return;
    }
    previewContainer.innerHTML = Array.from(files).map(file => {
      if (file.type.startsWith('image/')) {
        return `<div class="preview-item"><img src="${URL.createObjectURL(file)}" class="preview-image"><div class="preview-info"><div class="preview-name">${escapeHtml(file.name)}</div><div class="preview-size">${formatFileSize(file.size)}</div></div><button type="button" class="preview-remove" data-name="${escapeHtml(file.name)}">×</button></div>`;
      }
      if (file.type.includes('video')) {
        return `<div class="preview-item"><video src="${URL.createObjectURL(file)}" class="preview-video" controls muted></video><div class="preview-info"><div class="preview-name">${escapeHtml(file.name)}</div><div class="preview-size">${formatFileSize(file.size)}</div></div><button type="button" class="preview-remove" data-name="${escapeHtml(file.name)}">×</button></div>`;
      }
      if (file.type.includes('pdf')) {
        return `<div class="preview-item"><div class="preview-icon">📄</div><div class="preview-info"><div class="preview-name">${escapeHtml(file.name)}</div><div class="preview-size">${formatFileSize(file.size)}</div></div><button type="button" class="preview-remove" data-name="${escapeHtml(file.name)}">×</button></div>`;
      }
      return `<div class="preview-item"><div class="preview-icon">${getFileIcon(file.type)}</div><div class="preview-info"><div class="preview-name">${escapeHtml(file.name)}</div><div class="preview-size">${formatFileSize(file.size)}</div></div><button type="button" class="preview-remove" data-name="${escapeHtml(file.name)}">×</button></div>`;
    }).join('');
    previewContainer.style.display = 'block';

    // attach remove handlers
    previewContainer.querySelectorAll('.preview-remove').forEach(btn=>{
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const dt = new DataTransfer();
        Array.from(fileInput.files).forEach(f => { if (f.name !== name) dt.items.add(f); });
        fileInput.files = dt.files;
        renderPreview(fileInput.files);
      });
    });
  }

  if (fileInput && previewContainer) {
    fileInput.addEventListener('change', (e) => {
      renderPreview(e.target.files);
    });
  }

  // Search debounce
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(()=> {
        currentPage = 1;
        displayDocuments(searchInput.value.trim());
      }, 300);
    });
  }

  // initial load
  displayDocuments();
});

// Función para borrar documento
async function deleteDocument(id) {
  if (!confirm('¿Estás seguro de borrar esta publicación?')) return;
  
  const user = await getCurrentUser();
  if (!user || !user.email) {
    alert('Necesitas iniciar sesión');
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/documents/${id}?authorEmail=${encodeURIComponent(user.email)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!res.ok) throw new Error('No autorizado');
    
    await window.displayDocuments(); // usar window.displayDocuments
    alert('Publicación borrada');
  } catch (err) {
    alert('Error al borrar: ' + err.message);
  }
}

// Función para editar documento
async function editDocument(id) {
  const user = await getCurrentUser();
  if (!user || !user.email) {
    alert('Necesitas iniciar sesión');
    return;
  }

  const postEl = document.querySelector(`.post[data-id="${id}"]`);
  const contentEl = postEl.querySelector('.post-content');
  const currentContent = contentEl.textContent;

  const newContent = prompt('Editar publicación:', currentContent);
  if (!newContent || newContent === currentContent) return;

  try {
    const res = await fetch(`${BASE_URL}/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        content: newContent,
        authorEmail: user.email
      })
    });
    
    if (!res.ok) throw new Error('No autorizado');
    
    await window.displayDocuments(); // usar window.displayDocuments
    alert('Publicación actualizada');
  } catch (err) {
    alert('Error al actualizar: ' + err.message);
  }
}

// Exponer funciones globalmente
window.deleteDocument = deleteDocument;
window.editDocument = editDocument;

