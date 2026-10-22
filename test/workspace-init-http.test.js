import {rm} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';

for(const scenario of ['normal','failure','webhook'])test('初始化 HTTP 顺序与权限：'+scenario,async t=>{
  const dir=mkdtempSync(join(tmpdir(),'codexplus-initialize-')),workspace=join(dir,'workspace'),logFile=join(dir,'turns.jsonl');mkdirSync(workspace);
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:join(dir,'data'),CODEX_WORKDIR:workspace,ADMIN_TOKEN:'private-admin-test',WEBHOOK_TOKEN:'private-hook-test',MOCK_CODEX:'false',CODEX_BIN:process.execPath,WEBHOOK_BATCH_MS:'50',FIXTURE_TURN_LOG:logFile,FIXTURE_SKIP_AGENTS:String(scenario==='failure'),NODE_OPTIONS:`--import=${new URL('./fixture-preload.js',import.meta.url).href}`},stdio:['ignore','ignore','pipe']});
  let log='';child.stderr.on('data',s=>log+=s);t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:50});});
  async function until(fn){for(let i=0;i<150;i++){try{const value=await fn();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,30));}throw Error('等待超时 '+log);}
  const req=(path,body,token='private-admin-test')=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  await until(()=>fetch(base+'/healthz').then(r=>r.ok));
  const session=await(await req('/api/sessions',{title:'初始化验证'})).json();assert.equal(existsSync(join(workspace,'AGENTS.md')),false);
  if(scenario==='webhook')await req(`/webhooks/monitor/${session.id}`,{summary:'只读事件'},'private-hook-test');else await req(`/api/sessions/${session.id}/messages`,{content:'USER_TASK_AFTER_SETUP'});
  const state=await until(async()=>{const s=await(await req('/api/state')).json();return s.jobs[0]&&['done','failed'].includes(s.jobs[0].status)&&s;});
  const turns=readFileSync(logFile,'utf8').trim().split('\n').map(s=>JSON.parse(s));
  if(scenario==='normal'){
    assert.equal(state.jobs[0].status,'done');assert.equal(turns.length,2);assert.match(turns[0].prompt,/^CODEX_PLUS_WORKSPACE_INITIALIZATION/);assert.doesNotMatch(turns[0].prompt,/USER_TASK_AFTER_SETUP/);assert.match(turns[1].prompt,/USER_TASK_AFTER_SETUP/);assert.match(turns[1].prompt,new RegExp(session.id));assert.equal(turns[0].thread,turns[1].thread);
    const content=readFileSync(join(workspace,'AGENTS.md'),'utf8');assert.match(content,/credentials_file/);assert.match(content,/WEBHOOK_TOKEN="private-hook-test"/);assert.doesNotMatch(content,/private-admin-test/);assert.doesNotMatch(turns[0].prompt,/private-admin-test|private-hook-test/);
    const next=await(await req('/api/sessions',{title:'复用工作区'})).json();await req(`/api/sessions/${next.id}/messages`,{content:'SECOND_TASK'});await until(async()=>(await(await req('/api/state')).json()).jobs[0]?.status==='done');assert.equal(readFileSync(logFile,'utf8').match(/CODEX_PLUS_WORKSPACE_INITIALIZATION/g).length,1);
    const file=join(workspace,'AGENTS.md');writeFileSync(file,readFileSync(file,'utf8').replace('private-hook-test','outdated-value'));
    const update=await(await req(`/api/sessions/${session.id}/messages`,{content:'FOLLOWUP_TASK'})).json();await until(async()=>(await(await req('/api/state')).json()).jobs.find(j=>j.id===update.jobId)?.status==='done');assert.match(readFileSync(file,'utf8'),/private-hook-test/);assert.doesNotMatch(readFileSync(file,'utf8'),/outdated-value/);
  }else if(scenario==='failure'){assert.equal(state.jobs[0].status,'failed');assert.match(state.jobs[0].error,/未生成 AGENTS/);assert.equal(turns.length,1);assert.doesNotMatch(turns[0].prompt,/USER_TASK_AFTER_SETUP/);}
  else{assert.equal(state.jobs[0].status,'done');assert.equal(turns.length,1);assert.equal(existsSync(join(workspace,'AGENTS.md')),false);assert.doesNotMatch(turns[0].prompt,/CODEX_PLUS_WORKSPACE_INITIALIZATION/);}
});
