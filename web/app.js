let currentPath = '';
let allItems = [];
let previewPath = '';
let modalResolve = null;
let contextTarget = null;
let isAuthed = false;
let previewDrag = null;
let navigationHistory = [''];
let navigationIndex = 0;
let previewIsImage = false;
let previewZoom = 0;
let currentSort = 'name-asc';
let currentLayout = 'grid';
let selectedPaths = new Set();
let selectionDrag = null;
let selectionFrame = 0;
let pendingSelectionEvent = null;
let selectionBoxInitialized = false;
let searchTimer = 0;
const previewZoomStep = 0.25;
const previewZoomMin = -0.75;
const previewZoomMax = 2;
let previewImageNaturalWidth = 0;
let previewImageNaturalHeight = 0;
const thumbObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const src = img.dataset.src;
        if (src && img.src !== src) {
          img.src = src;
        }
        observer.unobserve(img);
      });
    }, { rootMargin: '300px 0px' })
  : null;

function getFileType(name, isDir) {
  if (isDir) return 'Folder';
  const ext = name.split('.').pop().toLowerCase();
  const typeMap = {
    'pdf': 'PDF', 'doc': 'DOC', 'docx': 'DOC', 'txt': 'TXT', 'md': 'MD',
    'jpg': 'JPG', 'jpeg': 'JPG', 'png': 'PNG', 'gif': 'GIF', 'svg': 'SVG', 'webp': 'WEB',
    'mp4': 'MP4', 'avi': 'AVI', 'mov': 'MOV', 'mkv': 'MKV', 'webm': 'WEB',
    'mp3': 'MP3', 'wav': 'WAV', 'flac': 'FLAC', 'aac': 'AAC',
    'zip': 'ZIP', 'rar': 'RAR', '7z': '7Z', 'tar': 'TAR', 'gz': 'GZ',
    'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'yml': 'YML', 'html': 'HTML', 'css': 'CSS', 'js': 'JS', 'py': 'PY', 'go': 'GO'
  };
  return typeMap[ext] || ext.toUpperCase();
}

function formatBytes(bytes, isDir) {
  if (isDir) return 'Folder';
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  }).format(date);
}

function sortItems(items, sortKey) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    switch (sortKey) {
      case 'name-asc': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      case 'name-desc': return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
      case 'date-newest': return new Date(b.modTime) - new Date(a.modTime);
      case 'date-oldest': return new Date(a.modTime) - new Date(b.modTime);
      case 'size-largest': return (b.size || 0) - (a.size || 0);
      case 'size-smallest': return (a.size || 0) - (b.size || 0);
      default: return 0;
    }
  });
  return sorted;
}

function isImageFile(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
}

function hasGeneratedThumbnail(name) {
  const ext = name.split('.').pop().toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext);
}

function fileUrl(path) {
  return `/files/${encodeURIComponent(path)}`;
}

function thumbUrl(path) {
  return `/api/thumb?path=${encodeURIComponent(path)}&w=96&h=96`;
}

function iconForItem(item) {
  if (item.isDir) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }
  const ext = item.name.split('.').pop().toLowerCase();
  if (isImageFile(item.name)) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5V5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 16 3.2-3.2 2.2 2.2 1.5-1.5L19 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/></svg>';
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v12H5V6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m11 10 4 2-4 2v-4Z" fill="currentColor"/></svg>';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 4h2m-2 3h2m-2 3h2m-2 3h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l3 3v15H7V3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4M10 12h5M10 16h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function checkAuth() {
  const res = await fetch('/api/me');
  return res.ok;
}

function joinPath(a, b) {
  if (!a) return b;
  return `${a.replace(/\/$/, '')}/${b}`;
}

