import {rm} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {parseAssessment,mayExecute,mayPrepare,repairPrompt,assessmentPrompt} from '../src/webhook-policy.js';

test('风险评估必须完整且可验证；不按数据库、数据删除或认证类型强制拒绝',()=>{
 const value={decision:'execute',risk:'medium',reason:'数据库调整已验证备份和恢复',plan:['备份、变更、测试、部署与验证'],canVerify:true,canRollback:true,needsClarification:false};
 assert.equal(mayExecute(parseAssessment(JSON.stringify(value))),true);
 for(const change of [{risk:'high'},{risk:'unknown'},{canVerify:false},{canRollback:false},{needsClarification:true},{plan:[]}])assert.equal(mayExecute({...value,...change}),false);
 assert.throws(()=>parseAssessment('bad'),/有效 JSON/);assert.throws(()=>parseAssessment('{}'),/信息不完整/);assert.match(assessmentPrompt('事件'),/数据库变更、删除、认证权限变更不按类型一律禁止/);
});

for(const scenario of ['execute','permissions','high','advice','invalid','question-assess','question-repair','approval-assess','analyze','plan'])test('无人值守事件：'+scenario,async t=>{
 const dir=mkdtempSync(join(tmpdir(),'codexplus-auto-')),workspace=join(dir,'workspace'),logFile=join(dir,'turns.jsonl');mkdirSync(workspace);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:join(dir,'data'),CODEX_WORKDIR:workspace,ADMIN_TOKEN:'admin-test',WEBHOOK_TOKEN:'hook-test',MOCK_CODEX:'false',CODEX_BIN:process.execPath,CODEX_SANDBOX:'workspace-write',WEBHOOK_EXECUTION_MODE:scenario==='analyze'?'analyze':'auto',WEBHOOK_BATCH_MS:'30',FIXTURE_TURN_LOG:logFile,FIXTURE_WEBHOOK_SCENARIO:['plan','analyze'].includes(scenario)?'execute':scenario,NODE_OPTIONS:`--import=${new URL('./fixture-preload.js',import.meta.url).href}`},stdio:['ignore','ignore','pipe']});
 let log='';child.stderr.on('data',s=>log+=s);t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:50});});
 async function until(fn){for(let i=0;i<200;i++){try{const value=await fn();if(value)return value;}catch{}await new Promise(r=>setTimeout(r,30));}throw Error('等待超时 '+log);}
 const req=(path,body,token='admin-test')=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 await until(()=>fetch(base+'/healthz').then(r=>r.ok));const session=await(await req('/api/sessions',{title:'自动事件',mode:scenario==='plan'?'plan':'default'})).json();
 await req(`/webhooks/monitor/${session.id}`,{summary:'已授权项目发生错误，需要排查'},'hook-test');
 const state=await until(async()=>{const s=await(await req('/api/state')).json();assert.equal(s.requests.length,0);return s.jobs[0]&&['done','failed'].includes(s.jobs[0].status)&&s;});
 const turns=readFileSync(logFile,'utf8').trim().split('\n').map(s=>JSON.parse(s));
 assert.match(turns[0].prompt,/^WEBHOOK_ASSESSMENT/);assert.equal(turns[0].sandbox,'read-only');assert.match(turns[0].instructions,/禁止向用户提问/);assert.equal(existsSync(join(workspace,'AGENTS.md')),!['analyze','plan'].includes(scenario));if(!['analyze','plan'].includes(scenario))assert.match(readFileSync(join(workspace,'AGENTS.md'),'utf8'),/codex-plus:webhook-policy:start/);
 const executes=['execute','permissions'].includes(scenario);assert.equal(existsSync(join(workspace,'deployed.txt')),executes);
 if(executes){assert.equal(state.jobs[0].status,'done');assert.equal(turns.length,2);assert.equal(turns[1].sandbox,'workspace-write');assert.equal(turns[0].thread,turns[1].thread);assert.match(turns[1].prompt,/^WEBHOOK_REPAIR/);}
 else if(['invalid','question-assess','question-repair'].includes(scenario)){assert.equal(state.jobs[0].status,'failed');if(scenario.startsWith('question'))assert.match(state.jobs[0].error,/不会等待用户回答/);}
 else{assert.equal(state.jobs[0].status,'done');const prepares=['high','advice','approval-assess'].includes(scenario);assert.equal(turns.length,prepares?2:1);if(prepares){assert.equal(state.jobs[0].deployment_allowed,false);assert.match(turns[1].prompt,/本次只授权分支修复/);assert.match(turns[1].prompt,/禁止合并 master/);}}
});

test('Git 分支策略区分修复与部署，未知条件不能授权上线',()=>{
 const value={decision:'advise',risk:'high',reason:'上线风险高',plan:['隔离修复'],canVerify:false,canRollback:false,needsClarification:false};
 assert.equal(mayPrepare(value),true);assert.equal(mayExecute(value),false);
 assert.equal(mayPrepare({...value,needsClarification:true}),false);assert.equal(mayPrepare({...value,decision:'ignore'}),false);
 const deploy=repairPrompt('event',value),prepare=repairPrompt('event',value,{deploy:false});
 for(const prompt of [deploy,prepare]){assert.match(prompt,/git merge --ff-only/);assert.match(prompt,/工作区干净/);assert.match(prompt,/不擅自创建 master 或改用 main/);assert.match(prompt,/不得自动 push/);}
 assert.match(prepare,/禁止合并 master、push、部署/);assert.match(prepare,/没有 Git 仓库则只给建议/);
});
