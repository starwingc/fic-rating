// The ?v= query string on every local import/link (kept in sync across
// index.html and these imports) exists purely to bust GitHub Pages' 10-min
// browser cache on deploy — mobile Safari has no real hard-refresh gesture,
// so without this a phone can keep serving yesterday's JS after an update.
import * as GH from './github-api.js?v=2';
import * as Works from './works.js?v=2';
import * as Tags from './tags.js?v=2';
import { todayStr } from './date-utils.js?v=2';

const VIEWS = ['list', 'add', 'settings'];

const CONTENT_RATINGS = [
  { value: 'G', label: 'General Audiences' },
  { value: 'T', label: 'Teen And Up Audiences' },
  { value: 'M', label: 'Mature' },
  { value: 'E', label: 'Explicit' },
  { value: 'not-rated', label: '未分级' }
];
const CATEGORIES = [
  { value: 'F/F', label: 'F/F' },
  { value: 'F/M', label: 'F/M' },
  { value: 'Gen', label: 'Gen' },
  { value: 'M/M', label: 'M/M' },
  { value: 'Multi', label: 'Multi' },
  { value: 'Other', label: 'Other' },
  { value: 'none', label: '未分类' }
];
const WARNINGS = [
  { value: 'not-chosen', label: '作者选择不标注' },
  { value: 'warning-applies', label: '适用警告' },
  { value: 'no-warning', label: '无警告' },
  { value: 'external-work', label: '外部作品' }
];
const STATUSES = [
  { value: 'wip', label: '连载中' },
  { value: 'complete', label: '已完结' },
  { value: 'unknown', label: '未知' }
];

let toastTimer = null;
function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const state = {
  data: null,
  mode: 'local',
  error: null,
  filters: { contentRating: new Set(), category: new Set(), warning: new Set(), status: new Set() },
  filtersOpen: false,
  searchQuery: '',
  sortBy: 'dateAdded',
  sortDir: 'desc',
  editingId: null
};

function statusText() {
  if (state.error) return `同步失败: ${state.error}`;
  const modeLabel = state.mode === 'local' ? '本地模式(未配置 GitHub)' : 'GitHub 已同步';
  const t = state.data?.meta?.lastUpdated ? new Date(state.data.meta.lastUpdated).toLocaleString() : '';
  return `${modeLabel}${t ? ' · 上次更新 ' + t : ''}`;
}

function setSyncStatus(text) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = text;
}

async function refreshData() {
  setSyncStatus('同步中…');
  try {
    const { data, mode } = await GH.loadData();
    state.data = data;
    state.mode = mode;
    state.error = null;
  } catch (e) {
    state.error = e.message;
    state.data = state.data || GH.emptyData();
  }
  setSyncStatus(statusText());
}

async function applyMutation(fn) {
  setSyncStatus('保存中…');
  try {
    const { data, mode } = await GH.mutate((current) => fn({ ...current }) || current);
    state.data = data;
    state.mode = mode;
    state.error = null;
  } catch (e) {
    state.error = e.message;
  }
  setSyncStatus(statusText());
  route();
}

