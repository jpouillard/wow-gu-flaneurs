// La Taverne des Flâneurs : affichage du roster et de l'évolution des membres.
// Données : data/roster.json, data/history.json, data/guild.json (générées par GitHub Actions).

const MAX_LEVEL = 60;
const MAX_SELECTED = 8;

const CLASSES = {
  1: { name: 'Guerrier', color: '#C69B6D' },
  2: { name: 'Paladin', color: '#F48CBA' },
  3: { name: 'Chasseur', color: '#AAD372' },
  4: { name: 'Voleur', color: '#FFF468' },
  5: { name: 'Prêtre', color: '#FFFFFF' },
  7: { name: 'Chaman', color: '#0070DD' },
  8: { name: 'Mage', color: '#3FC7EB' },
  9: { name: 'Démoniste', color: '#8788EE' },
  11: { name: 'Druide', color: '#FF7C0A' },
};
// 95 = Skyborne (nouvelle race de WoW Forever), nom renvoyé par l'API en fr_FR
const RACES = { 1: 'Humain', 3: 'Nain', 4: 'Elfe de la nuit', 7: 'Gnome', 95: 'Éolide de l’Ordre suprême' };
// Couleurs lisibles sur fond parchemin pour les courbes
const SERIES = ['#8c2f1b', '#1f5f8b', '#3b7a2a', '#7a3d8f', '#b06a00', '#0f766e', '#a3214f', '#4b3a8c'];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (id) => CLASSES[id] ?? { name: 'Inconnue', color: '#999999' };