function baseName(p) {
  const parts = p.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  const pathInput = document.getElementById('pathInput');
  bc.innerHTML = '';
  const parts = currentPath.split('/').filter(p => p);
  const home = document.createElement('span');
  home.className = 'breadcrumb-item' + (!currentPath ? ' active' : '');
  home.textContent = 'Root';
  home.onclick = () => navigateTo('');
  bc.appendChild(home);
  let accumulated = '';
  parts.forEach((part, i) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = '/';
    bc.appendChild(sep);
    accumulated += '/' + part;
    const item = document.createElement('span');
    item.className = 'breadcrumb-item' + (i === parts.length - 1 ? ' active' : '');
    item.textContent = part;
    item.onclick = () => navigateTo(accumulated);
    bc.appendChild(item);
  });
  if (pathInput) {
    pathInput.value = currentPath ? `/${currentPath}` : '/';
  }
}

function updatePageSummary(items, query = '') {
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const folderName = currentPath ? baseName(currentPath) : 'Files';
  const folders = items.filter(item => item.isDir).length;
  const files = items.length - folders;
  pageTitle.textContent = query ? 'Search results' : folderName;
  pageSubtitle.textContent = `${items.length} item${items.length === 1 ? '' : 's'} / ${folders} folder${folders === 1 ? '' : 's'} / ${files} file${files === 1 ? '' : 's'}`;
}

async function fetchList(path = '') {
  const res = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error('Failed to load directory');
  return res.json();
}

async function load(path = '') {
  try {
    if (!isAuthed) return;
    currentPath = path;
    selectedPaths.clear();
    updateBreadcrumb();
    const bc = document.getElementById('breadcrumb');
    const pi = document.getElementById('pathInput');
    bc.classList.remove('hidden');
    pi.classList.add('hidden');
    allItems = await fetchList(path);
    renderList(allItems);
    closePreview();
    updateNavigationButtons();
  } catch (e) {
    showToast(e.message || 'Load failed', 'error');
  }
}

function navigateTo(path) {
  if (path === currentPath) return;
  if (navigationIndex < navigationHistory.length - 1) {
    navigationHistory.splice(navigationIndex + 1);
  }
  navigationHistory.push(path);
  navigationIndex = navigationHistory.length - 1;
  load(path);
}

function goBack() {
  if (navigationIndex > 0) {
    navigationIndex--;
    load(navigationHistory[navigationIndex]);
  }
}

function goForward() {
  if (navigationIndex < navigationHistory.length - 1) {
    navigationIndex++;
    load(navigationHistory[navigationIndex]);
  }
}

function updateNavigationButtons() {
  const backBtn = document.getElementById('backButton');
  const forwardBtn = document.getElementById('forwardButton');
  backBtn.disabled = navigationIndex <= 0;
  forwardBtn.disabled = navigationIndex >= navigationHistory.length - 1;
}

