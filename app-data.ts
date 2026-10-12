import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * What the page takes from the app: Sunny's lines from its String Catalog and their recordings from its
 * `voices/` submodule. This repository is mounted at `landing/` in the (private) app repository; a build
 * there copies just the lines and clips the page uses into `app-data/`, and a build on its own (CI here)
 * reads them from there. Never edit `app-data/` by hand.
 */
export function appData(options: { landingRoot: string; keys: string[]; clipIds: string[] }) {
  const { landingRoot, keys, clipIds } = options;
  const dir = resolve(landingRoot, "app-data");
  const linesPath = join(dir, "lines.json");
  const voiceDir = join(dir, "voice");
  const catalogPath = resolve(landingRoot, "../macos/SunnySays/Resources/Localizable.xcstrings");
  const voiceSource = resolve(landingRoot, "../voices/Voice");

  if (existsSync(catalogPath)) {
    snapshotLines(catalogPath, keys, linesPath);
    if (existsSync(join(voiceSource, "manifest.json")))
      snapshotVoices(voiceSource, clipIds, voiceDir);
  } else if (!existsSync(linesPath)) {
    throw new Error(`No ${linesPath}: build once inside the sunnysays app repository to write it.`);
  }
  const lines = JSON.parse(readFileSync(linesPath, "utf8")) as Record<
    string,
    Record<string, string>
  >;
  return { lines, voiceDir };
}

/** Writes a file only when its bytes change, so a rebuild leaves the snapshot alone. */
function writeIfChanged(path: string, data: string | Buffer) {
  if (existsSync(path) && readFileSync(path).equals(Buffer.from(data))) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/** `{ "<key>": { "<language>": "<text>" } }` for each key, as the String Catalog has it. */
function snapshotLines(catalogPath: string, keys: string[], out: string) {
  const strings = JSON.parse(readFileSync(catalogPath, "utf8")).strings as Record<
    string,
    { localizations?: Record<string, { stringUnit?: { value?: string } }> }
  >;
  const lines: Record<string, Record<string, string>> = {};
  for (const key of keys) {
    const localizations = strings[key]?.localizations ?? {};
    lines[key] = Object.fromEntries(
      Object.keys(localizations)
        .sort()
        .flatMap((language) => {
          const value = localizations[language]?.stringUnit?.value;
          return value ? [[language, value]] : [];
        }),
    );
  }
  writeIfChanged(out, JSON.stringify(lines, null, 2) + "\n");
}

/** The voice manifest cut to the clips the page plays, and those clips (stale ones removed). */
function snapshotVoices(source: string, clipIds: string[], out: string) {
  const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
  const wanted = new Set<string>(["manifest.json"]);
  for (const [language, entry] of Object.entries<any>(manifest.languages)) {
    for (const [voice, recorded] of Object.entries<any>(entry.voices)) {
      recorded.clips = Object.fromEntries(
        clipIds.filter((id) => recorded.clips[id]).map((id) => [id, recorded.clips[id]]),
      );
      for (const id of Object.keys(recorded.clips)) {
        const file = `${language}/${voice}/${id}.m4a`;
        wanted.add(file);
        writeIfChanged(join(out, file), readFileSync(join(source, file)));
      }
    }
  }
  writeIfChanged(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const file of filesIn(out)) {
    if (!wanted.has(relative(out, file))) rmSync(file);
  }
}

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
