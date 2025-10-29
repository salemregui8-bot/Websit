/* app.js - handles upload, indexedDB storage, gallery & data rendering */

/* ---------- IndexedDB helper ---------- */
const DB_NAME = 'files-db-v1';
const STORE_NAME = 'files';
let db = null;

function openDB(){
  return new Promise((res, rej) => {
    if (db) return res(db);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        const store = idb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = e => rej(e);
  });
}

function addFileRecord(file, dataURL){
  return openDB().then(database => new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const rec = {
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      dataURL // storing base64 (ok for images/small files)
    };
    const rq = store.add(rec);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = e => rej(e);
  }));
}

function getAllFiles(){
  return openDB().then(database => new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = e => rej(e);
  }));
}

function deleteFile(id){
  return openDB().then(database => new Promise((res, rej) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(Number(id));
    req.onsuccess = () => res();
    req.onerror = e => rej(e);
  }));
}

/* ---------- UI helpers ---------- */
function readableFileSize(bytes){
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(2)) + ' ' + sizes[i];
}

/* ---------- Upload handling ---------- */
function setupUploadArea(){
  const drop = document.querySelector('#drop-area');
  if (!drop) return;
  const input = document.querySelector('#fileElem');
  const status = document.querySelector('#upload-status');

  ['dragenter','dragover'].forEach(ev => {
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(ev => {
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); });
  });

  drop.addEventListener('drop', async e => {
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files, status);
  });
  input.addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    handleFiles(files, status);
    input.value = '';
  });
}

async function handleFiles(files, statusEl){
  if (!files.length) return;
  statusEl.textContent = `Uploading ${files.length} file(s)...`;
  for (const f of files){
    // For images and small files, store base64 dataURL
    const dataURL = await fileToDataURL(f);
    await addFileRecord(f, dataURL);
  }
  statusEl.textContent = `Uploaded ${files.length} file(s).`;
  setTimeout(()=> statusEl.textContent = '', 2500);
  refreshGalleryAndData();
}

function fileToDataURL(file){
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = e => rej(e);
    reader.readAsDataURL(file);
  });
}

/* ---------- Render Gallery ---------- */
async function renderGallery(){
  const container = document.querySelector('#gallery-grid');
  if (!container) return;
  container.innerHTML = '';
  const files = await getAllFiles();
  if (!files.length){ container.innerHTML = '<p class="p-muted">No files yet. Upload some from the Upload page.</p>'; return; }
  files.reverse().forEach(f => {
    const div = document.createElement('div');
    div.className = 'thumb card';
    const inner = document.createElement('div');
    if (f.dataURL && f.type.startsWith('image')){
      inner.innerHTML = `<img src="${f.dataURL}" alt="${escapeHtml(f.name)}">`;
    } else {
      inner.innerHTML = `<div style="padding:12px;text-align:center"><strong>${escapeHtml(f.name)}</strong><div class="p-muted" style="margin-top:6px">${f.type || 'file'}</div></div>`;
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = readableFileSize(f.size);
    div.appendChild(inner);
    div.appendChild(meta);
    div.addEventListener('click', ()=> openPreview(f));
    container.appendChild(div);
  });
}

/* ---------- Render Data Table ---------- */
async function renderDataTable(){
  const tbody = document.querySelector('#data-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const files = await getAllFiles();
  files.sort((a,b)=> new Date(b.uploadedAt) - new Date(a.uploadedAt));
  if (!files.length){
    tbody.innerHTML = `<tr><td colspan="5" class="p-muted">No files yet.</td></tr>`;
    return;
  }
  files.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(f.name)}</td>
      <td>${escapeHtml(f.type || '—')}</td>
      <td>${readableFileSize(f.size)}</td>
      <td>${new Date(f.uploadedAt).toLocaleString()}</td>
      <td>
        <div class="actions">
          <button class="small" data-action="download" data-id="${f.id}">Download</button>
          <button class="small" data-action="delete" data-id="${f.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // attach action handlers
  tbody.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const files = await getAllFiles();
      const file = files.find(x=> x.id == id);
      if (!file) return alert('File not found');
      if (action === 'download'){
        const a = document.createElement('a');
        a.href = file.dataURL;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (action === 'delete'){
        if (!confirm('Delete this file?')) return;
        await deleteFile(id);
        refreshGalleryAndData();
      }
    });
  });
}

/* ---------- Preview Modal ---------- */
function openPreview(file){
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  const card = document.createElement('div');
  card.className = 'modal-card card';
  const content = document.createElement('div');
  content.style.padding = '12px';
  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>${escapeHtml(file.name)}</strong>
      <div><button id="close-modal" class="small">Close</button></div>
    </div>
  `;
  if (file.dataURL && file.type.startsWith('image')){
    const img = document.createElement('img');
    img.src = file.dataURL;
    img.className = 'preview-img';
    content.appendChild(img);
  } else {
    const info = document.createElement('div');
    info.innerHTML = `<p class="p-muted">Preview not available for this file type. You can download it.</p>
      <a class="btn" href="${file.dataURL}" download="${file.name}">Download</a>`;
    content.appendChild(info);
  }
  card.appendChild(content);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.querySelector('#close-modal').addEventListener('click', ()=> overlay.remove());
  overlay.addEventListener('click', (e)=> { if (e.target === overlay) overlay.remove(); });
}

/* ---------- Utils ---------- */
function escapeHtml(text){
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

async function refreshGalleryAndData(){
  await renderGallery();
  await renderDataTable();
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();
  setupUploadArea();
  refreshGalleryAndData();

  // navigation active link
  document.querySelectorAll('.nav a').forEach(a=>{
    if (window.location.pathname.endsWith(a.getAttribute('href'))) a.classList.add('active');
  });
});