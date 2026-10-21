import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store.js';

test('JSON 保存、上一版备份、写入失败回滚和损坏检测', t => {
  const dir = mkdtempSync(join(tmpdir(), 'codexplus-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new JsonStore(dir);
  store.update(data => data.sessions.push({id:'s1',title:'测试'}));
  assert.equal(new JsonStore(dir).state.sessions[0].id, 's1');
  assert.equal(JSON.parse(readFileSync(store.backup, 'utf8')).sessions.length, 0);
  store.update(data => data.sessions.push({id:'s2',title:'后续'}));
  assert.equal(JSON.parse(readFileSync(store.backup, 'utf8')).sessions.length, 1);
  const save = store.save;
  store.save = () => { throw new Error('模拟磁盘写入失败'); };
  assert.throws(() => store.update(data => data.sessions.push({id:'s3'})), /写入失败/);
  assert.equal(store.state.sessions.length, 2);
  assert.equal(new JsonStore(dir).state.sessions.length, 2);
  store.save = save;
  assert.throws(() => store.update(data => { data.sessions = null; }), /格式无效/);
  assert.equal(store.state.sessions.length, 2);
  writeFileSync(store.file, '{broken');
  assert.throws(() => new JsonStore(dir), /恢复/);
  assert.equal(readFileSync(store.file, 'utf8'), '{broken');
});
