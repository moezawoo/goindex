/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Super Admin' | 'Admin' | 'Viewer' | 'Premium';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  suspended?: boolean;
  allowedFileIds?: string[];
  registeredViaDownload?: boolean;
  premiumExpiresAt?: string;
  premiumDurationDays?: number;
  avatarUrl?: string;
}

export type FolderStatus = 'idle' | 'indexing' | 'completed' | 'failed';

export interface Folder {
  id: string; // internal tracking uuid/id
  folderId: string; // Google Drive folder ID
  folderName: string;
  slug: string;
  publicUrl: string;
  status: FolderStatus;
  lastIndexed: string | null;
  createdBy: string;
  createdAt: string;
  allowedRoles?: UserRole[];
  allowedUserIds?: string[];
}

export interface FileItem {
  id: string;
  folderId: string; // The folder ID reference
  fileId: string; // Google Drive file ID
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  streamUrl: string;
  modifiedAt: string;
}

export type AnalyticsEventType = 'view' | 'download' | 'stream_click';

export interface AnalyticsEvent {
  id: string;
  fileId: string;
  fileName?: string; // Denormalized for stats
  folderId?: string; // Denormalized for stats
  eventType: AnalyticsEventType;
  ipHash: string;
  country: string;
  browser: string;
  device: string;
  referrer: string;
  createdAt: string;
}

export interface WebSettings {
  websiteName: string;
  customDomain: string;
  logoUrl: string | null;
  indexingSchedule: string; // e.g., 'daily', 'weekly', 'manual'
  cacheDuration: number; // in hours
  maxFilesPerFolder: number;
  googleClientId?: string;
  googleClientSecret?: string;
  // Dynamic Ad slots configuration
  titleBanner1Image?: string;
  titleBanner1Link?: string;
  titleBanner2Image?: string;
  titleBanner2Link?: string;
  downloadBanner1Image?: string;
  downloadBanner1Link?: string;
  downloadBanner2Image?: string;
  downloadBanner2Link?: string;
  leftPosterImage?: string;
  leftPosterLink?: string;
  rightPosterImage?: string;
  rightPosterLink?: string;
  // HTML format ads support
  titleBanner1Html?: string;
  titleBanner2Html?: string;
  downloadBanner1Html?: string;
  downloadBanner2Html?: string;
  leftPosterHtml?: string;
  rightPosterHtml?: string;
}

export interface MovieRequest {
  id: string;
  movieName: string;
  releaseYear: number;
  requestedByUserId: string;
  requestedByUsername: string;
  requestedByEmail: string;
  requestedAt: string;
  uploaded: boolean;
  uploadedAt: string | null;
  uploadedByUserId: string | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  durationDays: number;
  validUntil: string | null; // ISO date string or null if no expiration
  createdBy: string;
  createdAt: string;
  usageLimit: 'single' | 'multiple';
  redeemedBy: string[]; // List of user IDs that used this coupon
}

export interface AppState {
  users: User[];
  folders: Folder[];
  files: FileItem[];
  analytics: AnalyticsEvent[];
  settings: WebSettings;
  coupons?: Coupon[];
  movieRequests?: MovieRequest[];
}
