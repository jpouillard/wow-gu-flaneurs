// Logique partagée de l'historique des membres.
// L'historique ne stocke un niveau que lorsqu'il change : [[date, niveau], ...]

/** Date du jour au format AAAA-MM-JJ, heure de Paris. */
export function parisDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function emptyHistory() {
  return { version: 1, characters: {}, guildDaily: [], events: [] };
}

function pushEvent(history, ev) {
  // Plusieurs passages dans la même journée : on fusionne les montées de niveau.
  if (ev.type === 'level') {
    const same = history.events.find(
      (e) => e.type === 'level' && e.date === ev.date && e.key === ev.key
    );
    if (same) {
      same.level = ev.level;
      same.from = Math.min(same.from, ev.from);
      return;
    }
  }
  history.events.push(ev);
}

/**
 * Intègre un instantané du roster dans l'historique.
 * @param {object} history  historique existant (modifié sur place)
 * @param {Array}  members  [{ key, name, surname, level, classId, raceId }]
 * @param {string} date     AAAA-MM-JJ
 * @param {object} opts     { maxLevel, eventsLimit }
 */
export function applySnapshot(history, members, date, opts = {}) {
  const maxLevel = opts.maxLevel ?? 60;
  const eventsLimit = opts.eventsLimit ?? 300;
  const firstSnapshot = history.guildDaily.length === 0;
  const seen = new Set();

  for (const m of members) {
    seen.add(m.key);
    let c = history.characters[m.key];

    if (!c) {
      c = history.characters[m.key] = {
        name: m.name,
        surname: m.surname ?? null,
        classId: m.classId,
        raceId: m.raceId,
        joined: date,
        left: null,
        levels: [[date, m.level]],
      };
      if (!firstSnapshot) pushEvent(history, { date, type: 'join', key: m.key, level: m.level });
      continue;
    }

    // Infos susceptibles de changer (changement de nom, etc.)
    c.name = m.name;
    c.surname = m.surname ?? c.surname;
    c.classId = m.classId ?? c.classId;
    c.raceId = m.raceId ?? c.raceId;

    if (c.left) {
      c.left = null;
      pushEvent(history, { date, type: 'join', key: m.key, level: m.level });
    }

    const last = c.levels[c.levels.length - 1];
    if (last[1] !== m.level) {
      const from = last[1];
      if (last[0] === date) last[1] = m.level;
      else c.levels.push([date, m.level]);

      if (m.level > from) {
        pushEvent(history, { date, type: 'level', key: m.key, from, level: m.level });
        if (m.level >= maxLevel && from < maxLevel) {
          pushEvent(history, { date, type: 'max', key: m.key, level: m.level });
        }
      }
    }
  }

  for (const [key, c] of Object.entries(history.characters)) {
    if (!seen.has(key) && !c.left) {
      c.left = date;
      pushEvent(history, { date, type: 'leave', key });
    }
  }

  // Statistiques quotidiennes de la guilde (une ligne par jour, mise à jour si déjà présente)
  const levels = members.map((m) => m.level);
  const daily = {
    date,
    members: members.length,
    avgLevel: levels.length ? +(levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1) : 0,
    maxed: levels.filter((l) => l >= maxLevel).length,
    totalLevels: levels.reduce((a, b) => a + b, 0),
  };
  const idx = history.guildDaily.findIndex((d) => d.date === date);
  if (idx >= 0) history.guildDaily[idx] = daily;
  else history.guildDaily.push(daily);
  history.guildDaily.sort((a, b) => a.date.localeCompare(b.date));

  history.events.sort((a, b) => b.date.localeCompare(a.date));
  history.events = history.events.slice(0, eventsLimit);
  history.updatedAt = new Date().toISOString();
  return history;
}
