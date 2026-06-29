import { loadBackup, getImageUrl } from './backup-loader.js';

// ── State ─────────────────────────────────────────────────────────────────
const state = { backup: null, zip: null, imageCache: {}, pendingQR: null };

// ── Field config (lazy-loaded once) ───────────────────────────────────────
let fieldConfig = null;
async function getFieldConfig() {
  if (fieldConfig) return fieldConfig;
  const res = await fetch(new URL('./field-config.json', import.meta.url));
  fieldConfig = await res.json();
  return fieldConfig;
}

// ── Enums (lazy-loaded once) ──────────────────────────────────────────────
let enumsData = null;
async function getEnums() {
  if (enumsData) return enumsData;
  const res = await fetch(new URL('./enums.json', import.meta.url));
  enumsData = await res.json();
  return enumsData;
}

// ── Category display metadata ─────────────────────────────────────────────
const CATEGORY_META = {
  BOOKS: { label: 'Books', icon: '📚' },
  MUSIC: { label: 'Music', icon: '🎵' },
  VIDEO_GAMES: { label: 'Video Games', icon: '🎮' },
  COMICS: { label: 'Comics', icon: '📖' },
  MOVIES_TV: { label: 'Movies & TV', icon: '🎬' },
  FIGURES: { label: 'Figures', icon: '🗿' },
  TRADING_CARDS: { label: 'Trading Cards', icon: '🃏' },
  LEGO: { label: 'LEGO', icon: '🧱' },
  MODEL_KITS: { label: 'Model Kits', icon: '⚙️' },
  PLUSHIES: { label: 'Plushies', icon: '🧸' },
  DOLLS: { label: 'Dolls', icon: '🪆' },
  FUNKO_POPS: { label: 'Funko Pops', icon: '👾' },
  PINS_PATCHES: { label: 'Pins & Patches', icon: '📌' },
  STICKERS: { label: 'Stickers', icon: '🏷️' },
  KEYCHAINS: { label: 'Keychains', icon: '🔑' },
  CHARMS: { label: 'Charms', icon: '🔮' },
  MANGA: { label: 'Manga', icon: '📕' },
  PLANTS: { label: 'Plants', icon: '🌿' },
  BOARD_GAMES: { label: 'Board Games', icon: '🎲' },
  ANTIQUES: { label: 'Antiques', icon: '🏺' },
  ART_PRINTS: { label: 'Art Prints', icon: '🖼️' },
  AUTOGRAPHS: { label: 'Autographs', icon: '✍️' },
  BAGS_HANDBAGS: { label: 'Bags & Handbags', icon: '👜' },
  COINS_CURRENCY: { label: 'Coins & Currency', icon: '🪙' },
  CONCERT_EVENT_TICKETS: { label: 'Tickets', icon: '🎟️' },
  FOUNTAIN_PENS_STATIONARY: { label: 'Fountain Pens', icon: '✒️' },
  HATS: { label: 'Hats', icon: '🧢' },
  INSTRUMENTS: { label: 'Instruments', icon: '🎸' },
  JEWELRY: { label: 'Jewelry', icon: '💎' },
  MAGAZINES: { label: 'Magazines', icon: '📰' },
  ORIGINAL_ART: { label: 'Original Art', icon: '🎨' },
  PERFUMES_COLOGNES: { label: 'Perfumes & Colognes', icon: '🌸' },
  PHOTOGRAPHY: { label: 'Photography', icon: '📷' },
  PROPS_REPLICAS: { label: 'Props & Replicas', icon: '⚔️' },
  SNEAKERS: { label: 'Sneakers', icon: '👟' },
  SPORTS_CARDS: { label: 'Sports Cards', icon: '🏅' },
  SPORTS_EQUIPMENT: { label: 'Sports Equipment', icon: '⚽' },
  SPORTS_MEMORABILIA: { label: 'Sports Memorabilia', icon: '🏆' },
  STAMPS: { label: 'Stamps', icon: '📮' },
  TAROT_ORACLE_DECKS: { label: 'Tarot & Oracle', icon: '🔯' },
  TEA: { label: 'Tea', icon: '🍵' },
  VINTAGE_ELECTRONICS: { label: 'Vintage Electronics', icon: '📻' },
  VINTAGE_TOYS: { label: 'Vintage Toys', icon: '🪀' },
  WATCHES: { label: 'Watches', icon: '⌚' },
  WHISKEY_WINE_SAKE: { label: 'Drinks', icon: '🍶' },
};

