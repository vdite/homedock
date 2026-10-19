import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_GROUPS = 100;
const MAX_LINKS_PER_GROUP = 250;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function emptyDashboard() {
  return {
    version: 1,
    groups: [],
    updatedAt: new Date().toISOString(),
  };
}

function cleanText(value, field, maxLength, { required = true } = {}) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw invalid(`${field} muss Text sein.`);
  }

  const cleaned = value.trim();
  if (required && !cleaned) throw invalid(`${field} darf nicht leer sein.`);
  if (cleaned.length > maxLength) throw invalid(`${field} ist zu lang.`);
  return cleaned;
}

function cleanId(value) {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) return value;
  return randomUUID();
}

function cleanColor(value) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return '#6c63ff';
}

function cleanUrl(value) {
  const raw = cleanText(value, 'URL', 2048);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw invalid('URL ist ungültig.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw invalid('Nur http- und https-URLs sind erlaubt.');
  }
  return parsed.toString();
}

export function normalizeDashboard(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.groups)) {
    throw invalid('Ungültiges Dashboard-Format.');
  }
  if (input.groups.length > MAX_GROUPS) {
    throw invalid(`Maximal ${MAX_GROUPS} Gruppen sind erlaubt.`);
  }

  const seenIds = new Set();
  const uniqueId = (candidate) => {
    let id = cleanId(candidate);
    while (seenIds.has(id)) id = randomUUID();
    seenIds.add(id);
    return id;
  };

  const groups = input.groups.map((group, groupIndex) => {
    if (!group || typeof group !== 'object') throw invalid(`Gruppe ${groupIndex + 1} ist ungültig.`);
    if (!Array.isArray(group.links)) throw invalid(`Links in Gruppe ${groupIndex + 1} sind ungültig.`);
    if (group.links.length > MAX_LINKS_PER_GROUP) {
      throw invalid(`Eine Gruppe darf maximal ${MAX_LINKS_PER_GROUP} Links enthalten.`);
    }

    return {
      id: uniqueId(group.id),
      name: cleanText(group.name, 'Gruppenname', 80),
      color: cleanColor(group.color),
      links: group.links.map((link, linkIndex) => {
        if (!link || typeof link !== 'object') {
          throw invalid(`Link ${linkIndex + 1} in Gruppe ${groupIndex + 1} ist ungültig.`);
        }
        return {
          id: uniqueId(link.id),
          name: cleanText(link.name, 'Linkname', 100),
          url: cleanUrl(link.url),
          icon: cleanText(link.icon, 'Icon', 2048, { required: false }),
        };
      }),
    };
  });

  return {
    version: 1,
    groups,
    updatedAt: new Date().toISOString(),
  };
}

export class DashboardStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalizeDashboard(JSON.parse(raw));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyDashboard();
      if (error instanceof SyntaxError) throw new Error('Die gespeicherte Konfiguration ist kein gültiges JSON.');
      throw error;
    }
  }

  async save(input) {
    const dashboard = normalizeDashboard(input);
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(dashboard, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
    return dashboard;
  }
}