function renderList(items) {
  items = sortItems(items, currentSort);
  const ul = document.getElementById('list');
  const query = document.getElementById('searchInput').value.trim();
  updatePageSummary(items, query);
  if (thumbObserver) {
    ul.querySelectorAll('img[data-src]').forEach(img => thumbObserver.unobserve(img));
  }
  ul.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = query ? 'No matching files' : 'This folder is empty';
    const copy = document.createElement('span');
    copy.textContent = query ? 'Try a different search term.' : 'Upload files or create a folder to get started.';
    empty.appendChild(title);
    empty.appendChild(copy);
    ul.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'file-item' + (item.isDir ? ' is-dir' : '');
    if (selectedPaths.has(item.path)) li.classList.add('selected');
    li.dataset.path = item.path;
    li.dataset.isDir = item.isDir;

    const selectDot = document.createElement('div');
    selectDot.className = 'select-dot';
    li.appendChild(selectDot);

    const previewBox = document.createElement('div');
    previewBox.className = 'file-preview';
    if (!item.isDir && hasGeneratedThumbnail(item.name)) {
      const thumb = document.createElement('img');
      thumb.className = 'file-thumb';
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.fetchPriority = 'low';
      thumb.dataset.src = thumbUrl(item.path);
      thumb.onerror = () => {
        previewBox.classList.add('is-icon');
        previewBox.innerHTML = iconForItem(item);
      };
      previewBox.appendChild(thumb);
      if (thumbObserver) {
        thumbObserver.observe(thumb);
      } else {
        thumb.src = thumb.dataset.src;
      }
    } else {
      previewBox.classList.add('is-icon');
      previewBox.innerHTML = iconForItem(item);
    }
    li.appendChild(previewBox);

    const main = document.createElement('div');
    main.className = 'file-main';

    const type = document.createElement('div');
    type.className = 'file-type';
    type.textContent = getFileType(item.name, item.isDir);
    main.appendChild(type);

    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = item.name;
    name.title = item.name;
    main.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const size = document.createElement('span');
    size.textContent = formatBytes(item.size, item.isDir);
    const modified = document.createElement('span');
    modified.textContent = formatDate(item.modTime);
    meta.appendChild(size);
    meta.appendChild(modified);
    main.appendChild(meta);
    li.appendChild(main);

    li.onclick = (e) => {
      const path = item.path;
      let selectionChanged = false;
      if (e.target.closest('.select-dot')) {
        if (selectedPaths.has(path)) selectedPaths.delete(path);
        else selectedPaths.add(path);
        updateSelectionClasses();
        return;
      }
      if (e.shiftKey && selectedPaths.size > 0) {
        // Range select
        const allItemEls = Array.from(ul.querySelectorAll('.file-item'));
        const lastSelected = Array.from(selectedPaths).pop();
        const lastIdx = allItemEls.findIndex(el => el.dataset.path === lastSelected);
        const currIdx = allItemEls.findIndex(el => el.dataset.path === path);
        if (lastIdx >= 0 && currIdx >= 0) {
          const [start, end] = [Math.min(lastIdx, currIdx), Math.max(lastIdx, currIdx)];
          for (let i = start; i <= end; i++) {
            selectedPaths.add(allItemEls[i].dataset.path);
          }
          selectionChanged = true;
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle
        if (selectedPaths.has(path)) selectedPaths.delete(path);
        else selectedPaths.add(path);
        selectionChanged = true;
      } else {
        // Regular click: Just preview or navigate, don't touch selection
        if (item.isDir) {
          navigateTo(item.path);
        } else {
          preview(item.path);
        }
      }
      if (selectionChanged) updateSelectionClasses();
    };

    li.ondblclick = (e) => {
      if (item.isDir) navigateTo(item.path);
    };

    if (!item.isDir) {
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      const dl = document.createElement('button');
      dl.className = 'file-action icon-btn';
      dl.setAttribute('aria-label', 'Download');
      dl.title = 'Download';
      dl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l4-4m-4 4l-4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
      dl.onclick = (e) => {
        e.stopPropagation();
        downloadFile(item.path, item.name);
      };
      actions.appendChild(dl);
      li.appendChild(actions);
    }

    fragment.appendChild(li);
  });
  ul.appendChild(fragment);
}

function updateSelectionClasses() {
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('selected', selectedPaths.has(el.dataset.path));
  });
}