// ── Helpers ───────────────────────────────────────────────────────────────
function snakeToCamel(key) {
  return key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function getItemTitle(item, enumKey, config) {
  const catConfig = config[enumKey];
  if (!catConfig) return item.name || item.title || '(Untitled)';
  const prop = snakeToCamel(catConfig.titleKey);
  return item[prop] || '(Untitled)';
}

function formatDate(ts) {
  if (!ts) return null;
  try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return String(ts); }
}

function formatFieldValue(value, fieldDef) {
  if (value === null || value === undefined || value === '') return null;
  switch (fieldDef.type) {
    case 'BOOLEAN':
      return { text: value ? 'Yes' : 'No', cls: value ? 'bool-yes' : 'bool-no' };
    case 'DATE': {
      const d = typeof value === 'number' ? formatDate(value) : String(value);
      return d ? { text: d } : null;
    }
    case 'TEXT_LIST':
      return Array.isArray(value) && value.length > 0 ? { tags: value } : null;
    case 'ENUM':
      return { text: String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    case 'IMAGE_URL': {
      const s = String(value);
      if (!s) return null;
      return (s.startsWith('http://') || s.startsWith('https://')) ? { link: s } : { text: s };
    }
    case 'BARCODE':
      return value ? { text: String(value), mono: true } : null;
    case 'TEXT_LONG':
      return value ? { text: String(value), multiline: true } : null;
    default:
      return value !== undefined ? { text: String(value) } : null;
  }
}

async function resolveItemImage(item) {
  const primary = item.primaryImage;
  const filePath = primary?.filePath ?? (typeof primary === 'string' ? primary : null);
  if (filePath) {
    if (state.imageCache[filePath]) return state.imageCache[filePath];
    const url = await getImageUrl(state.zip, filePath);
    if (url) { state.imageCache[filePath] = url; return url; }
  }
  // Fall back to HTTP cover image URLs from API enrichment
  return item.coverImageUrl || item.artworkImageUrl || item.imageUrl || null;
}

// ── DOM builder ───────────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else if (k === 'style') Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    e.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return e;
}

// ── Routing ───────────────────────────────────────────────────────────────
function navigate(hash) { window.location.hash = hash; }

async function router() {
  const hash = window.location.hash.slice(1) || 'landing';
  if (!state.backup && hash !== 'landing') { navigate('landing'); return; }

  const config = state.backup ? await getFieldConfig() : null;

  if (hash === 'landing' || !state.backup) { renderLanding(); return; }
  if (hash === 'browse') { renderCategories(config); return; }

  const catMatch = hash.match(/^browse\/([^/]+)$/);
  if (catMatch) { renderItems(decodeURIComponent(catMatch[1]), config); return; }

  const itemMatch = hash.match(/^browse\/([^/]+)\/(.+)$/);
  if (itemMatch) { renderDetail(decodeURIComponent(itemMatch[1]), decodeURIComponent(itemMatch[2]), config); return; }

  if (hash === 'search') { renderSearch(config); return; }
  if (hash === 'add') { renderAddCategoryPicker(config); return; }
  const addCatMatch = hash.match(/^add\/([^/]+)$/);
  if (addCatMatch) { const enums = await getEnums(); renderAddForm(decodeURIComponent(addCatMatch[1]), config, enums); return; }
  if (hash === 'qr') { renderQRView(); return; }

  renderLanding();
}

window.addEventListener('hashchange', () => router());

// ── Shared header ─────────────────────────────────────────────────────────
function renderHeader(crumbs = []) {
  const header = el('header', { className: 'app-header' });

  const logo = el('div', { className: 'logo-wrap' });
  logo.onclick = () => navigate(state.backup ? 'browse' : 'landing');
  logo.append(
    el('span', { className: 'logo-text' }, 'monomori'),
    el('span', { className: 'logo-jp' }, '物守り · web companion')
  );
  header.append(logo);

  if (crumbs.length) {
    const bc = el('nav', { className: 'breadcrumb' });
    crumbs.forEach((c, i) => {
      if (i > 0) bc.append(el('span', { className: 'sep' }, '›'));
      if (c.href != null) {
        const span = el('span', { className: 'crumb' }, c.label);
        span.onclick = e => { e.stopPropagation(); navigate(c.href); };
        bc.append(span);
      } else {
        bc.append(el('span', { className: 'bc-current' }, c.label));
      }
    });
    header.append(bc);
  }

  const right = el('div', { className: 'header-right' });
  if (state.backup) {
    const searchBtn = el('button', { className: 'header-icon-btn' }, '🔍');
    searchBtn.title = 'Search collection';
    searchBtn.onclick = () => navigate('search');
    right.append(searchBtn);
  }
  right.append(el('a', { href: 'https://monomori.app', className: 'site-link', target: '_blank', rel: 'noopener' }, 'monomori.app ↗'));
  header.append(right);

  return header;
}

