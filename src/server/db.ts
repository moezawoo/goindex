/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppState, User, Folder, FileItem, AnalyticsEvent, WebSettings } from '../types';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// SHA-256 Hashing helper
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate unique ID
export function generateId(): string {
  return crypto.randomUUID();
}

const DEFAULT_SETTINGS: WebSettings = {
  websiteName: 'KinoIndex',
  customDomain: 'movies.example.com',
  logoUrl: null,
  indexingSchedule: 'daily',
  cacheDuration: 12,
  maxFilesPerFolder: 1000
};

// Initial state containing preloaded data so the user can easily see files/analytics!
const INITIAL_STATE: AppState = {
  users: [
    {
      id: 'super-admin-id',
      name: 'Super Admin User',
      email: 'superadmin@kinoindex.com',
      username: 'superadmin',
      passwordHash: hashPassword('password123'),
      role: 'Super Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'admin-id',
      name: 'Admin User',
      email: 'admin@kinoindex.com',
      username: 'admin',
      passwordHash: hashPassword('password123'),
      role: 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'viewer-id',
      name: 'Viewer',
      email: 'viewer@kinoindex.com',
      username: 'viewer',
      passwordHash: hashPassword('password123'),
      role: 'Viewer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  folders: [
    {
      id: 'marvel-movies-folder-id',
      folderId: '1nS-wL7Kveqis9Uo9H_V7_hGozIe2r48I', // Sample/Mock folder ID
      folderName: 'Marvel Movies Index',
      slug: 'marvel-movies',
      publicUrl: '/s/marvel-movies',
      status: 'completed',
      lastIndexed: new Date(Date.now() - 3600000 * 4).toISOString(),
      createdBy: 'super-admin-id',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      id: 'epic-anime-folder-id',
      folderId: '2mX-vY8Lweqis8Uo8G_V6_hGozIe3r59K',
      folderName: 'Classic Anime',
      slug: 'classic-anime',
      publicUrl: '/s/classic-anime',
      status: 'completed',
      lastIndexed: new Date(Date.now() - 3600000 * 12).toISOString(),
      createdBy: 'admin-id',
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString()
    }
  ],
  files: [
    {
      id: 'file-1-id',
      folderId: 'marvel-movies-folder-id',
      fileId: 'gdrive-file-1',
      fileName: 'Iron Man (2008) 1080p BluRay.mp4',
      fileSize: 2450000000,
      mimeType: 'video/mp4',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 240).toISOString()
    },
    {
      id: 'file-2-id',
      folderId: 'marvel-movies-folder-id',
      fileId: 'gdrive-file-2',
      fileName: 'The Avengers (2012) 1080p REMUX.mkv',
      fileSize: 4890000000,
      mimeType: 'video/x-matroska',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 220).toISOString()
    },
    {
      id: 'file-3-id',
      folderId: 'marvel-movies-folder-id',
      fileId: 'gdrive-file-3',
      fileName: 'Captain America - Civil War (2016) WEBRip.mp4',
      fileSize: 1850000000,
      mimeType: 'video/mp4',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 180).toISOString()
    },
    {
      id: 'file-4-id',
      folderId: 'marvel-movies-folder-id',
      fileId: 'gdrive-file-4',
      fileName: 'Avengers - Infinity War (2018) IMAX.mp4',
      fileSize: 3200000000,
      mimeType: 'video/mp4',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 120).toISOString()
    },
    {
      id: 'file-5-id',
      folderId: 'epic-anime-folder-id',
      fileId: 'gdrive-file-5',
      fileName: 'Spirited Away (2001) Japanese Audio English Sub.mkv',
      fileSize: 1540000000,
      mimeType: 'video/x-matroska',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 500).toISOString()
    },
    {
      id: 'file-6-id',
      folderId: 'epic-anime-folder-id',
      fileId: 'gdrive-file-6',
      fileName: 'Princess Mononoke (1997) 1080p.mp4',
      fileSize: 2100000000,
      mimeType: 'video/mp4',
      downloadUrl: '#',
      streamUrl: '#',
      modifiedAt: new Date(Date.now() - 3600000 * 550).toISOString()
    }
  ],
  analytics: [
    // Today
    { id: generateId(), fileId: 'file-1-id', fileName: 'Iron Man (2008) 1080p BluRay.mp4', folderId: 'marvel-movies-folder-id', eventType: 'view', ipHash: 'hash', country: 'US', browser: 'Chrome', device: 'Desktop', referrer: 'Direct', createdAt: new Date().toISOString() },
    { id: generateId(), fileId: 'file-2-id', fileName: 'The Avengers (2012) 1080p REMUX.mkv', folderId: 'marvel-movies-folder-id', eventType: 'stream_click', ipHash: 'hash', country: 'US', browser: 'Chrome', device: 'Desktop', referrer: 'Direct', createdAt: new Date().toISOString() },
    { id: generateId(), fileId: 'file-2-id', fileName: 'The Avengers (2012) 1080p REMUX.mkv', folderId: 'marvel-movies-folder-id', eventType: 'view', ipHash: 'hash', country: 'CA', browser: 'Safari', device: 'Mobile', referrer: 'Google', createdAt: new Date().toISOString() },
    { id: generateId(), fileId: 'file-3-id', fileName: 'Captain America - Civil War (2016) WEBRip.mp4', folderId: 'marvel-movies-folder-id', eventType: 'download', ipHash: 'hash', country: 'MM', browser: 'Chrome', device: 'Mobile', referrer: 'Youtube', createdAt: new Date().toISOString() },
    { id: generateId(), fileId: 'file-5-id', fileName: 'Spirited Away (2001) Japanese Audio English Sub.mkv', folderId: 'epic-anime-folder-id', eventType: 'view', ipHash: 'hash', country: 'JP', browser: 'Firefox', device: 'Desktop', referrer: 'Direct', createdAt: new Date().toISOString() },
    
    // Yesterday
    { id: generateId(), fileId: 'file-1-id', fileName: 'Iron Man (2008) 1080p BluRay.mp4', folderId: 'marvel-movies-folder-id', eventType: 'view', ipHash: 'hash', country: 'US', browser: 'Chrome', device: 'Desktop', referrer: 'Direct', createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: generateId(), fileId: 'file-3-id', fileName: 'Captain America - Civil War (2016) WEBRip.mp4', folderId: 'marvel-movies-folder-id', eventType: 'download', ipHash: 'hash', country: 'GB', browser: 'Safari', device: 'Mobile', referrer: 'Twitter', createdAt: new Date(Date.now() - 86400000).toISOString() },
    
    // Last week / months
    { id: generateId(), fileId: 'file-4-id', fileName: 'Avengers - Infinity War (2018) IMAX.mp4', folderId: 'marvel-movies-folder-id', eventType: 'view', ipHash: 'hash', country: 'US', browser: 'Chrome', device: 'Desktop', referrer: 'Direct', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: generateId(), fileId: 'file-4-id', fileName: 'Avengers - Infinity War (2018) IMAX.mp4', folderId: 'marvel-movies-folder-id', eventType: 'stream_click', ipHash: 'hash', country: 'US', browser: 'Safari', device: 'Tablet', referrer: 'Direct', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }
  ],
  settings: DEFAULT_SETTINGS
};