async function preview(path) {
  const previewDock = document.getElementById('previewDock');
  const previewDiv = document.getElementById('previewContent');
  const previewTitle = document.getElementById('previewTitle');
  const previewZoomOut = document.getElementById('previewZoomOut');
  const previewZoomIn = document.getElementById('previewZoomIn');
  previewPath = path;
  previewZoom = 0;
  previewIsImage = false;
  previewImageNaturalWidth = 0;
  previewImageNaturalHeight = 0;
  if (!path) {
    closePreview();
    return;
  }
  previewDock.classList.remove('hidden');
  document.body.classList.add('preview-open');
  previewTitle.textContent = baseName(path) || 'preview';
  previewDiv.innerHTML = '<div class="preview-empty">Loading...</div>';
  const url = fileUrl(path);
  const ext = path.split('.').pop().toLowerCase();

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    previewIsImage = true;
    previewZoomOut.classList.remove('hidden');
    previewZoomIn.classList.remove('hidden');
    const img = document.createElement('img');
    img.className = 'preview-image';
    img.src = url;
    img.onerror = () => { previewDiv.innerHTML = '<div class="preview-empty">Cannot load image</div>'; };
    img.onload = () => {
      previewImageNaturalWidth = img.naturalWidth || 0;
      previewImageNaturalHeight = img.naturalHeight || 0;
      updatePreviewZoom();
    };
    const stage = document.createElement('div');
    stage.className = 'preview-image-stage';
    previewDiv.innerHTML = '';
    previewDiv.classList.add('image-preview');
    stage.appendChild(img);
    previewDiv.appendChild(stage);
    updatePreviewZoom();
    return;
  }

  previewZoomOut.classList.add('hidden');
  previewZoomIn.classList.add('hidden');

  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) {
    const video = document.createElement('video');
    video.className = 'preview-video';
    video.controls = true;
    const source = document.createElement('source');
    source.src = url;
    video.appendChild(source);
    previewDiv.innerHTML = '';
    previewDiv.appendChild(video);
    return;
  }

  if (ext === 'pdf') {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    previewDiv.innerHTML = '';
    previewDiv.appendChild(frame);
    return;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Cannot fetch');
    const text = await res.text();
    const pre = document.createElement('pre');
    pre.className = 'preview-text';
    pre.textContent = text.slice(0, 500000);
    previewDiv.innerHTML = '';
    previewDiv.classList.remove('image-preview');
    previewDiv.appendChild(pre);
  } catch (e) {
    previewDiv.classList.remove('image-preview');
    previewDiv.innerHTML = '<div class="preview-empty">Preview not available</div>';
  }
}

function closePreview() {
  const previewDock = document.getElementById('previewDock');
  const previewDiv = document.getElementById('previewContent');
  const previewTitle = document.getElementById('previewTitle');
  const previewZoomOut = document.getElementById('previewZoomOut');
  const previewZoomIn = document.getElementById('previewZoomIn');
  previewPath = '';
  previewZoom = 0;
  previewIsImage = false;
  previewTitle.textContent = 'preview';
  previewDiv.innerHTML = '<div class="preview-empty">select a file</div>';
  previewDiv.classList.remove('image-preview');
  previewImageNaturalWidth = 0;
  previewImageNaturalHeight = 0;
  previewZoomOut.classList.add('hidden');
  previewZoomIn.classList.add('hidden');
  previewDock.classList.add('hidden');
  document.body.classList.remove('preview-open');
}

function clampPreviewZoom(value) {
  return Math.min(previewZoomMax, Math.max(previewZoomMin, value));
}

function updatePreviewZoom() {
  const previewImage = document.querySelector('#previewContent .preview-image');
  const previewStage = document.querySelector('#previewContent .preview-image-stage');
  const previewBody = document.getElementById('previewContent');
  if (!previewImage || !previewStage || !previewBody || !previewImageNaturalWidth || !previewImageNaturalHeight) return;
  const zoomFactor = Math.max(0.25, 1 + previewZoom);
  const availableWidth = Math.max(1, previewBody.clientWidth - 32);
  const availableHeight = Math.max(1, previewBody.clientHeight - 32);
  const fitScale = Math.min(availableWidth / previewImageNaturalWidth, availableHeight / previewImageNaturalHeight, 1);
  const scaledWidth = Math.max(1, Math.round(previewImageNaturalWidth * fitScale * zoomFactor));
  const scaledHeight = Math.max(1, Math.round(previewImageNaturalHeight * fitScale * zoomFactor));
  previewStage.style.width = `${scaledWidth}px`;
  previewStage.style.height = `${scaledHeight}px`;
}

function adjustPreviewZoom(delta) {
  previewZoom = clampPreviewZoom(previewZoom + delta);
  updatePreviewZoom();
}

function clampPreviewPosition(left, top) {
  const previewDock = document.getElementById('previewDock');
  const rect = previewDock.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  return {
    left: Math.min(Math.max(8, left), maxLeft),
    top: Math.min(Math.max(8, top), maxTop)
  };
}