// ── Landing ───────────────────────────────────────────────────────────────
function renderLanding() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(renderHeader());

  const fileInput = el('input', { type: 'file', accept: '.zip', style: { display: 'none' } });
  const errorDiv = el('div', { className: 'error-msg', style: { display: 'none' } });
  const dropText = el('p', {});
  dropText.innerHTML = 'Drop your backup ZIP here, or <strong>click to choose a file</strong>';

  const dropZone = el('div', { className: 'drop-zone' },
    el('div', { className: 'drop-icon' }, '📦'),
    dropText,
    fileInput
  );

  async function handleFile(file) {
    if (!file) return;
    dropText.textContent = 'Loading…';
    dropZone.style.opacity = '0.7';
    errorDiv.style.display = 'none';
    try {
      const { backupData, zip } = await loadBackup(file);
      state.backup = backupData;
      state.zip = zip;
      state.imageCache = {};
      navigate('browse');
    } catch (err) {
      dropText.innerHTML = 'Drop your backup ZIP here, or <strong>click to choose a file</strong>';
      dropZone.style.opacity = '1';
      errorDiv.textContent = err.message;
      errorDiv.style.display = 'block';
    }
  }

  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = () => handleFile(fileInput.files[0]);
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });

  const landing = el('div', { className: 'landing' },
    el('h1', {}, 'Browse your collection'),
    el('p', { className: 'subtitle' }, 'Load your Monomori backup ZIP to browse your collection and view item details. Nothing leaves your browser.'),
    dropZone,
    errorDiv
  );
  app.append(landing);
}

// ── Shared: resolve category data from a categoryKey ─────────────────────
function getCollectionItems(categoryKey) {
  const collections = state.backup?.content?.collections || {};
  const customMeta = state.backup?.content?.customCategoryMetadata || [];

  if (categoryKey.startsWith('CUSTOM_')) {
    const cid = categoryKey.slice(7);
    const all = collections['custom'] || [];
    const meta = customMeta.find(m => m.id === cid);
    return { items: all.filter(i => i.customCategoryId === cid), label: meta?.name || 'Custom', icon: '✨', enumKey: 'CUSTOM' };
  }
  const collKey = categoryKey.toLowerCase();
  const meta = CATEGORY_META[categoryKey] || {};
  return { items: collections[collKey] || [], label: meta.label || categoryKey, icon: meta.icon || '📦', enumKey: categoryKey };
}

// ── Categories ────────────────────────────────────────────────────────────
function renderCategories(config) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(renderHeader([{ label: 'My Collection' }]));

  const main = el('div', { className: 'main-content' });
  const collections = state.backup?.content?.collections || {};
  const customMeta = state.backup?.content?.customCategoryMetadata || [];
  const cats = [];

  for (const [key, items] of Object.entries(collections)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const enumKey = key.toUpperCase();
    if (enumKey === 'CUSTOM') {
      const groups = {};
      for (const item of items) {
        const cid = item.customCategoryId || '__unknown__';
        if (!groups[cid]) groups[cid] = [];
        groups[cid].push(item);
      }
      for (const [cid, groupItems] of Object.entries(groups)) {
        const meta = customMeta.find(m => m.id === cid);
        cats.push({ key: `CUSTOM_${cid}`, label: meta?.name || 'Custom', icon: '✨', count: groupItems.length });
      }
    } else {
      const meta = CATEGORY_META[enumKey] || {};
      cats.push({ key: enumKey, label: meta.label || enumKey, icon: meta.icon || '📦', count: items.length });
    }
  }

  const totalItems = state.backup?.metadata?.totalItems ?? cats.reduce((s, c) => s + c.count, 0);
  const addBtn = el('button', { className: 'btn', style: { marginLeft: 'auto' }, onclick: () => navigate('add') }, '+ Add Item');
  const header = el('div', { className: 'view-header' },
    el('h2', {}, 'My Collection'),
    el('span', { className: 'count' }, `${totalItems} items · ${cats.length} categor${cats.length !== 1 ? 'ies' : 'y'}`),
    addBtn
  );

  if (cats.length === 0) {
    main.append(header, el('div', { className: 'empty-state' }, el('div', { className: 'empty-icon' }, '📭'), el('p', {}, 'No items found in this backup.')));
    app.append(main);
    return;
  }

  const grid = el('div', { className: 'categories-grid' });
  for (const cat of cats) {
    const card = el('div', { className: 'glass-card category-card' },
      el('div', { className: 'cat-icon' }, cat.icon),
      el('div', { className: 'cat-name' }, cat.label),
      el('div', { className: 'cat-count' }, `${cat.count} item${cat.count !== 1 ? 's' : ''}`)
    );
    card.onclick = () => navigate(`browse/${encodeURIComponent(cat.key)}`);
    grid.append(card);
  }

  main.append(header, grid);
  app.append(main);
}

