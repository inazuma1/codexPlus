import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';

test('Webhook 指定会话：鉴权、上下文续接、分组去重隔离、重启与删除',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'codexplus-hook-session-'));
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const base=`http://127.0.0.1:${port}`;let child,log='';
  async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,30));}throw Error('等待超时 '+log);}
  async function start(){child=spawn(process.execPath,['src/server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_TOKEN:'admin',WEBHOOK_TOKEN:'hook',MOCK_CODEX:'true',WEBHOOK_BATCH_MS:'100'},stdio:['ignore','ignore','pipe']});child.stderr.on('data',s=>log+=s);await until(async()=>{try{return(await fetch(base+'/healthz')).ok;}catch{return false;}});}
  async function stop(){if(child?.exitCode===null){const end=new Promise(r=>child.once('exit',r));child.kill();await end;}}
  t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
  const req=(path,body,token='admin',method=body===undefined?'GET':'POST',key)=>fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const state=async()=>await(await req('/api/state')).json();
  await start();
  const first=await(await req('/api/sessions',{title:'项目 A'})).json(),second=await(await req('/api/sessions',{title:'项目 B',mode:'goal'})).json();
  await req(`/api/sessions/${first.id}/messages`,{content:'现有项目上下文'});
  await until(async()=>(await state()).jobs.every(j=>j.status==='done'));
  const thread=(await state()).sessions.find(s=>s.id===first.id).thread_id;
  const payload={groupKey:'same-alert',status:'firing',summary:'数据库连接失败'};
  const path=`/webhooks/monitor/${first.id}`;
  assert.equal((await req(path,payload,'admin')).status,401);
  assert.equal((await req('/webhooks/monitor/missing',payload,'hook')).status,404);
  const a=await(await req(path,payload,'hook','POST','event-1')).json();assert.equal(a.session_id,first.id);
  assert.equal((await(await req(path,payload,'hook','POST','event-1')).json()).duplicate,true);
  const b=await(await req(`/webhooks/monitor/${second.id}`,payload,'hook','POST','event-1')).json();
  const legacy=await(await req('/webhooks/monitor',payload,'hook','POST','event-1')).json();
  assert.notEqual(a.id,b.id);assert.notEqual(a.id,legacy.id);
  await until(async()=>{const s=await state();return s.hooks.length===3&&s.hooks.every(h=>h.status==='done');});
  const result=await state();assert.equal(result.sessions.length,3);
  assert.equal(result.hooks.find(h=>h.id===a.id).session_id,first.id);
  assert.equal(result.hooks.find(h=>h.id===b.id).session_id,second.id);
  assert.equal(result.sessions.find(s=>s.id===first.id).thread_id,thread);
  assert.equal(result.jobs.find(j=>j.session_id===second.id).mode,'default');
  const messages=await(await req(`/api/sessions/${first.id}/messages`)).json();assert.equal(messages.length,4);assert.match(messages[0].content,/现有项目上下文/);assert.match(messages[2].content,/数据库连接失败/);
  await stop();await start();
  assert.equal((await(await req(path,payload,'hook','POST','event-1')).json()).duplicate,true);
  const next=await(await req(path,{...payload,status:'resolved'},'hook')).json();
  await until(async()=>(await state()).hooks.find(h=>h.id===next.id)?.status==='done');
  assert.equal((await state()).sessions.length,3);
  assert.equal((await req(`/api/sessions/${first.id}`,undefined,'admin','DELETE')).status,200);
  assert.equal((await req(path,payload,'hook')).status,404);
});
