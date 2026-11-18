// Image files attached as chips, opened in the drawing editor tab (the page can not read local files).
import * as fs from 'node:fs';
import * as path from 'node:path';

const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/** An image file as a data URL; null when it is not a known image type, missing, a folder or too big. */
export function imageFileUrl(file: string, maxBytes = IMAGE_MAX_BYTES): string | null {
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > maxBytes) return null;
    return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
  } catch {
    return null;
  }
}
