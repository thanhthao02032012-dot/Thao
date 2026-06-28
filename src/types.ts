export type UserRole = 'user' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName?: string;
  username?: string;
  photoURL?: string;
  role: UserRole;
  createdAt: number;
  provider?: string;
  country?: string;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  twoFactorEnabled: boolean;
}

export interface UserStats {
  filesUploaded: number;
  hexEdits: number;
  bitEdits: number;
  hashesGenerated: number;
  digitalSignatures: number;
  storageUsed: number;
}

export interface FileMeta {
  id?: string;
  uid: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
}

export interface UserSession {
  id?: string;
  uid: string;
  device: string;
  browser: string;
  os: string;
  ip?: string;
  lastLogin: number;
  isCurrent?: boolean;
}

export interface EditRecord {
  offset: number;
  oldValue: number;
  newValue: number;
}
