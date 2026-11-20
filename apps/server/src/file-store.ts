import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { WebStorageStore, type KeyValueStorage } from 'survey-skipper';

/**
 * A key-value storage that keeps one JSON file per key in a directory. Writes go through a temporary file and a
 * rename, so a crash never leaves half a file behind.
 */
export class FileStorage implements KeyValueStorage {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  getItem(key: string): string | null {
    try {
      return readFileSync(this.path(key), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  setItem(key: string, value: string): void {
    const tmp = `${this.path(key)}.tmp`;
    writeFileSync(tmp, value);
    renameSync(tmp, this.path(key));
  }

  removeItem(key: string): void {
    rmSync(this.path(key), { force: true });
  }

  get length(): number {
    return this.keys().length;
  }

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  private keys(): string[] {
    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => decodeURIComponent(name.slice(0, -'.json'.length)))
      .sort();
  }

  private path(key: string): string {
    return join(this.dir, `${encodeURIComponent(key)}.json`);
  }
}

/** A {@link WebStorageStore} that persists definitions and sessions as JSON files in `dir`. */
export class FileStore extends WebStorageStore {
  constructor(dir: string) {
    super(new FileStorage(dir), '');
  }
}