function movePreviewTo(left, top) {
  const previewDock = document.getElementById('previewDock');
  const next = clampPreviewPosition(left, top);
  previewDock.style.left = `${next.left}px`;
  previewDock.style.top = `${next.top}px`;
}

function downloadFile(path, name) {
  const a = document.createElement('a');
  a.href = `/files/${encodeURIComponent(path)}`;
  a.download = name || baseName(path);
  a.click();
}

const uploadButton = document.getElementById('uploadButton');
const newFolderButton = document.getElementById('newFolderButton');
const backButton = document.getElementById('backButton');
const forwardButton = document.getElementById('forwardButton');
const previewZoomOut = document.getElementById('previewZoomOut');
const previewZoomIn = document.getElementById('previewZoomIn');
const previewClose = document.getElementById('previewClose');
const previewDownload = document.getElementById('previewDownload');
const previewDock = document.getElementById('previewDock');
const previewHead = previewDock.querySelector('.preview-head');
const contextMenuFile = document.getElementById('contextMenuFile');
const contextMenuEmpty = document.getElementById('contextMenuEmpty');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalInput = document.getElementById('modalInput');
const modalCancel = document.getElementById('modalCancel');
const modalOk = document.getElementById('modalOk');
const pathInput = document.getElementById('pathInput');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const sortDropdown = document.getElementById('sortDropdown');
const sortTrigger = document.getElementById('sortTrigger');
const sortMenu = document.getElementById('sortMenu');
const sortLabel = document.getElementById('sortLabel');
const gridViewBtn = document.getElementById('gridViewBtn');
const compactViewBtn = document.getElementById('compactViewBtn');

function closeSortDropdown() {
  sortDropdown.classList.remove('open');
  sortMenu.classList.add('hidden');
}

uploadButton.addEventListener('click', () => document.getElementById('fileInput').click());
newFolderButton.addEventListener('click', () => handleMenuAction('mkdir'));
backButton.addEventListener('click', goBack);
forwardButton.addEventListener('click', goForward);
previewZoomOut.addEventListener('click', () => adjustPreviewZoom(-previewZoomStep));
previewZoomIn.addEventListener('click', () => adjustPreviewZoom(previewZoomStep));
previewClose.addEventListener('click', closePreview);
previewDownload.addEventListener('click', () => {
  if (previewPath) downloadFile(previewPath, baseName(previewPath));
});

previewHead.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const rect = previewDock.getBoundingClientRect();
  previewDrag = {
    pointerId: e.pointerId,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top
  };
  previewHead.setPointerCapture(e.pointerId);
});

previewHead.addEventListener('pointermove', (e) => {
  if (!previewDrag || previewDrag.pointerId !== e.pointerId) return;
  movePreviewTo(e.clientX - previewDrag.offsetX, e.clientY - previewDrag.offsetY);
});

function endPreviewDrag(e) {
  if (!previewDrag || previewDrag.pointerId !== e.pointerId) return;
  previewDrag = null;
  if (previewHead.hasPointerCapture(e.pointerId)) {
    previewHead.releasePointerCapture(e.pointerId);
  }
}

previewHead.addEventListener('pointerup', endPreviewDrag);
previewHead.addEventListener('pointercancel', endPreviewDrag);

window.addEventListener('resize', () => {
  if (previewDock.classList.contains('hidden')) return;
  const rect = previewDock.getBoundingClientRect();
  movePreviewTo(rect.left, rect.top);
  if (previewIsImage) updatePreviewZoom();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  await uploadFiles(files);
  e.target.value = '';
});

pathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const raw = pathInput.value.trim();
    const path = raw.replace(/^\//, '');
    load(path);
  } else if (e.key === 'Escape') {
    document.getElementById('breadcrumb').classList.remove('hidden');
    pathInput.classList.add('hidden');
  }
});

const bcContainer = document.getElementById('breadcrumb');
bcContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('breadcrumb-item')) return;
  bcContainer.classList.add('hidden');
  pathInput.classList.remove('hidden');
  pathInput.focus();
  pathInput.select();
});

