import { todayStr } from './date-utils.js';

export function createWork(fields = {}) {
  const today = todayStr();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    author: '',
    url: '',
    fandom: [],
    relationship: [],
    tags: [],
    rating: 1,
    notes: '',
    contentRating: 'not-rated',
    category: [],
    warning: 'not-chosen',
    warningDetail: '',
    status: 'unknown',
    dateAdded: today,
    dateUpdated: today,
    ...fields
  };
}

export function addWork(data, fields) {
  return { ...data, works: [...data.works, createWork(fields)] };
}

export function updateWork(data, id, patch) {
  const idx = data.works.findIndex((w) => w.id === id);
  if (idx === -1) return data;
  const works = [...data.works];
  works[idx] = { ...works[idx], ...patch, dateUpdated: todayStr() };
  return { ...data, works };
}

export function deleteWork(data, id) {
  return { ...data, works: data.works.filter((w) => w.id !== id) };
}

export function getWork(data, id) {
  return data.works.find((w) => w.id === id);
}

function matchesQuery(work, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [work.title, work.author, ...(work.fandom || []), ...(work.relationship || []), ...(work.tags || [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function matchesSetFacet(work, field, set) {
  if (!set || set.size === 0) return true;
  return set.has(work[field]);
}

function matchesCategory(work, set) {
  if (!set || set.size === 0) return true;
  const cats = work.category || [];
  if (set.has('none') && cats.length === 0) return true;
  return cats.some((c) => set.has(c));
}

export function filterWorks(works, filters = {}, query = '') {
  return works.filter((w) =>
    matchesSetFacet(w, 'contentRating', filters.contentRating) &&
    matchesCategory(w, filters.category) &&
    matchesSetFacet(w, 'warning', filters.warning) &&
    matchesSetFacet(w, 'status', filters.status) &&
    matchesQuery(w, query)
  );
}

const SORT_KEYS = {
  dateAdded: (w) => w.dateAdded || '',
  dateUpdated: (w) => w.dateUpdated || '',
  rating: (w) => w.rating || 0,
  title: (w) => (w.title || '').toLowerCase()
};

export function sortWorks(works, sortBy = 'dateAdded', dir = 'desc') {
  const key = SORT_KEYS[sortBy] || SORT_KEYS.dateAdded;
  const sorted = [...works].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  if (dir === 'desc') sorted.reverse();
  return sorted;
}
