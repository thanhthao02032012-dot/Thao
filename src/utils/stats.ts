import { UserStats, FileMeta } from '../types';

const STATS_KEY_PREFIX = 'webhex_stats_';
const FILES_KEY_PREFIX = 'webhex_files_';

export function getStats(uid: string): UserStats {
  const defaultStats: UserStats = {
    filesUploaded: 0,
    hexEdits: 0,
    bitEdits: 0,
    hashesGenerated: 0,
    digitalSignatures: 0,
    storageUsed: 0,
  };

  try {
    const raw = localStorage.getItem(`${STATS_KEY_PREFIX}${uid}`);
    if (raw) {
      return { ...defaultStats, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to get local stats', e);
  }
  return defaultStats;
}

export function saveStats(uid: string, stats: UserStats): void {
  try {
    localStorage.setItem(`${STATS_KEY_PREFIX}${uid}`, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save local stats', e);
  }
}

export function incrementStat(uid: string, key: keyof UserStats, amount: number = 1): void {
  const stats = getStats(uid);
  stats[key] = (stats[key] as number) + amount;
  saveStats(uid, stats);
}

export function getRecentFiles(uid: string): FileMeta[] {
  try {
    const raw = localStorage.getItem(`${FILES_KEY_PREFIX}${uid}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to get recent files', e);
  }
  return [];
}

export function addRecentFile(uid: string, name: string, size: number, type: string): string {
  const files = getRecentFiles(uid);
  const existingIndex = files.findIndex(f => f.name === name && f.size === size);
  
  if (existingIndex > -1) {
    files.splice(existingIndex, 1);
  }

  const newFile: FileMeta = {
    id: `local-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    uid,
    name,
    size,
    type,
    uploadedAt: Date.now(),
  };

  const updatedFiles = [newFile, ...files].slice(0, 50); // limit to 50 recent files
  try {
    localStorage.setItem(`${FILES_KEY_PREFIX}${uid}`, JSON.stringify(updatedFiles));
    
    // Also update stats: total files uploaded (unique ones or count) and storageUsed
    const stats = getStats(uid);
    stats.filesUploaded = updatedFiles.length;
    stats.storageUsed = updatedFiles.reduce((acc, f) => acc + f.size, 0);
    saveStats(uid, stats);
  } catch (e) {
    console.error('Failed to save recent files', e);
  }
  return newFile.id;
}