function route() {
  const view = location.hash.replace('#', '') || 'list';
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`)?.classList.toggle('active', v === view);
    document.querySelector(`.nav-btn[data-view="${v}"]`)?.classList.toggle('active', v === view);
  });
  if (view === 'list') renderListView();
  else if (view === 'add') renderFormView();
  else if (view === 'settings') renderSettingsView();
}

// ---------- badges (shared visual language: bordered glyph badges, no color) ----------

function contentRatingBadge(value) {
  if (!value || value === 'not-rated') return '<span class="badge badge-blank" title="未分级"></span>';
  return `<span class="badge">${value}</span>`;
}

function categoryBadges(categories) {
  if (!categories || categories.length === 0) return '<span class="badge badge-blank" title="未分类"></span>';
  return categories.map((c) => `<span class="badge">${escapeHtml(c)}</span>`).join('');
}

function warningBadge(value, detail) {
  if (!value || value === 'no-warning') return '<span class="badge badge-blank" title="无警告"></span>';
  const glyphs = { 'not-chosen': '?', 'warning-applies': '!', 'external-work': 'EXT' };
  const text = glyphs[value] || '?';
  const titleAttr = value === 'warning-applies' && detail ? ` title="${escapeHtml(detail)}"` : '';
  return `<span class="badge"${titleAttr}>${text}</span>`;
}

function statusBadge(value) {
  if (value === 'wip') return '<span class="badge">WIP</span>';
  if (value === 'complete') return '<span class="badge">■</span>';
  return '<span class="badge badge-blank" title="未知"></span>';
}

function optionBadge(facet, value) {
  if (facet === 'contentRating') return contentRatingBadge(value);
  if (facet === 'category') return value === 'none' ? '<span class="badge badge-blank"></span>' : `<span class="badge">${escapeHtml(value)}</span>`;
  if (facet === 'warning') return warningBadge(value);
  if (facet === 'status') return statusBadge(value);
  return '';
}

function starsReadOnly(rating) {
  const n = Math.max(0, Math.min(5, rating || 0));
  let s = '';
  for (let i = 1; i <= 5; i += 1) s += i <= n ? '★' : '☆';
  return `<span class="stars" aria-label="评分 ${n} / 5 星">${s}</span>`;
}

function starsInteractive(rating) {
  const n = Math.max(0, Math.min(5, rating || 0));
  let btns = '';
  for (let i = 1; i <= 5; i += 1) {
    btns += `<button type="button" class="star-btn" data-action="set-rating" data-value="${i}" aria-label="评为 ${i} 星">${i <= n ? '★' : '☆'}</button>`;
  }
  return `<div class="star-picker" role="group" aria-label="我的评分">${btns}</div>`;
}

// ---------- list view ----------

function activeFilterCount() {
  return ['contentRating', 'category', 'warning', 'status'].reduce((sum, f) => sum + state.filters[f].size, 0);
}

function checkboxGroup(facet, options, selectedSet) {
  return options.map((opt) => {
    const checked = selectedSet.has(opt.value) ? 'checked' : '';
    return `<label class="filter-opt"><input type="checkbox" data-filter="${facet}" value="${opt.value}" ${checked}>${optionBadge(facet, opt.value)} ${escapeHtml(opt.label)}</label>`;
  }).join('');
}

function renderWorkCard(w) {
  const titleHtml = w.url
    ? `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.title || '(无标题)')}</a>`
    : escapeHtml(w.title || '(无标题)');
  const metaParts = [w.author || '佚名'];
  if (w.fandom && w.fandom.length) metaParts.push(w.fandom.join(' / '));
  if (w.relationship && w.relationship.length) metaParts.push(w.relationship.join('、'));
  return `
    <div class="work-card" data-id="${w.id}">
      <div class="wc-head">
        <div class="wc-title">${titleHtml}</div>
        ${starsReadOnly(w.rating)}
      </div>
      <div class="wc-meta">${metaParts.map(escapeHtml).join(' · ')}</div>
      <div class="wc-badges">
        ${contentRatingBadge(w.contentRating)}
        ${categoryBadges(w.category)}
        ${warningBadge(w.warning, w.warningDetail)}
        ${statusBadge(w.status)}
      </div>
      ${w.tags && w.tags.length ? `<div class="wc-tags">${w.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${w.notes ? `<div class="wc-notes">${escapeHtml(w.notes)}</div>` : ''}
      <div class="wc-actions">
        <button type="button" class="act" data-action="edit" data-id="${w.id}">编辑</button>
        <button type="button" class="act" data-action="delete" data-id="${w.id}">删除</button>
      </div>
    </div>`;
}

