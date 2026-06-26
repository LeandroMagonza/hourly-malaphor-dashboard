'use strict';

// Dashboard estático: lee y escribe la cola del repo PRIVADO vía GitHub API,
// usando un token que el usuario pega y que queda solo en su navegador.

const CONFIG_KEY = 'malaphor-dash-config';
const DEFAULTS = { owner: 'LeandroMagonza', repo: 'hourly-malaphor', branch: 'main', token: '' };
const LANGS = ['es', 'en'];

let config = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
const shas = {}; // lang -> sha del archivo (o null si no existe)
const queues = {}; // lang -> entries[]

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64enc = (str) => btoa(unescape(encodeURIComponent(str)));
const b64dec = (b64) => decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));

function setStatus(msg, kind = '') {
  const el = $('#status');
  el.textContent = msg;
  el.className = kind;
}

async function api(path, opts = {}) {
  return fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + config.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}

async function getQueue(lang) {
  const ref = encodeURIComponent(config.branch);
  const res = await api(`/repos/${config.owner}/${config.repo}/contents/queue/${lang}.json?ref=${ref}`);
  if (res.status === 404) {
    shas[lang] = null;
    return [];
  }
  if (!res.ok) throw new Error(`GET ${lang}: ${res.status} — ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  shas[lang] = data.sha;
  const arr = JSON.parse(b64dec(data.content));
  return Array.isArray(arr) ? arr : [];
}

async function putQueue(lang, entries, message) {
  const body = {
    message,
    content: b64enc(JSON.stringify(entries, null, 2) + '\n'),
    branch: config.branch,
  };
  if (shas[lang]) body.sha = shas[lang];
  const res = await api(`/repos/${config.owner}/${config.repo}/contents/queue/${lang}.json`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) throw new Error('conflict');
  if (!res.ok) throw new Error(`PUT ${lang}: ${res.status} — ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  shas[lang] = data.content.sha;
}

// Read-modify-write: relee la versión más nueva, aplica el cambio por id y
// reintenta si alguien (Actions u otra pestaña) escribió en el medio.
async function mutate(lang, mutator, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const entries = await getQueue(lang);
    if (mutator(entries) === false) {
      queues[lang] = entries;
      return;
    }
    try {
      await putQueue(lang, entries, message);
      queues[lang] = entries;
      return;
    } catch (e) {
      if (e.message === 'conflict') continue;
      throw e;
    }
  }
  throw new Error('Conflicto persistente al guardar. Recargá e intentá de nuevo.');
}

function selectedText(e) {
  if (e.selectedIndex === -1 && e.customText) return e.customText.trim();
  const i = e.selectedIndex;
  if (i >= 0 && i < e.candidates.length) return e.candidates[i];
  return e.candidates[e.judgeIndex] ?? e.candidates[0] ?? '';
}

function render() {
  const main = $('#queues');
  if (!config.token) {
    main.innerHTML = '<p class="hint">Pegá tu token de GitHub en Configuración para cargar la cola.</p>';
    return;
  }
  main.innerHTML = '';
  for (const lang of LANGS) {
    const entries = queues[lang] || [];
    const unrev = entries.filter((e) => !e.reviewed).length;
    const section = document.createElement('section');
    section.innerHTML = `<h2>${lang.toUpperCase()} <small>${entries.length} en cola · ${unrev} sin revisar</small></h2>`;
    if (!entries.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Cola vacía (todavía no se generó nada).';
      section.appendChild(p);
    }
    entries.forEach((e, pos) => section.appendChild(renderEntry(lang, e, pos)));
    main.appendChild(section);
  }
}

