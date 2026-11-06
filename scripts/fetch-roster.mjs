#!/usr/bin/env node
// Récupère le roster de la guilde via l'API Battle.net (WoW Forever)
// et met à jour site/data/{roster,guild,history}.json.
//
// Variables d'environnement requises :
//   BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET
// Optionnelles :
//   GUILD_SLUG  (force le slug de la guilde)
//
// L'API WoW Forever n'est pas documentée officiellement par Blizzard :
// en cas d'erreur, le script s'arrête SANS écraser les données existantes.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applySnapshot, emptyHistory, parisDate } from './lib/history.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'site', 'data');
const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));

const API = `https://${config.region}.api.blizzard.com`;
const NS = config.namespace;
const LOCALE = config.locale;
const CONCURRENCY = 5;

const { BLIZZARD_CLIENT_ID: CLIENT_ID, BLIZZARD_CLIENT_SECRET: CLIENT_SECRET } = process.env;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ BLIZZARD_CLIENT_ID et BLIZZARD_CLIENT_SECRET doivent être définis.');
  process.exit(1);
}

async function getToken() {
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth ${res.status} : ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await getToken();

/** GET sur l'API. Renvoie null sur 404, lève une erreur sinon. */
async function api(p, { retries = 2 } = {}) {
  const url = `${API}${p}${p.includes('?') ? '&' : '?'}namespace=${NS}&locale=${LOCALE}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${res.status} sur ${p}`);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

// --- 1. Trouver la guilde -------------------------------------------------
const slugs = process.env.GUILD_SLUG ? [process.env.GUILD_SLUG] : config.guildSlugCandidates;
let guildSlug = null;
let rosterRaw = null;
for (const s of slugs) {
  const r = await api(`/data/wow/guild/${encodeURIComponent(s)}/roster`);
  console.log(`  slug « ${s} » → ${r ? 'trouvé' : '404'}`);
  if (r?.members?.length) {
    guildSlug = s;
    rosterRaw = r;
    break;
  }
}
if (!rosterRaw) {
  console.error('❌ Guilde introuvable (ou roster vide). Données existantes conservées.');
  process.exit(1);
}
console.log(`✅ Guilde « ${guildSlug} » : ${rosterRaw.members.length} membres`);

// --- 2. Détails de chaque membre -----------------------------------------
function charPath(c) {
  if (c.slug) return c.slug;
  const name = c.name.toLowerCase();
  return c.surname ? `${name}-${c.surname.toLowerCase()}` : name;
}

const members = await mapLimit(rosterRaw.members, CONCURRENCY, async (m) => {
  const c = m.character;
  const key = charPath(c);
  const base = `/profile/wow/character/${encodeURIComponent(key)}`;
  let profile = null;
  let media = null;
  try {
    profile = await api(base);
    if (profile) media = await api(`${base}/character-media`);
  } catch (e) {
    console.warn(`  ⚠️  ${key} : ${e.message}`);
  }
  const avatar =
    media?.assets?.find((a) => a.key === 'avatar')?.value ??
    media?.assets?.find((a) => a.key === 'inset')?.value ??
    null;

  return {
    key,
    name: c.name,
    surname: c.surname ?? profile?.surname ?? null,
    level: profile?.level ?? c.level,
    classId: c.playable_class?.id ?? profile?.character_class?.id ?? null,
    className: profile?.character_class?.name ?? null,
    raceId: c.playable_race?.id ?? profile?.race?.id ?? null,
    raceName: profile?.race?.name ?? null,
    rank: m.rank,
    rankName: config.rankNames[m.rank] ?? `Rang ${m.rank}`,
    ilvl: profile?.equipped_item_level ?? profile?.average_item_level ?? null,
    avatar,
    lastLogin: profile?.last_login_timestamp ?? null,
  };
});

// --- 3. Infos et hauts faits de la guilde --------------------------------
let guildInfo = null;
let achievements = [];
try {
  guildInfo = await api(`/data/wow/guild/${encodeURIComponent(guildSlug)}`);
  const ach = await api(`/data/wow/guild/${encodeURIComponent(guildSlug)}/achievements`);
  if (ach?.recent_events?.length) {
    achievements = ach.recent_events.map((e) => ({
      name: e.achievement?.name,
      timestamp: e.timestamp,
    }));
  } else if (ach?.achievements) {
    achievements = ach.achievements
      .filter((a) => a.completed_timestamp)
      .sort((a, b) => b.completed_timestamp - a.completed_timestamp)
      .map((a) => ({ name: a.achievement?.name, timestamp: a.completed_timestamp }));
  }
  achievements = achievements.filter((a) => a.name).slice(0, 12);
} catch (e) {
  console.warn(`  ⚠️  Infos guilde : ${e.message}`);
}

// --- 4. Écriture ----------------------------------------------------------
await mkdir(DATA_DIR, { recursive: true });
const now = new Date().toISOString();
const today = parisDate();

async function readJson(file) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

// L'historique de démo est jeté au premier vrai passage.
let history = await readJson('history.json');
if (!history || history.demo) history = emptyHistory();
applySnapshot(history, members, today, {
  maxLevel: config.maxLevel,
  eventsLimit: config.historyEventsLimit,
});

const roster = {
  demo: false,
  updatedAt: now,
  guildSlug,
  members: members.sort((a, b) => a.rank - b.rank || b.level - a.level || a.name.localeCompare(b.name)),
};
const guild = {
  demo: false,
  updatedAt: now,
  name: guildInfo?.name ?? config.guildName,
  faction: guildInfo?.faction?.name ?? config.faction,
  memberCount: guildInfo?.member_count ?? members.length,
  achievementPoints: guildInfo?.achievement_points ?? null,
  created: guildInfo?.created_timestamp ?? null,
  achievements,
};

const write = (f, d) => writeFile(path.join(DATA_DIR, f), JSON.stringify(d, null, 1) + '\n');
await write('roster.json', roster);
await write('guild.json', guild);
await write('history.json', history);
console.log(`✅ Données écrites pour le ${today}.`);