pathInput.addEventListener('blur', () => {
  bcContainer.classList.remove('hidden');
  pathInput.classList.add('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();
  if (!username || !password) {
    loginError.textContent = 'Username and password required';
    return;
  }
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    loginError.textContent = 'Invalid credentials';
    return;
  }
  isAuthed = true;
  loginOverlay.classList.add('hidden');
  loginUsername.value = '';
  loginPassword.value = '';
  await load(currentPath);
});

document.addEventListener('contextmenu', (e) => {
  const inModal = e.target.closest('.modal');
  const inMenu = e.target.closest('.context-menu');
  const inMain = e.target.closest('.main');
  if (inModal || inMenu || !inMain) return;
  e.preventDefault();
  const itemEl = e.target.closest('.file-item');
  if (itemEl) {
    contextTarget = {
      path: itemEl.dataset.path,
      isDir: itemEl.dataset.isDir === 'true'
    };
    openContextMenu(contextMenuFile, e.clientX, e.clientY);
  } else {
    contextTarget = null;
    openContextMenu(contextMenuEmpty, e.clientX, e.clientY);
  }
});

document.addEventListener('click', () => {
  closeContextMenu();
  closeSortDropdown();
});

modalCancel.addEventListener('click', () => closeModal(null));
modalOk.addEventListener('click', () => {
  if (modalInput.classList.contains('hidden')) {
    closeModal(true);
  } else {
    closeModal(modalInput.value.trim());
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal(null);
});

modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    closeModal(modalInput.value.trim());
  }
});

contextMenuFile.addEventListener('click', async (e) => {
  e.stopPropagation();
  const action = e.target.dataset.action;
  if (!action) return;
  await handleMenuAction(action);
  closeContextMenu();
});

contextMenuEmpty.addEventListener('click', async (e) => {
  e.stopPropagation();
  const action = e.target.dataset.action;
  if (!action) return;
  await handleMenuAction(action);
  closeContextMenu();
});

async function uploadFiles(files) {
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('path', currentPath);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.status === 201) {
        showToast(`Uploaded ${file.name}`);
      } else {
        showToast(`Upload failed: ${file.name}`, 'error');
      }
    } catch (e) {
      showToast(`Upload failed: ${file.name}`, 'error');
    }
  }
  load(currentPath);
}