function renderEntry(lang, e, pos) {
  const div = document.createElement('div');
  div.className = 'entry' + (e.reviewed ? ' reviewed' : '');
  div.dataset.lang = lang;
  div.dataset.id = e.id;
  const name = `sel-${lang}-${e.id}`;
  const opts = e.candidates
    .map(
      (c, i) => `
      <label class="opt${e.selectedIndex === i ? ' sel' : ''}">
        <input type="radio" name="${name}" data-index="${i}" ${e.selectedIndex === i ? 'checked' : ''} />
        <span>${esc(c)}</span>${i === e.judgeIndex ? '<em>juez</em>' : ''}
      </label>`
    )
    .join('');
  const customVal = e.selectedIndex === -1 ? esc(e.customText || '') : '';
  const turns = pos === 0 ? 'sale en el próximo envío' : `sale en ${pos + 1}.º turno`;
  div.innerHTML = `
    <div class="head">
      <span class="id">#${e.id}</span>
      <span class="badge">${e.reviewed ? '✓ revisada' : 'sin revisar'}</span>
      <span class="pos">${turns}</span>
    </div>
    <div class="sources"><b>A</b>${esc(e.a)} &nbsp; <b>B</b>${esc(e.b)}</div>
    <div class="options">
      ${opts}
      <label class="opt custom${e.selectedIndex === -1 ? ' sel' : ''}">
        <input type="radio" name="${name}" data-index="-1" ${e.selectedIndex === -1 ? 'checked' : ''} />
        <input type="text" class="custom" placeholder="escribí la tuya…" value="${customVal}" />
      </label>
    </div>
    <div class="actions">
      <button data-action="save">Guardar</button>
      <button data-action="delete" class="danger">Borrar</button>
    </div>`;
  return div;
}

document.addEventListener('input', (ev) => {
  if (ev.target.classList.contains('custom')) {
    ev.target.closest('.opt').querySelector('input[type=radio]').checked = true;
  }
});

document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const entryEl = btn.closest('.entry');
  const lang = entryEl.dataset.lang;
  const id = Number(entryEl.dataset.id);
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === 'delete') {
      if (!confirm(`¿Borrar la entrada #${id} (${lang})?`)) {
        btn.disabled = false;
        return;
      }
      await mutate(
        lang,
        (entries) => {
          const i = entries.findIndex((x) => x.id === id);
          if (i === -1) return false;
          entries.splice(i, 1);
        },
        `dashboard: borra #${id} (${lang})`
      );
      setStatus(`Borrada #${id} (${lang}).`, 'ok');
    } else if (action === 'save') {
      const checked = entryEl.querySelector('input[type=radio]:checked');
      const index = Number(checked.dataset.index);
      const customText = entryEl.querySelector('.custom').value.trim();
      if (index === -1 && !customText) {
        setStatus('Escribí un texto para la opción propia.', 'err');
        btn.disabled = false;
        return;
      }
      await mutate(
        lang,
        (entries) => {
          const e = entries.find((x) => x.id === id);
          if (!e) return false;
          e.selectedIndex = index;
          e.customText = index === -1 ? customText : null;
          e.reviewed = true;
        },
        `dashboard: revisa #${id} (${lang})`
      );
      setStatus(`Guardada #${id} (${lang}).`, 'ok');
    }
    render();
  } catch (e) {
    setStatus('Error: ' + e.message, 'err');
    btn.disabled = false;
  }
});

function bindSettings() {
  $('#owner').value = config.owner;
  $('#repo').value = config.repo;
  $('#branch').value = config.branch;
  $('#token').value = config.token;
  $('#save-settings').addEventListener('click', () => {
    config = {
      owner: $('#owner').value.trim(),
      repo: $('#repo').value.trim(),
      branch: $('#branch').value.trim() || 'main',
      token: $('#token').value.trim(),
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    setStatus('Configuración guardada.', 'ok');
    reload();
  });
  $('#reload').addEventListener('click', reload);
}

async function reload() {
  render();
  if (!config.token) {
    setStatus('Falta el token.', 'err');
    return;
  }
  setStatus('Cargando…');
  try {
    for (const lang of LANGS) queues[lang] = await getQueue(lang);
    render();
    setStatus('Cola cargada.', 'ok');
  } catch (e) {
    setStatus('Error al cargar: ' + e.message, 'err');
  }
}

bindSettings();
reload();
