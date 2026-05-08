import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function hashScope(scopeKey) {
  return crypto.createHash("sha256").update(String(scopeKey)).digest("hex").slice(0, 32);
}

export class JsonStateStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
  }

  fileForScope(scopeKey) {
    return path.join(this.stateDir, `${hashScope(scopeKey)}.json`);
  }

  async load(scopeKey) {
    const file = this.fileForScope(scopeKey);
    try {
      const raw = await fs.readFile(file, "utf8");
      return normalizeState(JSON.parse(raw), scopeKey);
    } catch (err) {
      if (err && err.code === "ENOENT") return normalizeState(null, scopeKey);
      throw err;
    }
  }

  async save(scopeKey, state) {
    await fs.mkdir(this.stateDir, { recursive: true });
    const file = this.fileForScope(scopeKey);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(normalizeState(state, scopeKey), null, 2)}\n`, "utf8");
    await fs.rename(tmp, file);
  }

  async update(scopeKey, updater) {
    const state = await this.load(scopeKey);
    const next = (await updater(state)) || state;
    await this.save(scopeKey, next);
    return next;
  }
}

export function normalizeState(input, scopeKey = "") {
  const now = Date.now();
  const state = input && typeof input === "object" ? { ...input } : {};
  state.schemaVersion = 1;
  state.scopeKey = String(state.scopeKey || scopeKey || "");
  state.createdAtMs = Number(state.createdAtMs || now);
  state.updatedAtMs = Number(state.updatedAtMs || now);
  state.messages = Array.isArray(state.messages) ? state.messages.filter((m) => m && typeof m.text === "string") : [];
  state.summarizedThrough = Number.isFinite(Number(state.summarizedThrough)) ? Number(state.summarizedThrough) : 0;
  state.lastSummarySignature = typeof state.lastSummarySignature === "string" ? state.lastSummarySignature : "";
  return state;
}