// ---------- Dates (AAAA-MM-JJ) ----------
const addDays = (d, n) => {
  const t = new Date(d + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const fmtShort = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtLong = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} : ${res.status}`);
  return res.json();
}

// ---------- Historique ----------
function levelAt(char, date) {
  if (!char || date < char.joined) return null;
  if (char.left && date >= char.left) return null;
  let lvl = null;
  for (const [d, l] of char.levels) {
    if (d <= date) lvl = l;
    else break;
  }
  return lvl;
}

function weeklyGain(char, today) {
  if (!char) return 0;
  const cur = levelAt(char, today) ?? char.levels.at(-1)[1];
  const ref = levelAt(char, addDays(today, -7)) ?? char.levels[0][1];
  return Math.max(0, cur - ref);
}

// ---------- Rendu ----------
function renderStats(roster, history, today) {
  const levels = roster.members.map((m) => m.level);
  const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const week = roster.members.reduce((s, m) => s + weeklyGain(history.characters[m.key], today), 0);
  const set = (k, v) => ($(`[data-stat="${k}"]`).textContent = v);
  set('members', roster.members.length);
  set('avg', avg.toFixed(1).replace('.', ','));
  set('maxed', levels.filter((l) => l >= MAX_LEVEL).length);
  set('week', `+${week}`);
}

function renderClassBars(members) {
  const counts = {};
  members.forEach((m) => (counts[m.classId] = (counts[m.classId] ?? 0) + 1));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#class-bars').innerHTML = entries
    .map(([id, n]) => `<span style="width:${(n / members.length) * 100}%;background:${cls(id).color}" title="${cls(id).name} : ${n}"></span>`)
    .join('');
  const legend = document.createElement('div');
  legend.className = 'class-legend';
  legend.innerHTML = entries.map(([id, n]) => `<span><i style="background:${cls(id).color}"></i>${cls(id).name} · ${n}</span>`).join('');
  $('#class-bars').after(legend);

  const sel = $('#f-class');
  entries
    .slice()
    .sort((a, b) => cls(a[0]).name.localeCompare(cls(b[0]).name))
    .forEach(([id]) => sel.insertAdjacentHTML('beforeend', `<option value="${id}">${cls(id).name}</option>`));
}

function memberCard(m, gain) {
  const c = cls(m.classId);
  const className = m.className ?? c.name;
  const race = m.raceName ?? RACES[m.raceId] ?? '';
  const initial = esc(m.name[0]);
  const avatar = m.avatar
    ? `<img class="avatar" src="${esc(m.avatar)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=avatar>${initial}</div>'">`
    : `<div class="avatar" aria-hidden="true">${initial}</div>`;
  return `
    <article class="member ${m.level >= MAX_LEVEL ? 'maxed' : ''}" style="--cls:${c.color}">
      ${avatar}
      <div>
        <div class="member-name">${esc(m.name)}</div>
        ${m.surname ? `<div class="member-surname">${esc(m.surname)}</div>` : ''}
        <div class="member-meta">${esc(race)} ${esc(className)}${m.ilvl ? ` · iLvl ${m.ilvl}` : ''}</div>
        <span class="member-rank">${esc(m.rankName)}</span>
      </div>
      <div class="member-level">
        <small>niv.</small><b>${m.level}</b>
        ${gain > 0 ? `<span class="gain" title="Niveaux gagnés sur 7 jours">▲ ${gain}</span>` : ''}
      </div>
      <div class="level-bar" aria-hidden="true"><span style="width:${(m.level / MAX_LEVEL) * 100}%"></span></div>
    </article>`;
}

function setupRoster(roster, history, today) {
  const gains = Object.fromEntries(roster.members.map((m) => [m.key, weeklyGain(history.characters[m.key], today)]));
  const render = () => {
    const q = $('#f-search').value.trim().toLowerCase();
    const c = $('#f-class').value;
    const sort = $('#f-sort').value;
    const list = roster.members
      .filter((m) => (!q || `${m.name} ${m.surname ?? ''}`.toLowerCase().includes(q)) && (!c || String(m.classId) === c))
      .sort((a, b) => {
        if (sort === 'level') return b.level - a.level || a.name.localeCompare(b.name);
        if (sort === 'gain') return gains[b.key] - gains[a.key] || b.level - a.level;
        if (sort === 'name') return a.name.localeCompare(b.name);
        return a.rank - b.rank || b.level - a.level || a.name.localeCompare(b.name);
      });
    $('#roster-grid').innerHTML = list.map((m) => memberCard(m, gains[m.key])).join('');
    $('#roster-empty').hidden = list.length > 0;
  };
  ['#f-search', '#f-class', '#f-sort'].forEach((s) => $(s).addEventListener('input', render));
  render();

  const up = new Date(roster.updatedAt);
  $('#roster-updated').textContent =
    `${roster.members.length} membres · mis à jour le ${up.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${up.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function renderLeaderboard(roster, history, today) {
  const top = roster.members
    .map((m) => ({ m, gain: weeklyGain(history.characters[m.key], today) }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain || b.m.level - a.m.level)
    .slice(0, 8);
  $('#leaderboard').innerHTML = top.length
    ? top
        .map(({ m, gain }) => `
          <li>
            <span><span class="lb-name">${esc(m.name)}</span>
            <span class="lb-sub">${esc(m.className ?? cls(m.classId).name)} · niveau ${m.level - gain} → ${m.level}</span></span>
            <span class="lb-gain">+${gain} niv.</span>
          </li>`)
        .join('')
    : '<li class="muted">Pas encore assez d\'historique : revenez dans quelques jours !</li>';
}

const chartFont = { family: "'Lora', Georgia, serif" };

function renderGuildChart(history) {
  const d = history.guildDaily;
  if (!window.Chart || !d.length) return;
  new Chart($('#chart-guild'), {
    data: {
      labels: d.map((x) => fmtShort(x.date)),
      datasets: [
        { type: 'line', label: 'Niveau moyen', data: d.map((x) => x.avgLevel), yAxisID: 'y', borderColor: '#8c2f1b', backgroundColor: '#8c2f1b', tension: 0.3, pointRadius: 2, borderWidth: 2.5 },
        { type: 'bar', label: 'Membres', data: d.map((x) => x.members), yAxisID: 'y1', backgroundColor: 'rgba(156, 113, 40, .28)', borderRadius: 4 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#2b1d10', font: chartFont } } },
      scales: {
        x: { ticks: { color: '#5a4630', font: chartFont, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
        y: { position: 'left', min: 0, max: MAX_LEVEL, title: { display: true, text: 'Niveau moyen', color: '#5a4630' }, ticks: { color: '#5a4630' }, grid: { color: 'rgba(90,70,48,.15)' } },
        y1: { position: 'right', min: 0, title: { display: true, text: 'Membres', color: '#5a4630' }, ticks: { color: '#5a4630', precision: 0 }, grid: { display: false } },
      },
    },
  });
}

function setupMembersChart(roster, history, today) {
  const days = history.guildDaily.map((x) => x.date);
  const keys = Object.keys(history.characters).filter((k) => !history.characters[k].left);
  const byName = keys.slice().sort((a, b) => history.characters[a].name.localeCompare(history.characters[b].name));
  const presets = {
    top: () => keys.slice().sort((a, b) => weeklyGain(history.characters[b], today) - weeklyGain(history.characters[a], today)).slice(0, 5),
    highest: () => keys.slice().sort((a, b) => (history.characters[b].levels.at(-1)[1]) - (history.characters[a].levels.at(-1)[1])).slice(0, 5),
    none: () => [],
  };
  let selected = presets.top();

  const chart = window.Chart && days.length
    ? new Chart($('#chart-members'), {
        type: 'line',
        data: { labels: days.map(fmtShort), datasets: [] },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: { labels: { color: '#2b1d10', font: chartFont, usePointStyle: true } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label} : niveau ${c.parsed.y}` } },
          },
          scales: {
            x: { ticks: { color: '#5a4630', font: chartFont, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
            y: { min: 0, max: MAX_LEVEL, ticks: { color: '#5a4630', stepSize: 10 }, grid: { color: 'rgba(90,70,48,.15)' }, title: { display: true, text: 'Niveau', color: '#5a4630' } },
          },
        },
      })
    : null;

  const update = () => {
    if (chart) {
      chart.data.datasets = selected.map((k, i) => {
        const c = history.characters[k];
        const color = SERIES[i % SERIES.length];
        return {
          label: c.name,
          data: days.map((d) => levelAt(c, d)),
          borderColor: color,
          backgroundColor: color,
          tension: 0.25,
          pointRadius: 2.5,
          borderWidth: 2.5,
          spanGaps: false,
        };
      });
      chart.update();
    }
    $('#member-chips').innerHTML = byName
      .map((k) => {
        const c = history.characters[k];
        const i = selected.indexOf(k);
        const border = i >= 0 ? SERIES[i % SERIES.length] : cls(c.classId).color;
        return `<button class="chip" style="--cls:${border}" aria-pressed="${i >= 0}" data-key="${esc(k)}">${esc(c.name)}</button>`;
      })
      .join('');
  };

  $('#member-chips').addEventListener('click', (e) => {
    const k = e.target.closest('.chip')?.dataset.key;
    if (!k) return;
    if (selected.includes(k)) selected = selected.filter((x) => x !== k);
    else if (selected.length < MAX_SELECTED) selected = [...selected, k];
    update();
  });
  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      selected = presets[b.dataset.preset]();
      update();
    })
  );
  update();
}

function renderFeed(history) {
  const ICON = { level: '⬆️', max: '🏆', join: '🍺', leave: '🚪' };
  const name = (k) => `<strong>${esc(history.characters[k]?.name ?? k)}</strong>`;
  const text = (e) => {
    if (e.type === 'level') return e.level - e.from > 1 ? `${name(e.key)} passe du niveau ${e.from} au ${e.level}` : `${name(e.key)} atteint le niveau ${e.level}`;
    if (e.type === 'max') return `${name(e.key)} atteint le niveau ${e.level} ! Tournée générale !`;
    if (e.type === 'join') return `${name(e.key)} pousse la porte de la taverne (niveau ${e.level})`;
    if (e.type === 'leave') return `${name(e.key)} a repris la route`;
    return '';
  };
  // « atteint le 60 » est déjà annoncé par l'événement max : on évite le doublon
  const maxed = new Set(history.events.filter((e) => e.type === 'max').map((e) => `${e.date}|${e.key}`));
  const events = history.events
    .filter((e) => !(e.type === 'level' && e.level >= MAX_LEVEL && maxed.has(`${e.date}|${e.key}`)))
    .slice(0, 80);
  if (!events.length) {
    $('#feed').innerHTML = '<li class="muted">Le carnet est encore vierge.</li>';
    return;
  }
  let lastDay = null;
  $('#feed').innerHTML = events
    .map((e) => {
      const head = e.date !== lastDay ? `<li class="feed-day">${fmtLong(e.date)}</li>` : '';
      lastDay = e.date;
      return `${head}<li><span aria-hidden="true">${ICON[e.type] ?? '•'}</span><span>${text(e)}</span></li>`;
    })
    .join('');
}

function renderAchievements(guild) {
  const list = guild.achievements ?? [];
  $('#achievements').innerHTML = list.length
    ? list
        .map((a) => `<li><span>${esc(a.name)}</span><time>${new Date(a.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</time></li>`)
        .join('')
    : '<li class="muted">Aucun haut fait pour le moment.</li>';
}

function setupMenu() {
  const btn = $('.menu-toggle');
  const nav = $('.nav');
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ---------- Démarrage ----------
setupMenu();
try {
  const [roster, history, guild] = await Promise.all([
    loadJson('data/roster.json'),
    loadJson('data/history.json'),
    loadJson('data/guild.json'),
  ]);
  const today = history.guildDaily.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  $('#demo-banner').hidden = !roster.demo;

  renderStats(roster, history, today);
  renderClassBars(roster.members);
  setupRoster(roster, history, today);
  renderLeaderboard(roster, history, today);
  renderGuildChart(history);
  setupMembersChart(roster, history, today);
  renderFeed(history);
  renderAchievements(guild);
} catch (err) {
  console.error(err);
  $('#roster-updated').textContent = 'Impossible de charger le roster pour le moment.';
}