function renderListView() {
  const container = document.getElementById('view-list');
  if (!container || !state.data) return;

  const focusedId = document.activeElement?.id;
  const selStart = document.activeElement?.selectionStart;

  const works = Works.sortWorks(
    Works.filterWorks(state.data.works, state.filters, state.searchQuery),
    state.sortBy,
    state.sortDir
  );
  const cloud = Tags.buildTagCloud(state.data.works, 'tags').slice(0, 15);
  const count = activeFilterCount();

  container.innerHTML = `
    <details class="filter-panel" ${state.filtersOpen ? 'open' : ''}>
      <summary>筛选${count ? ` (${count})` : ''}</summary>
      <fieldset><legend>Rating</legend>${checkboxGroup('contentRating', CONTENT_RATINGS, state.filters.contentRating)}</fieldset>
      <fieldset><legend>Category</legend>${checkboxGroup('category', CATEGORIES, state.filters.category)}</fieldset>
      <fieldset><legend>Warning</legend>${checkboxGroup('warning', WARNINGS, state.filters.warning)}</fieldset>
      <fieldset><legend>完结状态</legend>${checkboxGroup('status', STATUSES, state.filters.status)}</fieldset>
      ${count ? '<button type="button" class="link-btn" data-action="clear-filters">清空筛选</button>' : ''}
    </details>
    <div class="search-row">
      <input type="search" id="search-input" placeholder="搜索标题/作者/Fandom/CP/标签…" value="${escapeHtml(state.searchQuery)}">
      <select id="sort-select">
        <option value="dateAdded-desc" ${state.sortBy === 'dateAdded' && state.sortDir === 'desc' ? 'selected' : ''}>最近添加</option>
        <option value="dateUpdated-desc" ${state.sortBy === 'dateUpdated' && state.sortDir === 'desc' ? 'selected' : ''}>最近更新</option>
        <option value="rating-desc" ${state.sortBy === 'rating' && state.sortDir === 'desc' ? 'selected' : ''}>评分从高到低</option>
        <option value="title-asc" ${state.sortBy === 'title' && state.sortDir === 'asc' ? 'selected' : ''}>标题 A-Z</option>
      </select>
    </div>
    ${cloud.length ? `<div class="tag-cloud">${cloud.map((t) => `<button type="button" class="chip" data-action="tag-search" data-value="${escapeHtml(t.value)}">${escapeHtml(t.value)} (${t.count})</button>`).join('')}</div>` : ''}
    <div class="worklist-meta">${works.length} 篇</div>
    <div class="work-list">${works.length ? works.map(renderWorkCard).join('') : '<p class="muted">还没有记录，去"添加"里录入第一条吧</p>'}</div>
  `;

  if (focusedId === 'search-input') {
    const el = document.getElementById('search-input');
    el.focus();
    if (selStart != null) el.setSelectionRange(selStart, selStart);
  }
}

// ---------- tag-chip input (comma/Enter to commit, click × or Backspace to remove) ----------
// Reused for every free-text-list field on the form (additional tags, fandom,
// relationship/CP) — any of them can hold more than one value (crossovers,
// multi-ship works), not just the "additional tags" field.

function tagChipHtml(tag) {
  return `<span class="tag-chip" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<button type="button" class="tag-chip-remove" data-action="remove-tag" aria-label="删除标签 ${escapeHtml(tag)}">×</button></span>`;
}

function tagInputHtml(hiddenName, tags, placeholder) {
  return `
    <div class="tag-input">
      <div class="tag-chips">${(tags || []).map(tagChipHtml).join('')}</div>
      <input type="text" class="tag-input-field" placeholder="${escapeHtml(placeholder)}">
      <input type="hidden" name="${hiddenName}" value="${escapeHtml(Tags.formatTagInput(tags))}">
    </div>`;
}

function syncTagsHidden(container) {
  const tags = [...container.querySelectorAll('.tag-chip')].map((el) => el.dataset.tag);
  container.querySelector('input[type="hidden"]').value = tags.join(', ');
}

