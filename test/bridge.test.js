import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

test('端到端：鉴权、聊天、Webhook 去重汇总、持久化', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'codexplus-'));
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['src/server.js'], { env:{ ...process.env, HOST:'127.0.0.1', PORT:String(port), DATA_DIR:tmp, ADMIN_TOKEN:'admin-test', WEBHOOK_TOKEN:'hook-test', MOCK_CODEX:'true', WEBHOOK_BATCH_MS:'100' }, stdio:['ignore','pipe','pipe'] });
    let diagnostics = ''; child.stderr.on('data', b => diagnostics += b);
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) return; } catch {} await new Promise(r => setTimeout(r, 30)); }
    throw new Error(diagnostics || '启动超时');
  }
  async function stop() { if (!child || child.exitCode !== null) return; const closed = new Promise(r => child.once('exit', r)); child.kill(); await closed; }
  t.after(async () => { await stop(); rmSync(tmp, { recursive:true, force:true }); });
  const request = (path, method = 'GET', body, token = 'admin-test') => fetch(base + path, { method, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:body === undefined ? undefined : JSON.stringify(body) });
  async function until(fn) { for(let i=0;i<100;i++) { const value = await fn(); if(value) return value; await new Promise(r=>setTimeout(r,30)); } throw new Error('等待任务完成超时'); }
  await start();
  assert.equal((await request('/api/state', 'GET', undefined, 'bad')).status, 401);
  const protectedState=await request('/api/state');assert.equal((await protectedState.json()).webhookToken,'hook-test');assert.match(protectedState.headers.get('cache-control'),/no-store/);
  assert.equal((await request('/api/state','GET',undefined,'hook-test')).status,401);
  assert.equal((await request('/webhooks/test','POST',{},'admin-test')).status,401);
  assert.equal((await fetch(base + '/')).status,200);
  const page=await(await fetch(base+'/')).text();assert.match(page,/type="module"/);
  const approvalModule=await fetch(base+'/approval-view.js');assert.equal(approvalModule.status,200);assert.match(approvalModule.headers.get('content-type'),/javascript/);
  for(const path of ['/markdown.js','/vendor/marked.js','/vendor/purify.js']){const r=await fetch(base+path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);}
  assert.equal((await fetch(base+'/markdown.css')).status,200);
  const s = await (await request('/api/sessions','POST',{title:'测试聊天'})).json();
  assert.equal((await request(`/api/sessions/${s.id}/messages`,'POST',{content:'你好'})).status,202);
  await until(async () => (await (await request(`/api/sessions/${s.id}/messages`)).json()).find(m=>m.role==='assistant'));
  const payload = { groupKey:'cluster-cpu',status:'firing',commonLabels:{alertname:'HighCPU'},alerts:[{annotations:{summary:'CPU 过高'}}] };
  assert.equal((await request('/webhooks/alertmanager','POST',payload,'hook-test')).status,202);
  assert.equal((await (await request('/webhooks/alertmanager','POST',payload,'hook-test')).json()).duplicate,true);
  const result = await until(async () => { const st = await (await request('/api/state')).json(); return st.hooks[0]?.status === 'done' && st; });
  assert.equal(result.hooks.length,1); assert.ok(result.hooks[0].session_id);
  const messages = await (await request(`/api/sessions/${result.hooks[0].session_id}/messages`)).json();
  assert.match(messages[0].content,/HighCPU/); assert.equal(messages[1].role,'assistant');
  const beforeThread = result.sessions.find(x=>x.id===s.id).thread_id;
  await request(`/api/sessions/${s.id}/messages`,'POST',{content:'继续'});
  await until(async () => (await (await request(`/api/sessions/${s.id}/messages`)).json()).length===4);
  const after = await (await request('/api/state')).json(); assert.equal(after.sessions.find(x=>x.id===s.id).thread_id,beforeThread);
  assert.equal((await request(`/api/sessions/${s.id}`,'PATCH',{title:'  修改后的会话标题  '})).status,200);
  const renamed=await(await request('/api/state')).json();
  assert.equal(renamed.sessions.find(x=>x.id===s.id).title,'修改后的会话标题');
  assert.equal(renamed.sessions.find(x=>x.id===s.id).thread_id,beforeThread);
  assert.equal((await request(`/api/sessions/${s.id}`,'PATCH',{title:' '})).status,400);
  assert.equal((await request(`/api/sessions/${s.id}`,'PATCH',{title:'x'.repeat(101)})).status,400);
  assert.equal((await request(`/api/sessions/${s.id}`,'PATCH',{title:'无权限'},'hook-test')).status,401);
  assert.equal((await request(`/api/sessions/${s.id}/messages`,'POST',{content:''})).status,400);
  assert.equal((await request('/webhooks/test','POST',{message:'x'.repeat(70000)},'hook-test')).status,413);
  assert.equal((await request(`/api/sessions/${s.id}/approval`,'PATCH',{autoApprove:true})).status,200);
  await stop();
  const interrupted = JSON.parse(readFileSync(join(tmp,'store.json'),'utf8'));
  const goalSession=interrupted.sessions.find(row=>row.id===s.id);goalSession.mode='goal';goalSession.goal={objective:'重启恢复验证',status:'active',tokenBudget:4000};
  const goalJob=interrupted.jobs.find(j=>j.session_id===s.id);goalJob.mode='goal';goalJob.status='waiting';
  writeFileSync(join(tmp,'store.json'),JSON.stringify(interrupted));
  await start();
  const persisted = await (await request('/api/state')).json(); assert.equal(persisted.hooks.length,1); assert.equal(persisted.sessions.length,2);
  assert.equal(persisted.sessions.find(row=>row.id===s.id).goal.status,'paused');
  assert.equal(persisted.sessions.find(row=>row.id===s.id).title,'修改后的会话标题');
  assert.equal(persisted.sessions.find(row=>row.id===s.id).auto_approve,true);
  assert.equal(persisted.jobs.find(j=>j.id===goalJob.id).status,'failed');
  const saved = JSON.parse(readFileSync(join(tmp, 'store.json'), 'utf8'));
  assert.equal(saved.sessions.length, 2); assert.equal(saved.hooks.length, 1);
  await Promise.all(Array.from({length: 8}, (_, i) => request('/api/sessions', 'POST', {title:`并发 ${i}`})));
  assert.equal((await (await request('/api/state')).json()).sessions.length, 10);
  assert.equal(JSON.parse(readFileSync(join(tmp, 'store.json'), 'utf8')).sessions.length, 10);
});