// ── Items list ────────────────────────────────────────────────────────────
async function renderItems(categoryKey, config) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const { items, label, icon, enumKey } = getCollectionItems(categoryKey);
  const catConfig = config[enumKey];

  app.append(renderHeader([
    { label: 'My Collection', href: 'browse' },
    { label }
  ]));

  const main = el('div', { className: 'main-content' });
  main.append(el('div', { className: 'view-header' },
    el('h2', {}, `${icon} ${label}`),
    el('span', { className: 'count' }, `${items.length} item${items.length !== 1 ? 's' : ''}`),
    el('button', { className: 'btn', style: { marginLeft: 'auto' }, onclick: () => navigate(`add/${encodeURIComponent(categoryKey)}`) }, '+ Add Item')
  ));

  if (items.length === 0) {
    main.append(el('div', { className: 'empty-state' }, el('div', { className: 'empty-icon' }, icon), el('p', {}, 'No items in this category.')));
    app.append(main);
    return;
  }

  // Pick one useful secondary field to show under the title
  const secondaryKey = catConfig?.fields
    .find(f => f.key !== catConfig.titleKey && f.key !== 'CUSTOM_FIELDS' && f.key !== 'TAGS' && f.type === 'TEXT_SHORT')
    ?.key;

  const grid = el('div', { className: 'items-grid' });

  for (const item of items) {
    const itemId = String(item.id);
    const title = getItemTitle(item, enumKey, config);

    const placeholder = el('div', { className: 'item-thumb-placeholder' }, icon);
    const info = el('div', { className: 'item-info' }, el('div', { className: 'item-title' }, title));

    if (secondaryKey) {
      const val = item[snakeToCamel(secondaryKey)];
      if (val) info.append(el('div', { className: 'item-meta' }, String(val)));
    }

    const card = el('div', { className: 'glass-card item-card' }, placeholder, info);
    card.onclick = () => navigate(`browse/${encodeURIComponent(categoryKey)}/${encodeURIComponent(itemId)}`);
    grid.append(card);

    // Lazy-load image after card is in DOM
    resolveItemImage(item).then(url => {
      if (!url) return;
      const img = el('img', { className: 'item-thumb', src: url, alt: title });
      placeholder.replaceWith(img);
    });
  }

  main.append(grid);
  app.append(main);
}