function openContextMenu(menu, x, y) {
  if (menu === contextMenuFile) {
    const fileOnlyItems = menu.querySelectorAll('[data-action="preview"], [data-action="download"]');
    fileOnlyItems.forEach(item => item.classList.toggle('disabled', contextTarget && contextTarget.isDir));
  }
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  const nextX = Math.min(x, window.innerWidth - rect.width - 8);
  const nextY = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, nextX)}px`;
  menu.style.top = `${Math.max(8, nextY)}px`;
}

function closeContextMenu() {
  contextMenuFile.classList.add('hidden');
  contextMenuEmpty.classList.add('hidden');
}

async function handleMenuAction(action) {
  try {
    if (action === 'preview' && contextTarget && !contextTarget.isDir) {
      await preview(contextTarget.path);
      return;
    }
    if (action === 'download' && contextTarget && !contextTarget.isDir) {
      downloadFile(contextTarget.path, baseName(contextTarget.path));
      return;
    }
    if (action === 'rename' && contextTarget) {
      const currentName = baseName(contextTarget.path);
      const newName = await askInput('Rename', 'New name', currentName);
      if (!newName || newName === currentName) return;
      await apiPost('/api/rename', { path: contextTarget.path, newName: newName.trim() });
      showToast('Renamed');
      load(currentPath);
      return;
    }
    if (action === 'delete' && contextTarget) {
      const name = baseName(contextTarget.path);
      const ok = await askConfirm('Delete', `Delete ${name}?`);
      if (!ok) return;
      await apiPost('/api/delete', { path: contextTarget.path });
      showToast('Deleted');
      load(currentPath);
      return;
    }
    if (action === 'mkdir') {
      const folder = await askInput('New Folder', 'Folder name');
      if (!folder) return;
      const newPath = joinPath(currentPath, folder.trim());
      await apiPost('/api/mkdir', { path: newPath });
      showToast('Folder created');
      load(currentPath);
      return;
    }
    if (action === 'upload') {
      document.getElementById('fileInput').click();
    }
  } catch (e) {
    showToast(e.message || 'Action failed', 'error');
  }
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Request failed');
  }
}

function askInput(title, placeholder, value = '') {
  return new Promise((resolve) => {
    modalResolve = resolve;
    modalTitle.textContent = title;
    modalBody.textContent = '';
    modalInput.classList.remove('hidden');
    modalInput.placeholder = placeholder || '';
    modalInput.value = value || '';
    modalOk.textContent = 'OK';
    modal.classList.remove('hidden');
    modalInput.focus();
  });
}

function askConfirm(title, message) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    modalTitle.textContent = title;
    modalBody.textContent = message || '';
    modalInput.classList.add('hidden');
    modalInput.value = '';
    modalOk.textContent = 'Confirm';
    modal.classList.remove('hidden');
  });
}

function closeModal(result) {
  if (!modalResolve) return;
  modal.classList.add('hidden');
  const resolve = modalResolve;
  modalResolve = null;
  resolve(result);
}

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
  window.clearTimeout(searchTimer);
  const query = e.target.value.toLowerCase();
  searchTimer = window.setTimeout(() => {
    if (!query) {
      renderList(allItems);
      return;
    }
    const filtered = allItems.filter(item => item.name.toLowerCase().includes(query));
    renderList(filtered);
  }, 120);
});

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  updateThemeButton();
});

function updateThemeButton() {
  const isDark = document.body.classList.contains('dark-mode');
  const btn = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.innerHTML = isDark
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  }
  btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
}

// Load theme preference
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.remove('dark-mode');
} else {
  document.body.classList.add('dark-mode');
}

updateThemeButton();

// Layout toggle
function setLayout(layout) {
  currentLayout = layout;
  const fileListEl = document.getElementById('list');
  if (layout === 'compact') {
    fileListEl.classList.add('compact');
    gridViewBtn.classList.remove('active');
    compactViewBtn.classList.add('active');
  } else {
    fileListEl.classList.remove('compact');
    gridViewBtn.classList.add('active');
    compactViewBtn.classList.remove('active');
  }
  localStorage.setItem('layout', layout);
}

gridViewBtn.addEventListener('click', () => setLayout('grid'));
compactViewBtn.addEventListener('click', () => setLayout('compact'));

// Sort dropdown
const sortLabels = {
  'name-asc': 'Name A\u2013Z',
  'name-desc': 'Name Z\u2013A',
  'date-newest': 'Newest first',
  'date-oldest': 'Oldest first',
  'size-largest': 'Largest first',
  'size-smallest': 'Smallest first'
};

function setSortOption(sortKey) {
  currentSort = sortKey;
  sortLabel.textContent = sortLabels[sortKey] || sortKey;
  sortMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.sort === sortKey);
  });
  closeSortDropdown();
  localStorage.setItem('sort', sortKey);
  const query = document.getElementById('searchInput').value.toLowerCase();
  const items = query ? allItems.filter(i => i.name.toLowerCase().includes(query)) : allItems;
  renderList(items);
}

sortTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = sortDropdown.classList.contains('open');
  if (isOpen) {
    closeSortDropdown();
  } else {
    sortDropdown.classList.add('open');
    sortMenu.classList.remove('hidden');
  }
});

sortMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const item = e.target.closest('.dropdown-item');
  if (!item) return;
  setSortOption(item.dataset.sort);
});

// Load layout & sort preferences
const savedLayout = localStorage.getItem('layout');
if (savedLayout === 'compact' || savedLayout === 'grid') {
  setLayout(savedLayout);
}
const savedSort = localStorage.getItem('sort');
if (savedSort && sortLabels[savedSort]) {
  currentSort = savedSort;
  sortLabel.textContent = sortLabels[savedSort];
  sortMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.sort === savedSort);
  });
}

async function init() {
  initSelectionBox();
  isAuthed = await checkAuth();
  if (!isAuthed) {
    loginOverlay.classList.remove('hidden');
    loginUsername.focus();
    return;
  }
  loginOverlay.classList.add('hidden');
  load('');
}

function rectIntersects(r1, r2) {
  return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);
}

function initSelectionBox() {
  if (selectionBoxInitialized) return;
  selectionBoxInitialized = true;
  const list = document.getElementById('list');
  const box = document.createElement('div');
  box.className = 'selection-box';
  document.body.appendChild(box);

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const inMain = e.target.closest('.main');
    const inItem = e.target.closest('.file-item');
    const inControls = e.target.closest('.content-controls, .pathbar, .toolbar, .preview-dock, .context-menu, .modal');

    if (!inMain || inControls) return;

    if (!inItem) {
      selectedPaths.clear();
      updateSelectionClasses();
    }

    selectionDrag = {
      startX: e.clientX,
      startY: e.clientY,
      box: box,
      baseSelection: new Set(selectedPaths),
      hasMoved: false
    };
  });

  document.addEventListener('mousemove', (e) => {
    if (!selectionDrag) return;
    pendingSelectionEvent = e;
    if (selectionFrame) return;
    selectionFrame = window.requestAnimationFrame(() => {
      selectionFrame = 0;
      updateDragSelection(pendingSelectionEvent);
    });
  });

  function updateDragSelection(e) {
    if (!selectionDrag || !e) return;
    const { startX, startY, box } = selectionDrag;
    const left = Math.min(startX, e.clientX);
    const top = Math.min(startY, e.clientY);
    const width = Math.abs(startX - e.clientX);
    const height = Math.abs(startY - e.clientY);

    if (width > 5 || height > 5) {
      selectionDrag.hasMoved = true;
      box.style.display = 'block';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';

      const boxRect = box.getBoundingClientRect();
      const items = list.querySelectorAll('.file-item');
      if (!e.ctrlKey && !e.metaKey) {
        selectedPaths.clear();
      } else {
        selectedPaths = new Set(selectionDrag.baseSelection);
      }
      items.forEach(el => {
        const itemRect = el.getBoundingClientRect();
        if (rectIntersects(boxRect, itemRect)) {
          selectedPaths.add(el.dataset.path);
        }
      });
      updateSelectionClasses();
    }
  }

  document.addEventListener('mouseup', () => {
    if (selectionDrag) {
      if (selectionFrame) {
        window.cancelAnimationFrame(selectionFrame);
        selectionFrame = 0;
      }
      pendingSelectionEvent = null;
      selectionDrag.box.style.display = 'none';
      selectionDrag = null;
    }
  });
}

// Drag and drop upload
function initDragDrop() {
  const mainArea = document.getElementById('mainArea');
  const dropZone = document.getElementById('dropZone');
  let dragCounter = 0;
  mainArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.remove('hidden');
  });
  mainArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; dropZone.classList.add('hidden'); }
  });
  mainArea.addEventListener('dragover', (e) => e.preventDefault());
  mainArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.add('hidden');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) await uploadFiles(files);
  });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]')) return;
  if (e.key === 'Escape') {
    closePreview();
    closeContextMenu();
  }
  if (e.key === 'Delete' && selectedPaths.size > 0) {
    handleBulkDelete();
  }
});

async function handleBulkDelete() {
  const count = selectedPaths.size;
  const ok = await askConfirm('Delete', `Delete ${count} selected item${count > 1 ? 's' : ''}?`);
  if (!ok) return;
  for (const path of selectedPaths) {
    try { await apiPost('/api/delete', { path }); } catch (e) { showToast(`Failed to delete ${path}`, 'error'); }
  }
  selectedPaths.clear();
  showToast(`Deleted ${count} item${count > 1 ? 's' : ''}`);
  load(currentPath);
}

// Initial load
init();
initDragDrop();
