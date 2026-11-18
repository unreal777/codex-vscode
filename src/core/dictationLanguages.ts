// 0.9.0: the languages the user dictates in (setting codexPanel.dictationLanguages: a list of codes from DICTATION_LANGUAGES,
// English by default; empty = any language). Codex's voice mode has no language option, so the names go into the voice model's
// instructions as a hint, and a phrase written mostly in a script none of them uses (a Chinese phrase while you speak Russian)
// is dropped instead of typed.

export type Script = 'latin' | 'cyrillic' | 'greek' | 'han' | 'kana' | 'hangul' | 'arabic' | 'hebrew' | 'devanagari' | 'thai' | 'georgian' | 'armenian';

interface Lang { code: string; name: string; scripts: Script[] }
const L = (code: string, name: string, ...scripts: Script[]): Lang => ({ code, name, scripts });

/** The choice of the setting (package.json enum and the panel's list agree with it; a test checks). */
export const LANGUAGES: Lang[] = [   // sorted by name
  L('ar', 'Arabic', 'arabic'),
  L('hy', 'Armenian', 'armenian'),
  L('be', 'Belarusian', 'cyrillic'),
  L('bg', 'Bulgarian', 'cyrillic'),
  L('zh', 'Chinese', 'han'),
  L('cs', 'Czech', 'latin'),
  L('da', 'Danish', 'latin'),
  L('nl', 'Dutch', 'latin'),
  L('en', 'English', 'latin'),
  L('fi', 'Finnish', 'latin'),
  L('fr', 'French', 'latin'),
  L('ka', 'Georgian', 'georgian'),
  L('de', 'German', 'latin'),
  L('el', 'Greek', 'greek'),
  L('he', 'Hebrew', 'hebrew'),
  L('hi', 'Hindi', 'devanagari'),
  L('hu', 'Hungarian', 'latin'),
  L('id', 'Indonesian', 'latin'),
  L('it', 'Italian', 'latin'),
  L('ja', 'Japanese', 'han', 'kana'),
  L('kk', 'Kazakh', 'cyrillic'),
  L('ko', 'Korean', 'hangul', 'han'),
  L('no', 'Norwegian', 'latin'),
  L('fa', 'Persian', 'arabic'),
  L('pl', 'Polish', 'latin'),
  L('pt', 'Portuguese', 'latin'),
  L('ro', 'Romanian', 'latin'),
  L('ru', 'Russian', 'cyrillic'),
  L('sr', 'Serbian', 'cyrillic', 'latin'),
  L('es', 'Spanish', 'latin'),
  L('sv', 'Swedish', 'latin'),
  L('th', 'Thai', 'thai'),
  L('tr', 'Turkish', 'latin'),
  L('uk', 'Ukrainian', 'cyrillic'),
  L('ur', 'Urdu', 'arabic'),
  L('vi', 'Vietnamese', 'latin'),
];
export const DEFAULT_LANGUAGES = ['en'];

export interface DictationLanguages {
  /** known codes, in the order of the list, no doubles */
  codes: string[];
  names: string[];
  /** scripts a phrase may be written in; null = any language (empty list) */
  scripts: Set<Script> | null;
}

/** The setting's list of codes -> names and scripts. Unknown entries are skipped; Latin always passes (code names are dictated in any language). */
export function parseLanguages(v: unknown): DictationLanguages {
  const want = new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()));
  const langs = LANGUAGES.filter((l) => want.has(l.code));
  if (!langs.length) return { codes: [], names: [], scripts: null };
  const scripts = new Set<Script>(['latin']);
  langs.forEach((l) => l.scripts.forEach((s) => scripts.add(s)));
  return { codes: langs.map((l) => l.code), names: langs.map((l) => l.name), scripts };
}

export function scriptOf(ch: string): Script | null {
  if (/\p{Script=Latin}/u.test(ch)) return 'latin';
  if (/\p{Script=Cyrillic}/u.test(ch)) return 'cyrillic';
  if (/\p{Script=Greek}/u.test(ch)) return 'greek';
  if (/\p{Script=Han}/u.test(ch)) return 'han';
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(ch)) return 'kana';
  if (/\p{Script=Hangul}/u.test(ch)) return 'hangul';
  if (/\p{Script=Arabic}/u.test(ch)) return 'arabic';
  if (/\p{Script=Hebrew}/u.test(ch)) return 'hebrew';
  if (/\p{Script=Devanagari}/u.test(ch)) return 'devanagari';
  if (/\p{Script=Thai}/u.test(ch)) return 'thai';
  if (/\p{Script=Georgian}/u.test(ch)) return 'georgian';
  if (/\p{Script=Armenian}/u.test(ch)) return 'armenian';
  return null;   // other scripts are not judged
}

/** True when at least a third of the letters of the phrase are in a script none of the languages uses. */
export function isForeign(text: string, langs: DictationLanguages): boolean {
  if (!langs.scripts) return false;
  let letters = 0, foreign = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    const s = scriptOf(ch);
    if (s && !langs.scripts.has(s)) foreign++;
  }
  return letters > 0 && foreign * 3 >= letters;
}

/** The voice model's instructions, with the languages when there are any. */
export function dictationPrompt(base: string, langs: DictationLanguages): string {
  if (!langs.names.length) return base;
  return base + ' The user speaks only ' + langs.names.join(', ') + '. Every phrase is in one of these languages; never transcribe or translate into any other language.';
}