// ── Item detail ───────────────────────────────────────────────────────────
async function renderDetail(categoryKey, itemId, config) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const { items, label, icon, enumKey } = getCollectionItems(categoryKey);
  const item = items.find(i => String(i.id) === itemId);
  const title = item ? getItemTitle(item, enumKey, config) : '…';

  app.append(renderHeader([
    { label: 'My Collection', href: 'browse' },
    { label, href: `browse/${encodeURIComponent(categoryKey)}` },
    { label: title }
  ]));

  const main = el('div', { className: 'main-content' });

  if (!item) {
    main.append(el('div', { className: 'empty-state' }, el('div', { className: 'empty-icon' }, '🔍'), el('p', {}, 'Item not found.')));
    app.append(main);
    return;
  }

  const catConfig = config[enumKey];
  const layout = el('div', { className: 'detail-layout' });

  // ── Image column ──
  const imageCol = el('div', { className: 'detail-image-col' });
  const noImg = el('div', { className: 'glass-card no-image' },
    el('div', { className: 'no-image-icon' }, icon),
    el('span', {}, 'No image')
  );
  imageCol.append(noImg);
  resolveItemImage(item).then(url => {
    if (url) noImg.replaceWith(el('img', { src: url, alt: title }));
  });

  // ── Fields column ──
  const fieldsCol = el('div', { className: 'detail-fields-col' });
  fieldsCol.append(
    el('span', { className: 'detail-category-badge' }, `${icon} ${label}`),
    el('h1', { className: 'detail-title' }, title)
  );

  if (Array.isArray(item.tags) && item.tags.length > 0) {
    fieldsCol.append(el('div', { className: 'item-tags' }, ...item.tags.map(t => el('span', { className: 'tag' }, t))));
  }

  const fieldsDiv = el('div', {});

  function addRow(labelText, valueEl) {
    fieldsDiv.append(el('div', { className: 'field-row' },
      el('span', { className: 'field-label' }, labelText),
      valueEl
    ));
  }

  function addFormattedRow(labelText, formatted) {
    const valEl = el('span', { className: 'field-value' });
    if (formatted.tags) {
      valEl.classList.add('tag-list');
      formatted.tags.forEach(t => valEl.append(el('span', { className: 'tag' }, t)));
    } else if (formatted.link) {
      valEl.append(el('a', { href: formatted.link, target: '_blank', rel: 'noopener noreferrer' }, formatted.link));
    } else {
      if (formatted.multiline) valEl.classList.add('multiline');
      if (formatted.cls) valEl.classList.add(formatted.cls);
      if (formatted.mono) valEl.classList.add('mono');
      valEl.textContent = formatted.text;
    }
    addRow(labelText, valEl);
  }

  if (catConfig) {
    // Built-in category: iterate field config in order
    for (const field of catConfig.fields) {
      if (field.key === 'CUSTOM_FIELDS' || field.key === 'TAGS') continue;
      if (field.key === catConfig.titleKey) continue;
      const formatted = formatFieldValue(item[snakeToCamel(field.key)], field);
      if (formatted) addFormattedRow(field.label, formatted);
    }
  } else {
    // Custom category: read user-defined fields from customFields.fields array
    const customFields = item.customFields?.fields;
    if (Array.isArray(customFields)) {
      for (const cf of customFields) {
        if (cf.value == null || cf.value === '') continue;
        addRow(cf.fieldName || cf.fieldId, el('span', { className: 'field-value' }, String(cf.value)));
      }
    }
    if (item.notes) addRow('Notes', el('span', { className: 'field-value multiline' }, item.notes));
  }

  if (item.dateAdded) {
    addRow('Date Added', el('span', { className: 'field-value' }, formatDate(item.dateAdded)));
  }

  fieldsCol.append(fieldsDiv);
  layout.append(imageCol, fieldsCol);
  main.append(layout);
  app.append(main);
}

// ── Search ────────────────────────────────────────────────────────────────
function renderSearch(config) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(renderHeader([{ label: 'Search' }]));

  const main = el('div', { className: 'main-content' });
  const searchInput = el('input', { type: 'search', className: 'field-input search-input', placeholder: 'Search your collection…' });
  const resultsDiv = el('div', {});

  function doSearch(query) {
    resultsDiv.innerHTML = '';
    const q = query.trim().toLowerCase();
    if (!q) return;

    const collections = state.backup?.content?.collections || {};
    const customMeta = state.backup?.content?.customCategoryMetadata || [];
    const matches = [];

    for (const [key, items] of Object.entries(collections)) {
      if (!Array.isArray(items)) continue;
      const enumKey = key.toUpperCase();

      for (const item of items) {
        let categoryKey, label, icon;
        if (enumKey === 'CUSTOM') {
          const cid = item.customCategoryId || '__unknown__';
          const meta = customMeta.find(m => m.id === cid);
          categoryKey = `CUSTOM_${cid}`;
          label = meta?.name || 'Custom';
          icon = '✨';
        } else {
          const meta = CATEGORY_META[enumKey] || {};
          categoryKey = enumKey;
          label = meta.label || enumKey;
          icon = meta.icon || '📦';
        }

        const title = getItemTitle(item, enumKey === 'CUSTOM' ? 'CUSTOM' : enumKey, config);
        const inTitle = title.toLowerCase().includes(q);
        const inTags = Array.isArray(item.tags) && item.tags.some(t => t.toLowerCase().includes(q));
        if (inTitle || inTags) matches.push({ item, categoryKey, label, icon, title });
      }
    }

    if (matches.length === 0) {
      resultsDiv.append(el('div', { className: 'empty-state' },
        el('div', { className: 'empty-icon' }, '🔍'),
        el('p', {}, `No results for "${query}"`)
      ));
      return;
    }

    resultsDiv.append(el('div', { className: 'view-header' },
      el('span', { className: 'count' }, `${matches.length} result${matches.length !== 1 ? 's' : ''}`)
    ));

    const list = el('div', { className: 'search-list' });
    for (const { item, categoryKey, label, icon, title } of matches) {
      const row = el('div', { className: 'glass-card search-result' },
        el('span', { className: 'search-result-icon' }, icon),
        el('div', { className: 'search-result-info' },
          el('div', { className: 'search-result-title' }, title),
          el('div', { className: 'search-result-cat' }, label)
        )
      );
      row.onclick = () => navigate(`browse/${encodeURIComponent(categoryKey)}/${encodeURIComponent(String(item.id))}`);
      list.append(row);
    }
    resultsDiv.append(list);
  }

  let debounce;
  searchInput.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => doSearch(searchInput.value), 180); };

  main.append(searchInput, resultsDiv);
  app.append(main);
  setTimeout(() => searchInput.focus(), 50);
}

