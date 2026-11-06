#!/usr/bin/env node
// Génère des données de DÉMONSTRATION (faux membres, ~3 semaines d'historique)
// pour visualiser le site avant le premier vrai passage de l'API.
// Le premier `fetch-roster` remplace automatiquement ces données.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applySnapshot, emptyHistory, parisDate } from './lib/history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'site', 'data');
const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
const DAYS = 21;

// Générateur pseudo-aléatoire déterministe
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const RACES = {
  1: { name: 'Humain', classes: [1, 2, 4, 5, 8, 9] },
  3: { name: 'Nain', classes: [1, 2, 3, 4, 5] },
  4: { name: 'Elfe de la nuit', classes: [1, 3, 4, 5, 11] },
  7: { name: 'Gnome', classes: [1, 4, 8, 9] },
};
const CLASS_NAMES = { 1: 'Guerrier', 2: 'Paladin', 3: 'Chasseur', 4: 'Voleur', 5: 'Prêtre', 8: 'Mage', 9: 'Démoniste', 11: 'Druide' };

const NAMES = ['Brennos', 'Aelith', 'Thorgrim', 'Mirelle', 'Gaspard', 'Ysolde', 'Durnik', 'Faelan', 'Ondine', 'Barnabé',
  'Kaelis', 'Hildric', 'Sélène', 'Tobias', 'Nyssa', 'Grumli', 'Elowen', 'Bastien', 'Liora', 'Morwen',
  'Pippin', 'Arwald', 'Célestin', 'Fenwick', 'Isaure', 'Rodric', 'Zéphyr', 'Margaux', 'Odric', 'Talia'];
const SURNAMES = ['Chopedor', 'Ventlibre', 'Barbefeu', 'Brumeval', 'Pierrecoeur', 'Feuillargent', 'Tisonnier',
  'Lamegrise', 'Courtepaille', 'Marchelune', 'Boisclair', 'Fûtdechêne', 'Ronchon', 'Belhumeur'];

function makeMember(i, rank) {
  const raceId = +pick(Object.keys(RACES));
  const classId = pick(RACES[raceId].classes);
  const name = NAMES[i];
  const surname = pick(SURNAMES);
  return {
    key: `${name}-${surname}`.toLowerCase(),
    name,
    surname,
    level: 1 + Math.floor(rand() * 12),
    classId,
    className: CLASS_NAMES[classId],
    raceId,
    raceName: RACES[raceId].name,
    rank,
    rankName: config.rankNames[rank],
    ilvl: null,
    avatar: null,
    pace: 0.4 + rand() * 2.4, // niveaux par jour en début de partie
    joinDay: 0,
    leaveDay: null,
  };
}

const ranks = [0, 1, 1, 2, 2, 2, 3, 3, ...Array(22).fill(4)];
const pool = NAMES.map((_, i) => makeMember(i, ranks[i] ?? 4));
// Quelques arrivées en cours de route, et un départ
pool.slice(22).forEach((m, j) => { m.joinDay = 3 + j * 2; m.level = 1; });
pool[17].leaveDay = 12;
// Deux gros joueurs pour avoir des niveau 60 dans la démo
pool[1].pace = 5; pool[1].level = 12;
pool[3].pace = 4.6; pool[3].level = 11;

const end = new Date();
let history = emptyHistory();

for (let d = DAYS - 1; d >= 0; d--) {
  const day = DAYS - 1 - d;
  const date = parisDate(new Date(end.getTime() - d * 86400000));
  const present = pool.filter((m) => m.joinDay <= day && (m.leaveDay === null || day < m.leaveDay));
  if (day > 0) {
    for (const m of present) {
      if (m.joinDay === day) continue;
      const slowdown = 1 - m.level / 75; // ça ralentit en approchant du 60
      const gain = Math.round(m.pace * slowdown * (0.3 + rand() * 1.4));
      m.level = Math.min(config.maxLevel, m.level + Math.max(0, gain));
    }
  }
  applySnapshot(history, present, date, { maxLevel: config.maxLevel, eventsLimit: config.historyEventsLimit });
}

const last = pool.filter((m) => m.leaveDay === null);
for (const m of last) {
  m.ilvl = m.level >= 20 ? Math.round(m.level * 0.9 + rand() * 6) : null;
  delete m.pace; delete m.joinDay; delete m.leaveDay;
}

history.demo = true;
const now = new Date().toISOString();
const roster = {
  demo: true,
  updatedAt: now,
  guildSlug: config.guildSlugCandidates[0],
  members: last.sort((a, b) => a.rank - b.rank || b.level - a.level || a.name.localeCompare(b.name)),
};
const guild = {
  demo: true,
  updatedAt: now,
  name: config.guildName,
  faction: config.faction,
  memberCount: last.length,
  achievementPoints: 340,
  created: Date.now() - DAYS * 86400000,
  achievements: [
    { name: 'Une guilde à son apogée : niveau 40 x5', timestamp: Date.now() - 1 * 86400000 },
    { name: 'Explorateurs des Paluns', timestamp: Date.now() - 3 * 86400000 },
    { name: 'Les Mortemines', timestamp: Date.now() - 6 * 86400000 },
    { name: 'Dix membres niveau 20', timestamp: Date.now() - 9 * 86400000 },
    { name: 'Charte de guilde', timestamp: Date.now() - 20 * 86400000 },
  ],
};

await mkdir(DATA_DIR, { recursive: true });
const write = (f, d) => writeFile(path.join(DATA_DIR, f), JSON.stringify(d, null, 1) + '\n');
await write('roster.json', roster);
await write('guild.json', guild);
await write('history.json', history);
console.log(`✅ Données de démo générées : ${last.length} membres, ${DAYS} jours.`);