// Accepts the raw (possibly multi-tag, comma/顿号/newline-separated) text
// typed or pasted into the field, reusing the same parser the form submit
// path uses, so "already has this tag" dedup and trimming stay identical
// whether a tag was committed via this widget or typed straight into the
// hidden field on a very old draft.
function addTagsFromInput(container, rawValue) {
  const parsed = Tags.parseTagInput(rawValue);
  if (parsed.length === 0) return;
  const existing = new Set([...container.querySelectorAll('.tag-chip')].map((el) => el.dataset.tag));
  const chipsWrap = container.querySelector('.tag-chips');
  parsed.forEach((tag) => {
    if (existing.has(tag)) return;
    existing.add(tag);
    chipsWrap.insertAdjacentHTML('beforeend', tagChipHtml(tag));
  });
  syncTagsHidden(container);
}

// ---------- form view (shared by add / edit) ----------

function renderFormView() {
  const container = document.getElementById('view-add');
  if (!container || !state.data) return;
  const editing = state.editingId ? Works.getWork(state.data, state.editingId) : null;
  const draft = editing || Works.createWork();

  container.innerHTML = `
    <h2>${editing ? '编辑作品' : '添加作品'}</h2>
    <form id="work-form" data-rating="${draft.rating}">
      <label>标题</label>
      <input name="title" required value="${escapeHtml(draft.title)}">

      <label>作者</label>
      <input name="author" value="${escapeHtml(draft.author)}">

      <label>链接(可选，AO3/Lofter/晋江等任意来源)</label>
      <input name="url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://...">

      <label>Fandom(原创作品可以直接加"原创"标签；支持多个，用于合集/crossover)</label>
      ${tagInputHtml('fandomInput', draft.fandom, '输入 Fandom 后按逗号或回车，可添加多个')}

      <label>CP/关系(可选，支持多个)</label>
      ${tagInputHtml('relationshipInput', draft.relationship, '输入 CP 后按逗号或回车，可添加多个')}

      <label>附加标签(输入后按逗号或回车确认，没有的标签会自动创建)</label>
      ${tagInputHtml('tagsInput', draft.tags, '输入标签后按逗号或回车')}

      <label>Rating</label>
      <div class="radio-row">${CONTENT_RATINGS.map((o) => `<label class="radio-opt"><input type="radio" name="contentRating" value="${o.value}" ${draft.contentRating === o.value ? 'checked' : ''}>${optionBadge('contentRating', o.value)} ${escapeHtml(o.label)}</label>`).join('')}</div>

      <label>Category(可多选)</label>
      <div class="checkbox-row">${CATEGORIES.filter((o) => o.value !== 'none').map((o) => `<label class="checkbox-opt"><input type="checkbox" name="category" value="${o.value}" ${draft.category.includes(o.value) ? 'checked' : ''}>${optionBadge('category', o.value)} ${escapeHtml(o.label)}</label>`).join('')}</div>

      <label>Archive Warning</label>
      <div class="radio-row">${WARNINGS.map((o) => `<label class="radio-opt"><input type="radio" name="warning" value="${o.value}" ${draft.warning === o.value ? 'checked' : ''}>${optionBadge('warning', o.value)} ${escapeHtml(o.label)}</label>`).join('')}</div>
      <input name="warningDetail" value="${escapeHtml(draft.warningDetail)}" placeholder="警告细节(如 Major Character Death)，仅在选中"适用警告"时有意义">

      <label>完结状态</label>
      <div class="radio-row">${STATUSES.map((o) => `<label class="radio-opt"><input type="radio" name="status" value="${o.value}" ${draft.status === o.value ? 'checked' : ''}>${optionBadge('status', o.value)} ${escapeHtml(o.label)}</label>`).join('')}</div>

      <label>我的评分</label>
      ${starsInteractive(draft.rating)}

      <label>锐评/笔记</label>
      <textarea name="notes" placeholder="写点什么...">${escapeHtml(draft.notes)}</textarea>

      <label>添加日期</label>
      <input name="dateAdded" type="date" value="${draft.dateAdded}">

      <div class="btn-row">
        <button type="submit" class="act on">${editing ? '保存修改' : '添加'}</button>
        ${editing ? '<button type="button" class="act" data-action="cancel-edit">取消</button>' : ''}
      </div>
    </form>
  `;
}