// ── Add Item — category picker ────────────────────────────────────────────
function renderAddCategoryPicker(config) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(renderHeader([
    { label: 'My Collection', href: 'browse' },
    { label: 'Add Item' }
  ]));

  const main = el('div', { className: 'main-content' });
  main.append(el('div', { className: 'view-header' },
    el('h2', {}, 'Choose a Category'),
    el('span', { className: 'count' }, 'Select the type of item you want to add')
  ));

  const grid = el('div', { className: 'categories-grid' });

  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    const card = el('div', { className: 'glass-card category-card' },
      el('div', { className: 'cat-icon' }, meta.icon),
      el('div', { className: 'cat-name' }, meta.label)
    );
    card.onclick = () => navigate(`add/${encodeURIComponent(key)}`);
    grid.append(card);
  }

  const customMeta = state.backup?.content?.customCategoryMetadata || [];
  for (const cm of customMeta) {
    const card = el('div', { className: 'glass-card category-card' },
      el('div', { className: 'cat-icon' }, '✨'),
      el('div', { className: 'cat-name' }, cm.name || 'Custom')
    );
    card.onclick = () => navigate(`add/${encodeURIComponent('CUSTOM_' + cm.id)}`);
    grid.append(card);
  }

  main.append(grid);
  app.append(main);
}

