/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileItem } from '../types';

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webContentLink?: string;
  webViewLink?: string;
}

interface GoogleDriveListResponse {
  nextPageToken?: string;
  files: GoogleDriveFile[];
}

/**
 * Crawl a Google Drive folder recursively.
 * Uses the user's Google Drive OAuth access token.
 */
export async function crawlGoogleDriveFolder(
  folderId: string,
  accessToken: string,
  maxFiles: number = 1000,
  currentDepth: number = 0,
  maxDepth: number = 10,
  visitedFolders: Set<string> = new Set()
): Promise<Omit<FileItem, 'id' | 'folderId'>[]> {
  
  if (currentDepth > maxDepth) {
    console.warn(`Drive Crawler: Reached maximum depth of ${maxDepth}`);
    return [];
  }

  if (visitedFolders.has(folderId)) {
    console.warn(`Drive Crawler: Detected cycle, already visited folder ${folderId}`);
    return [];
  }
  visitedFolders.add(folderId);

  const results: Omit<FileItem, 'id' | 'folderId'>[] = [];
  let nextPageToken: string | undefined = undefined;

  try {
    do {
      // Build search query: files that are in parent folder, not trashed
      const q = `'${folderId}' in parents and trashed = false`;
      const fields = 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webContentLink, webViewLink)';
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.append('q', q);
      url.searchParams.append('fields', fields);
      url.searchParams.append('pageSize', '100'); // chunk sizes of 100
      if (nextPageToken) {
        url.searchParams.append('pageToken', nextPageToken);
      }

      console.log(`Crawling Google Drive folder: ${folderId}, URL: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        
        if (response.status === 429) {
          console.warn('Drive API Rate Limit hit (429). Retrying after small backoff...', errorBody);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue; // Retry listing current chunk
        }

        throw new Error(`Google Drive API error (${response.status}): ${response.statusText || 'Unknown'}. Details: ${errorBody}`);
      }

      const data: GoogleDriveListResponse = await response.json();
      const filesList = data.files || [];

      for (const file of filesList) {
        if (results.length >= maxFiles) {
          break;
        }

        // Check if the current item is a subdirectory (folder)
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          try {
            const subfiles = await crawlGoogleDriveFolder(
              file.id,
              accessToken,
              maxFiles - results.length,
              currentDepth + 1,
              maxDepth,
              visitedFolders
            );
            results.push(...subfiles);
          } catch (err: any) {
            console.error(`Failed to crawl subfolder ${file.name} (${file.id}):`, err.message || err);
            // Non-blocking subfolder error; continue gathering other files rather than breaking everything
          }
        } else {
          // It's a standard file: save structured metadata
          const size = file.size ? parseInt(file.size, 10) : 0;
          
          // Generate direct download stream urls
          // The public webContentLink is usually of type Direct download,
          // but we can also use our secure server-side range-aware proxy streamer for high-fidelity streaming!
          const downloadUrl = file.webContentLink || `https://drive.google.com/uc?id=${file.id}&export=download`;
          const streamUrl = `/api/stream/${file.id}`;

          results.push({
            fileId: file.id,
            fileName: file.name,
            fileSize: size,
            mimeType: file.mimeType,
            downloadUrl,
            streamUrl,
            modifiedAt: file.modifiedTime || new Date().toISOString()
          });
        }
      }

      nextPageToken = data.nextPageToken;

      if (results.length >= maxFiles) {
        console.log(`Drive Crawler: Reached maxFiles limit of ${maxFiles}`);
        break;
      }
    } while (nextPageToken);

  } catch (err: any) {
    console.error(`Error encountered in crawlGoogleDriveFolder at folder ${folderId}:`, err);
    throw err;
  }

  return results;
}

/**
 * Fetch a file from Google Drive as a readable stream (used by the range proxy streaming router)
 */
export async function getGoogleDriveStream(
  fileId: string,
  accessToken: string,
  rangeHeader?: string
): Promise<{ response: Response; contentType: string; contentLength: number }> {
  
  // 1. Get file metadata (MIME type & size) which is useful for headers setup
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,size,name`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to fetch file metadata (${metaRes.status})`);
  }

  const fileMeta = await metaRes.json();
  const contentType = fileMeta.mimeType || 'video/mp4';
  const contentLength = fileMeta.size ? parseInt(fileMeta.size, 10) : 0;

  // 2. Fetch the actual content stream from google apis with alt=media
  const streamUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const streamHeaders: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
  };

  // Forward range requests to Google APIs so we support smooth seeking/scrubbing in video players!
  if (rangeHeader) {
    streamHeaders['Range'] = rangeHeader;
  }

  const driveRes = await fetch(streamUrl, {
    headers: streamHeaders
  });

  if (!driveRes.ok && driveRes.status !== 206) {
    throw new Error(`Failed to fetch binary stream from Google Drive (${driveRes.status})`);
  }

  return {
    response: driveRes,
    contentType,
    contentLength
  };
}
