import { existsSync, mkdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const tables = ['sessions', 'messages', 'hooks', 'jobs', 'job_hooks'];
function emptyState() {
  return { version: 1, sessions: [], messages: [], hooks: [], jobs: [], job_hooks: [] };
}
function validate(value) {
  if (value?.version !== 1 || tables.some(key => !Array.isArray(value[key]))) throw new Error('JSON 存储格式无效');
  for (const table of tables.slice(0, -1)) {
    const ids = new Set();
    for (const row of value[table]) {
      if (!row || typeof row !== 'object' || row.id == null || ids.has(row.id)) throw new Error(`JSON 存储 ${table} 记录无效`);
      ids.add(row.id);
    }
  }
  return value;
}

// 所有修改同步串行提交：先写完整临时文件并 fsync，再原子替换。
export class JsonStore {
  constructor(directory) {
    mkdirSync(directory, { recursive: true });
    this.file = resolve(directory, 'store.json');
    this.backup = this.file + '.bak';
    this.state = emptyState();
    if (existsSync(this.file)) {
      try { this.state = validate(JSON.parse(readFileSync(this.file, 'utf8'))); }
      catch (error) {
        // 不自动回退旧快照，避免静默丢弃已经接收的事件。
        throw new Error(`无法读取 ${this.file}，请检查文件或从 ${this.backup} 恢复：${error.message}`);
      }
    } else {
      if (existsSync(this.backup)) throw new Error(`主存储缺失，请先检查并恢复 ${this.backup}`);
      this.save(this.state);
    }
  }
  save(next) {
    const temporary = this.file + '.tmp';
    let fd;
    try {
      fd = openSync(temporary, 'w', 0o600);
      writeFileSync(fd, JSON.stringify(next, null, 2) + '\n');
      fsyncSync(fd); closeSync(fd); fd = undefined;
      if (existsSync(this.file)) {
        const backupTemp = this.backup + '.tmp';
        writeFileSync(backupTemp, readFileSync(this.file), { mode: 0o600 });
        renameSync(backupTemp, this.backup);
      }
      renameSync(temporary, this.file);
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  update(fn) {
    const next = structuredClone(this.state);
    const result = fn(next);
    validate(next);
    this.save(next);
    this.state = next;
    return result;
  }
}
export function nextId(rows) { return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1; }