class Database {
  private state: AppState;

  constructor() {
    this.state = INITIAL_STATE;
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.state = JSON.parse(raw);
        
        // Ensure defaults if any properties are added
        if (!this.state.users) this.state.users = INITIAL_STATE.users;
        if (!this.state.folders) this.state.folders = INITIAL_STATE.folders;
        if (!this.state.files) this.state.files = INITIAL_STATE.files;
        if (!this.state.analytics) this.state.analytics = INITIAL_STATE.analytics;
        if (!this.state.settings) this.state.settings = INITIAL_STATE.settings;
        if (!this.state.coupons) this.state.coupons = [];
        if (!this.state.movieRequests) this.state.movieRequests = [];
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Failed to initialize database, using memory-only:', err);
    }
  }

  public save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err);
    }
  }

  // Users Management
  public getUsers(): User[] {
    return this.state.users;
  }

  public getUserById(id: string): User | undefined {
    return this.state.users.find(u => u.id === id);
  }

  public getUserByUsername(username: string): User | undefined {
    return this.state.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public getUserByEmail(email: string): User | undefined {
    return this.state.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public addUser(user: Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt'>, passwordPlainText: string): User {
    const newUser: User = {
      ...user,
      id: generateId(),
      passwordHash: hashPassword(passwordPlainText),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.state.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<Omit<User, 'id' | 'passwordHash' | 'createdAt' | 'updatedAt'>> & { passwordPlainText?: string }): User {
    const userIndex = this.state.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error(`User not found: ${id}`);
    }

    const current = this.state.users[userIndex];
    const passwordHash = updates.passwordPlainText ? hashPassword(updates.passwordPlainText) : current.passwordHash;

    const { passwordPlainText, ...standardUpdates } = updates;

    const updatedUser: User = {
      ...current,
      ...standardUpdates,
      passwordHash,
      updatedAt: new Date().toISOString()
    };

    this.state.users[userIndex] = updatedUser;
    this.save();
    return updatedUser;
  }

  public deleteUser(id: string) {
    this.state.users = this.state.users.filter(u => u.id !== id);
    this.save();
  }

  // Folders Management
  public getFolders(): Folder[] {
    return this.state.folders;
  }

  public getFolderById(id: string): Folder | undefined {
    return this.state.folders.find(f => f.id === id);
  }

  public getFolderBySlug(slug: string): Folder | undefined {
    return this.state.folders.find(f => f.slug === slug);
  }

  public addFolder(folder: Omit<Folder, 'id' | 'status' | 'lastIndexed' | 'createdAt'>): Folder {
    const newFolder: Folder = {
      ...folder,
      id: generateId(),
      status: 'idle',
      lastIndexed: null,
      createdAt: new Date().toISOString()
    };
    this.state.folders.push(newFolder);
    this.save();
    return newFolder;
  }

  public updateFolder(id: string, updates: Partial<Folder>): Folder {
    const folderIndex = this.state.folders.findIndex(f => f.id === id);
    if (folderIndex === -1) {
      throw new Error(`Folder not found: ${id}`);
    }

    const updatedFolder: Folder = {
      ...this.state.folders[folderIndex],
      ...updates
    };

    this.state.folders[folderIndex] = updatedFolder;
    this.save();
    return updatedFolder;
  }

  public deleteFolder(id: string) {
    this.state.folders = this.state.folders.filter(f => f.id !== id);
    // Cascade delete files and cascade analytics is not strictly needed but good to clean up files
    this.state.files = this.state.files.filter(f => f.folderId !== id);
    this.save();
  }

  // Files Management
  public getFiles(folderId?: string): FileItem[] {
    if (folderId) {
      return this.state.files.filter(f => f.folderId === folderId);
    }
    return this.state.files;
  }

  public getFileById(id: string): FileItem | undefined {
    return this.state.files.find(f => f.id === id);
  }

  public syncFilesForFolder(folderId: string, files: Omit<FileItem, 'id' | 'folderId'>[]) {
    // Delete old files
    this.state.files = this.state.files.filter(f => f.folderId !== folderId);
    
    // Add new files
    const newFiles: FileItem[] = files.map(file => ({
      ...file,
      id: generateId(),
      folderId
    }));

    this.state.files.push(...newFiles);
    this.save();
  }

  // Analytics Management
  public getAnalytics(): AnalyticsEvent[] {
    return this.state.analytics;
  }

  public trackEvent(event: Omit<AnalyticsEvent, 'id' | 'createdAt'>) {
    const file = this.getFileById(event.fileId);
    const newEvent: AnalyticsEvent = {
      ...event,
      id: generateId(),
      fileName: file ? file.fileName : 'Unknown File',
      folderId: file ? file.folderId : undefined,
      createdAt: new Date().toISOString()
    };

    this.state.analytics.push(newEvent);
    this.save();
  }

  // Settings
  public getSettings(): WebSettings {
    return this.state.settings;
  }

  public updateSettings(updates: Partial<WebSettings>): WebSettings {
    this.state.settings = {
      ...this.state.settings,
      ...updates
    };
    this.save();
    return this.state.settings;
  }

  // Coupon Operations
  public getCoupons(): any[] {
    if (!this.state.coupons) {
      this.state.coupons = [];
    }
    return this.state.coupons;
  }

  public getCouponByCode(code: string): any | undefined {
    const couponsList = this.getCoupons();
    return couponsList.find((c: any) => c.code.toLowerCase() === code.trim().toLowerCase());
  }

  public addCoupon(coupon: { code: string; durationDays: number; validUntil: string | null; createdBy: string; usageLimit?: 'single' | 'multiple' }): any {
    if (!this.state.coupons) {
      this.state.coupons = [];
    }
    const newCoupon = {
      id: generateId(),
      code: coupon.code.toUpperCase().trim(),
      durationDays: coupon.durationDays,
      validUntil: coupon.validUntil,
      createdBy: coupon.createdBy,
      createdAt: new Date().toISOString(),
      usageLimit: coupon.usageLimit || 'multiple',
      redeemedBy: []
    };
    this.state.coupons.push(newCoupon);
    this.save();
    return newCoupon;
  }

  public recordCouponRedemption(couponId: string, userId: string) {
    if (!this.state.coupons) return;
    const couponIndex = this.state.coupons.findIndex(c => c.id === couponId);
    if (couponIndex !== -1) {
      const coupon = this.state.coupons[couponIndex];
      if (!coupon.redeemedBy) coupon.redeemedBy = [];
      if (!coupon.redeemedBy.includes(userId)) {
        coupon.redeemedBy.push(userId);
      }
      this.save();
    }
  }

  public deleteCoupon(id: string) {
    if (this.state.coupons) {
      this.state.coupons = this.state.coupons.filter(c => c.id !== id);
      this.save();
    }
  }

  // Movie Requests Management
  public getMovieRequests(): any[] {
    if (!this.state.movieRequests) {
      this.state.movieRequests = [];
    }

    // Auto-remove movie requests where both 'uploaded' and 'confirmed' are ticked and 48 hours have passed since both ticks.
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000).getTime();
    let modified = false;

    const activeRequests = this.state.movieRequests.filter(req => {
      if (req.uploaded && req.confirmed && req.confirmedAt) {
        const confirmedTime = new Date(req.confirmedAt).getTime();
        if (confirmedTime < fortyEightHoursAgo) {
          modified = true;
          return false; // remove from list
        }
      }
      return true;
    });

    if (modified) {
      this.state.movieRequests = activeRequests;
      this.save();
    }

    return this.state.movieRequests;
  }

  public addMovieRequest(movieName: string, releaseYear: number, user: User): any {
    if (!this.state.movieRequests) {
      this.state.movieRequests = [];
    }
    const newReq = {
      id: generateId(),
      movieName,
      releaseYear,
      requestedByUserId: user.id,
      requestedByUsername: user.username,
      requestedByEmail: user.email,
      requestedAt: new Date().toISOString(),
      uploaded: false,
      uploadedAt: null,
      uploadedByUserId: null,
      confirmed: false,
      confirmedAt: null,
      confirmedByUserId: null
    };
    this.state.movieRequests.push(newReq);
    this.save();
    return newReq;
  }

  public updateMovieRequest(id: string, updates: Partial<any>): any {
    if (!this.state.movieRequests) {
      this.state.movieRequests = [];
    }
    const reqIndex = this.state.movieRequests.findIndex(r => r.id === id);
    if (reqIndex !== -1) {
      const current = this.state.movieRequests[reqIndex];
      const updated = {
        ...current,
        ...updates
      };
      
      // Handle timestamping for confirmed or uploaded
      if (updates.uploaded !== undefined) {
        updated.uploadedAt = updates.uploaded ? new Date().toISOString() : null;
        updated.uploadedByUserId = updates.uploaded ? 'admin-placeholder' : null;
      }
      if (updates.confirmed !== undefined) {
        updated.confirmedAt = updates.confirmed ? new Date().toISOString() : null;
        updated.confirmedByUserId = updates.confirmed ? 'super-admin-placeholder' : null;
      }

      this.state.movieRequests[reqIndex] = updated;
      this.save();
      return updated;
    }
    return null;
  }
}

export const db = new Database();
