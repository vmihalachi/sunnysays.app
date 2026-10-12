import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite-plus";

/**
 * Sunny's recorded voices for the landing page: the clips the page plays, as `app-data/voice/` keeps them
 * (copied from the app's `voices/` submodule, rendered by `macos/scripts/voice.py`; see app-data.ts). A
 * language the manifest lists gets every one of its voices on the page; the app's `testing` / `shipping`
 * status doesn't apply here. Clips are served at content-hashed paths under `/assets/voice/`, fetched only
 * when Sunny says that line.
 */
interface Manifest {
  mouthFPS: number;
  languages: Record<
    string,
    {
      default: string;
      voices: Record<
        string,
        { name: string; clips: Record<string, { duration: number; mouth: string }> }
      >;
    }
  >;
}

/** One line in one voice: the clip's URL, its length in seconds, one mouth level (0–3) per 1/mouthFPS s. */
export interface Clip {
  audio: string;
  duration: number;
  mouth: string;
}

export function createVoices(voiceDir: string) {
  const manifestPath = join(voiceDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No ${manifestPath}; build once inside the app repository to write it (app-data.ts)`,
    );
  }
  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  /** Published path (no leading slash) → the clip on disk. */
  const files = new Map<string, string>();

  /** The language's voices, its default first; empty when it has none. */
  function voices(language: string): string[] {
    const entry = manifest.languages[language];
    if (!entry) return [];
    return [
      entry.default,
      ...Object.keys(entry.voices)
        .filter((voice) => voice !== entry.default)
        .sort(),
    ];
  }

  /** Every voice's clip for a line, or undefined when the language has no voice. */
  function clips(language: string, id: string): Record<string, Clip> | undefined {
    const entry = manifest.languages[language];
    if (!entry) return undefined;
    return Object.fromEntries(
      voices(language).map((voice) => {
        const clip = entry.voices[voice]?.clips[id];
        const source = join(voiceDir, language, voice, `${id}.m4a`);
        if (!clip || !existsSync(source)) {
          throw new Error(
            `No ${language}/${voice} clip for phrase "${id}"; run python3 macos/scripts/voice.py render`,
          );
        }
        const hash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 8);
        const fileName = `assets/voice/${language.toLowerCase()}-${voice}-${id}-${hash}.m4a`;
        files.set(fileName, source);
        return [voice, { audio: `/${fileName}`, duration: clip.duration, mouth: clip.mouth }];
      }),
    );
  }

  /** Serves the clips the rendered pages point to (dev) and writes them into the build. */
  function plugin(): Plugin {
    return {
      name: "sunnysays-voice",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const source = files.get(req.url?.split("?")[0]?.replace(/^\//, "") ?? "");
          if (!source) return next();
          res.setHeader("Content-Type", "audio/mp4");
          res.end(readFileSync(source));
        });
      },
      generateBundle() {
        for (const [fileName, source] of files) {
          this.emitFile({ type: "asset", fileName, source: readFileSync(source) });
        }
      },
    };
  }

  return { mouthFPS: manifest.mouthFPS, voices, clips, plugin };
}