async function handleFormSubmit(form) {
  const fd = new FormData(form);
  const warning = fd.get('warning') || 'not-chosen';
  const fandom = Tags.parseTagInput(fd.get('fandomInput'));
  const fields = {
    title: fd.get('title').trim(),
    author: fd.get('author').trim(),
    url: fd.get('url').trim(),
    fandom: fandom.length ? fandom : ['原创'],
    relationship: Tags.parseTagInput(fd.get('relationshipInput')),
    tags: Tags.parseTagInput(fd.get('tagsInput')),
    contentRating: fd.get('contentRating') || 'not-rated',
    category: fd.getAll('category'),
    warning,
    warningDetail: warning === 'warning-applies' ? fd.get('warningDetail').trim() : '',
    status: fd.get('status') || 'unknown',
    rating: Number(form.dataset.rating) || 1,
    notes: fd.get('notes').trim(),
    dateAdded: fd.get('dateAdded') || todayStr()
  };
  const editingId = state.editingId;
  await applyMutation((data) => (editingId ? Works.updateWork(data, editingId, fields) : Works.addWork(data, fields)));
  state.editingId = null;
  showToast(editingId ? '已保存修改' : '已添加');
  location.hash = '#list';
}

// ---------- settings view ----------

function renderSettingsView() {
  const container = document.getElementById('view-settings');
  if (!container) return;
  const cfg = GH.getConfig();

  container.innerHTML = `
    <h2>设置</h2>
    <section class="card">
      <label>GitHub 用户名 (owner)</label>
      <input id="cfg-owner" value="${escapeHtml(cfg.owner || '')}" placeholder="例如 starwingc">
      <label>仓库名 (repo)</label>
      <input id="cfg-repo" value="${escapeHtml(cfg.repo || '')}" placeholder="fic-rating">
      <label>分支</label>
      <input id="cfg-branch" value="${escapeHtml(cfg.branch || 'main')}">
      <label>文件路径</label>
      <input id="cfg-path" value="${escapeHtml(cfg.path || 'data.json')}">
      <label>Personal Access Token</label>
      <div class="token-row">
        <input id="cfg-token" type="password" value="${escapeHtml(cfg.token || '')}" placeholder="github_pat_...">
        <button type="button" id="btn-toggle-token" class="act">显示</button>
      </div>
      <div class="btn-row">
        <button type="button" id="btn-save-cfg" class="act on">保存并同步</button>
      </div>
      <p class="muted">${cfg.token ? '已保存 token(可随时改后重新保存)' : '尚未保存 token，当前为本地模式'} · ${statusText()}</p>
    </section>
    <section class="card">
      <h3>备份</h3>
      <div class="btn-row">
        <button type="button" id="btn-export" class="act">导出 JSON</button>
        <button type="button" id="btn-import" class="act">导入 JSON</button>
        <input type="file" id="file-import" accept="application/json" class="hidden">
      </div>
    </section>
  `;

  document.getElementById('btn-toggle-token').onclick = (e) => {
    const input = document.getElementById('cfg-token');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.target.textContent = showing ? '显示' : '隐藏';
  };
  document.getElementById('btn-save-cfg').onclick = async () => {
    GH.saveConfig({
      owner: document.getElementById('cfg-owner').value.trim(),
      repo: document.getElementById('cfg-repo').value.trim(),
      branch: document.getElementById('cfg-branch').value.trim() || 'main',
      path: document.getElementById('cfg-path').value.trim() || 'data.json',
      token: document.getElementById('cfg-token').value.trim()
    });
    await refreshData();
    renderSettingsView();
  };
  document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fic-rating-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
  document.getElementById('file-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    await applyMutation(() => imported);
    renderSettingsView();
  };
}

// ---------- delegated events (bound once in init(), never inside render functions) ----------

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = `#${btn.dataset.view}`; });
  });
}