// ── Add Item — form ───────────────────────────────────────────────────────
function renderAddForm(categoryKey, config, enums) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const isCustom = categoryKey.startsWith('CUSTOM_');
  let catLabel, catIcon, fields, enumKey;

  if (isCustom) {
    const cid = categoryKey.slice(7);
    const customMeta = state.backup?.content?.customCategoryMetadata || [];
    const meta = customMeta.find(m => m.id === cid);
    catLabel = meta?.name || 'Custom';
    catIcon = '✨';
    enumKey = 'CUSTOM';
  } else {
    const meta = CATEGORY_META[categoryKey] || {};
    catLabel = meta.label || categoryKey;
    catIcon = meta.icon || '📦';
    enumKey = categoryKey;
  }

  fields = (config[enumKey]?.fields || []).filter(f =>
    f.key !== 'CUSTOM_FIELDS' && f.key !== 'TAGS' && f.type !== 'IMAGE_URL'
  );
  const required = fields.filter(f => f.required);
  const optional = fields.filter(f => !f.required);

  app.append(renderHeader([
    { label: 'My Collection', href: 'browse' },
    { label: 'Add Item', href: 'add' },
    { label: catLabel }
  ]));

  const main = el('div', { className: 'main-content' });
  main.append(el('div', { className: 'view-header' },
    el('h2', {}, `${catIcon} Add ${catLabel}`)
  ));

  const form = el('form', { className: 'glass-card add-form' });
  form.onsubmit = e => e.preventDefault();

  const fieldValues = {};

  function buildFieldInput(field) {
    const wrap = el('div', { className: 'form-field' });
    const labelEl = el('label', { className: 'form-label' }, field.label);
    if (field.required) labelEl.append(el('span', { className: 'required-star' }, '*'));
    wrap.append(labelEl);

    if (field.type === 'ENUM') {
      const enumValues = field.enumClass ? (enums[field.enumClass] || []) : [];
      const select = el('select', { className: 'field-input' });
      select.append(el('option', { value: '' }, '— select —'));
      for (const v of enumValues) {
        const optLabel = v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        select.append(el('option', { value: v }, optLabel));
      }
      select.onchange = () => { fieldValues[field.key] = select.value || undefined; };
      wrap.append(select);
    } else if (field.type === 'BOOLEAN') {
      const toggleWrap = el('div', { className: 'toggle-wrap' });
      const cb = el('input', { type: 'checkbox', className: 'toggle-input' });
      const lbl = el('span', { className: 'toggle-label' }, 'No');
      cb.onchange = () => { fieldValues[field.key] = cb.checked; lbl.textContent = cb.checked ? 'Yes' : 'No'; };
      toggleWrap.append(cb, lbl);
      wrap.append(toggleWrap);
      fieldValues[field.key] = false;
    } else if (field.type === 'TEXT_LONG') {
      const ta = document.createElement('textarea');
      ta.className = 'field-input';
      ta.placeholder = `Enter ${field.label.toLowerCase()}…`;
      ta.rows = 4;
      ta.oninput = () => { fieldValues[field.key] = ta.value || undefined; };
      wrap.append(ta);
    } else if (field.type === 'TEXT_LIST') {
      const tagStore = [];
      const tagListEl = el('div', { className: 'tag-list-edit' });

      function refreshTags() {
        tagListEl.innerHTML = '';
        tagStore.forEach((t, i) => {
          const rmBtn = el('span', { className: 'tag-remove' }, '×');
          rmBtn.onclick = () => { tagStore.splice(i, 1); fieldValues[field.key] = tagStore.length ? [...tagStore] : undefined; refreshTags(); };
          tagListEl.append(el('span', { className: 'tag-edit' }, t, rmBtn));
        });
      }

      const tagInput = el('input', { type: 'text', className: 'field-input', placeholder: 'Type a value and press Enter or Add…' });
      tagInput.style.flex = '1';
      const addTagBtn = el('button', { type: 'button', className: 'tag-add-btn' }, 'Add');

      function addTag() {
        const v = tagInput.value.trim();
        if (!v) return;
        tagStore.push(v);
        fieldValues[field.key] = [...tagStore];
        tagInput.value = '';
        refreshTags();
      }
      tagInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } };
      addTagBtn.onclick = addTag;

      const tagRow = el('div', { className: 'tag-input-row' }, tagInput, addTagBtn);
      wrap.append(el('div', { className: 'tag-input-wrap' }, tagListEl, tagRow));
    } else if (field.type === 'NUMBER_INT' || field.type === 'NUMBER_DECIMAL') {
      const input = el('input', { type: 'number', className: 'field-input', placeholder: `Enter ${field.label.toLowerCase()}…`, step: field.type === 'NUMBER_DECIMAL' ? 'any' : '1' });
      input.oninput = () => { fieldValues[field.key] = input.value || undefined; };
      wrap.append(input);
    } else if (field.type === 'DATE') {
      const input = el('input', { type: 'date', className: 'field-input' });
      input.oninput = () => { fieldValues[field.key] = input.value || undefined; };
      wrap.append(input);
    } else {
      const input = el('input', { type: 'text', className: 'field-input', placeholder: `Enter ${field.label.toLowerCase()}…` });
      input.oninput = () => { fieldValues[field.key] = input.value || undefined; };
      wrap.append(input);
    }
    return wrap;
  }

  if (required.length > 0) {
    const section = el('div', { className: 'form-section' });
    section.append(el('div', { className: 'form-section-title' }, 'Required'));
    for (const f of required) section.append(buildFieldInput(f));
    form.append(section);
  }

  if (optional.length > 0) {
    const section = el('div', { className: 'form-section' });
    section.append(el('div', { className: 'form-section-title' }, 'Optional'));
    for (const f of optional) section.append(buildFieldInput(f));
    form.append(section);
  }

  const formError = el('div', { className: 'form-error', style: { display: 'none' } });
  const generateBtn = el('button', { type: 'button', className: 'btn' }, '✨ Generate QR Code');
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary' }, 'Cancel');
  cancelBtn.onclick = () => history.back();

  generateBtn.onclick = () => {
    const missing = required.filter(f => {
      const v = fieldValues[f.key];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    if (missing.length > 0) {
      formError.textContent = `Please fill in: ${missing.map(f => f.label).join(', ')}`;
      formError.style.display = 'block';
      return;
    }
    formError.style.display = 'none';
    const payload = buildQRPayload(categoryKey, fieldValues, config, enumKey);
    state.pendingQR = { categoryKey, payload, catLabel, catIcon };
    navigate('qr');
  };

  form.append(formError, el('div', { className: 'form-actions' }, generateBtn, cancelBtn));
  main.append(form);
  app.append(main);
}

// ── Build QR payload ──────────────────────────────────────────────────────
function buildQRPayload(categoryKey, fieldValues, config, enumKey) {
  const payload = {};

  if (categoryKey.startsWith('CUSTOM_')) {
    payload.category = 'CUSTOM';
    const cid = categoryKey.slice(7);
    const meta = (state.backup?.content?.customCategoryMetadata || []).find(m => m.id === cid);
    if (meta?.name) payload.CATEGORY_NAME = meta.name;
  } else {
    payload.category = categoryKey;
  }

  const catFields = config[enumKey]?.fields || [];

  for (const [key, value] of Object.entries(fieldValues)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') { payload[key] = value; continue; }
    if (Array.isArray(value)) {
      if (value.length > 0) payload[key] = value.slice(0, 5).join(', ');
      continue;
    }
    if (typeof value === 'string') {
      const field = catFields.find(f => f.key === key);
      const limit = field?.type === 'TEXT_LONG' ? 200 : 150;
      payload[key] = value.length > limit ? value.slice(0, limit) + '…' : value;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

// ── QR display ────────────────────────────────────────────────────────────
function renderQRView() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  if (!state.pendingQR) { navigate('browse'); return; }
  const { categoryKey, payload, catLabel, catIcon } = state.pendingQR;

  app.append(renderHeader([
    { label: 'My Collection', href: 'browse' },
    { label: 'Add Item', href: 'add' },
    { label: catLabel, href: `add/${encodeURIComponent(categoryKey)}` },
    { label: 'Scan QR' }
  ]));

  const jsonStr = JSON.stringify(payload);
  const deepLink = `monomori://additem?data=${encodeURIComponent(jsonStr)}`;

  const main = el('div', { className: 'main-content' });
  const view = el('div', { className: 'qr-view' });

  view.append(
    el('h2', {}, `${catIcon} Scan to Add`),
    el('p', { className: 'subtitle' }, 'Open Monomori on your Android device and scan this QR code to add the item with your details pre-filled.')
  );

  if (deepLink.length > 900) {
    view.append(el('div', { className: 'qr-warning' }, `⚠ This QR code is large (${deepLink.length} characters). If it won't scan, go back and shorten any long text fields.`));
  }

  const qrWrap = el('div', { className: 'qr-code-wrap' });
  view.append(qrWrap);

  try {
    new QRCode(qrWrap, {
      text: deepLink,
      width: 280,
      height: 280,
      colorDark: '#000000',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch {
    qrWrap.textContent = 'QR generation failed — payload may be too large.';
    qrWrap.style.cssText = 'background:#1A0033;color:#ff8a80;padding:20px;';
  }

  const entries = Object.entries(payload).filter(([k]) => k !== 'category' && k !== 'CATEGORY_NAME');
  if (entries.length > 0) {
    const summary = el('div', { className: 'qr-payload-summary' });
    summary.append(el('h3', {}, 'Item details encoded in QR'));
    const fieldsDiv = el('div', {});
    for (const [key, value] of entries) {
      fieldsDiv.append(el('div', { className: 'field-row' },
        el('span', { className: 'field-label' }, key.replace(/_/g, ' ')),
        el('span', { className: 'field-value' }, String(value))
      ));
    }
    summary.append(fieldsDiv);
    view.append(summary);
  }

  const backBtn = el('button', { className: 'btn btn-secondary', onclick: () => history.back() }, '← Edit Details');
  const doneBtn = el('button', { className: 'btn', onclick: () => { state.pendingQR = null; navigate('browse'); } }, 'Done');
  view.append(el('div', { className: 'form-actions' }, backBtn, doneBtn));

  main.append(view);
  app.append(main);
}

// ── Boot ──────────────────────────────────────────────────────────────────
router();
