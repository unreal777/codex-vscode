// "Follow the active project": a chat that was started in one project but is used from another one (the active editor is in a folder of
// this window that is not the chat's project) moves to that project with its next message, instead of going on in the old one.
import { samePathKey } from './repoIdentity';

/**
 * The folder the chat moves to, or null when it stays.
 * @param follow        the setting codexPanel.followActiveProject
 * @param threadCwd     the chat's folder now
 * @param threadFolder  the open workspace folder that contains threadCwd (null when none does)
 * @param activeFolder  the open workspace folder of the file in the active editor (null when that file is in no open folder)
 */
export function followTarget(follow: boolean, threadCwd: string | null, threadFolder: string | null, activeFolder: string | null,
  platform: NodeJS.Platform = process.platform): string | null {
  if (!follow || !threadCwd || !activeFolder) return null;
  const key = (p: string) => samePathKey(p, platform);
  if (key(threadCwd) === key(activeFolder)) return null;
  if (threadFolder && key(threadFolder) === key(activeFolder)) return null;   // a sub-folder of the same project
  return activeFolder;
}