function bindAppEvents() {
  const app = document.getElementById('app');

  app.addEventListener('click', (e) => {
    const starBtn = e.target.closest('.star-btn');
    if (starBtn) {
      const form = starBtn.closest('form');
      const value = Number(starBtn.dataset.value);
      form.dataset.rating = value;
      form.querySelectorAll('.star-btn').forEach((b, i) => {
        b.textContent = i + 1 <= value ? '★' : '☆';
        b.setAttribute('aria-label', `评为 ${i + 1} 星`);
      });
      return;
    }

    const cancelBtn = e.target.closest('[data-action="cancel-edit"]');
    if (cancelBtn) {
      state.editingId = null;
      location.hash = '#list';
      return;
    }

    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
      state.editingId = editBtn.dataset.id;
      location.hash = '#add';
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete"]');
    if (deleteBtn) {
      if (!window.confirm('确定删除这条记录吗？')) return;
      applyMutation((data) => Works.deleteWork(data, deleteBtn.dataset.id));
      return;
    }

    const clearBtn = e.target.closest('[data-action="clear-filters"]');
    if (clearBtn) {
      state.filters = { contentRating: new Set(), category: new Set(), warning: new Set(), status: new Set() };
      renderListView();
      return;
    }

    const tagChip = e.target.closest('[data-action="tag-search"]');
    if (tagChip) {
      state.searchQuery = tagChip.dataset.value;
      renderListView();
      return;
    }

    const removeTagBtn = e.target.closest('[data-action="remove-tag"]');
    if (removeTagBtn) {
      const chip = removeTagBtn.closest('.tag-chip');
      const container = chip.closest('.tag-input');
      chip.remove();
      syncTagsHidden(container);
    }
  });

  // Comma/Enter commits the typed text as one or more tag chips (reusing
  // Tags.parseTagInput so pasted "a, b, c" text splits into separate chips
  // too); both must preventDefault or the comma would land in the field and
  // Enter would submit the whole form instead of just adding a tag.
  app.addEventListener('keydown', (e) => {
    if (!e.target.matches('.tag-input-field')) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTagsFromInput(e.target.closest('.tag-input'), e.target.value);
      e.target.value = '';
      return;
    }
    if (e.key === 'Backspace' && e.target.value === '') {
      const container = e.target.closest('.tag-input');
      const chips = container.querySelectorAll('.tag-chip');
      if (chips.length) {
        chips[chips.length - 1].remove();
        syncTagsHidden(container);
      }
    }
  });

  // Commits any text left in the field (typed but never confirmed with a
  // comma/Enter) when focus leaves it — otherwise clicking straight from
  // the tag field to the submit button would silently drop that last tag.
  app.addEventListener('focusout', (e) => {
    if (!e.target.matches('.tag-input-field')) return;
    if (!e.target.value.trim()) return;
    addTagsFromInput(e.target.closest('.tag-input'), e.target.value);
    e.target.value = '';
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'work-form') return;
    e.preventDefault();
    handleFormSubmit(e.target);
  });

  app.addEventListener('change', (e) => {
    const filterBox = e.target.closest('input[type="checkbox"][data-filter]');
    if (filterBox) {
      const set = state.filters[filterBox.dataset.filter];
      if (filterBox.checked) set.add(filterBox.value);
      else set.delete(filterBox.value);
      renderListView();
      return;
    }
    if (e.target.id === 'sort-select') {
      const [sortBy, sortDir] = e.target.value.split('-');
      state.sortBy = sortBy;
      state.sortDir = sortDir;
      renderListView();
    }
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      state.searchQuery = e.target.value;
      renderListView();
    }
  });

  // 'toggle' does not bubble, but a capturing listener on an ancestor still
  // sees it during the capture phase, so this can stay delegated instead of
  // being re-bound on the <details> element every time the list re-renders.
  document.addEventListener('toggle', (e) => {
    if (e.target.matches('.filter-panel')) {
      state.filtersOpen = e.target.open;
    }
  }, true);
}

async function init() {
  bindNav();
  bindAppEvents();
  window.addEventListener('hashchange', route);
  await refreshData();
  route();
}

init();
