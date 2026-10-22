import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureWorkspaceAgents,workspaceAgentTemplate,syncWorkspaceWebhookToken,syncWorkspaceWebhookPolicy,workspaceWebhookPolicy} from '../src/workspace-agents.js';
import {spawnSync} from 'node:child_process';

test('工作区初始化：并发只生成一次，保留已有文件，生成失败或取消不继续',async t=>{
  const cwd=mkdtempSync(join(tmpdir(),'codexplus-agents-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const path=join(cwd,'AGENTS.md'),base={cwd,configPath:'/etc/codex-plus.env',bridgeUrl:'http://127.0.0.1:3080'};
  let calls=0;
  const generate=async prompt=>{calls++;await new Promise(r=>setTimeout(r,20));writeFileSync(path,prompt.split('AGENTS.md 内容模板：\n')[1],{flag:'wx'});};
  const results=await Promise.all([ensureWorkspaceAgents({...base,generate}),ensureWorkspaceAgents({...base,generate})]);
  assert.equal(calls,1);assert.deepEqual(results,[true,false]);
  const text=readFileSync(path,'utf8');assert.match(text,/Alertmanager/);assert.match(text,/credentials_file/);assert.match(text,/\/webhooks\/<source>\/<sessionId>/);assert.match(text,/\/etc\/codex-plus.env/);
  writeFileSync(path,'# 项目原有规则\n保持内容');
  assert.equal(await ensureWorkspaceAgents({...base,generate}),false);assert.equal(readFileSync(path,'utf8'),'# 项目原有规则\n保持内容');
  rmSync(path);
  await assert.rejects(ensureWorkspaceAgents({...base,generate:async()=>{}}),/未生成 AGENTS/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(ensureWorkspaceAgents({...base,signal:controller.signal,generate}),/abort/i);assert.equal(calls,1);
  assert.doesNotMatch(workspaceAgentTemplate(base),/Bearer [A-Za-z0-9_-]{20,}/);
});

test('令牌区段更新保留项目规则、限制权限，并排除 Git 跟踪',t=>{
  const cwd=mkdtempSync(join(tmpdir(),'codexplus-agents-token-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  const path=join(cwd,'AGENTS.md');writeFileSync(path,'# 用户项目规则\n请遵循原有约定。\n');
  const git=args=>spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true});assert.equal(git(['init','-q']).status,0);
  assert.equal(syncWorkspaceWebhookToken({cwd,token:'first-test-token'}),true);
  assert.equal(git(['check-ignore','-q','--','AGENTS.md']).status,0);assert.equal(git(['check-ignore','-q','--','AGENTS.md.any.tmp']).status,0);
  const first=readFileSync(path,'utf8');assert.ok(first.startsWith('# 用户项目规则\n请遵循原有约定。\n'));assert.match(first,/WEBHOOK_TOKEN="first-test-token"/);
  writeFileSync(path,first+'\n# 后续项目说明\n保留这部分。\n');
  syncWorkspaceWebhookToken({cwd,token:'rotated-test-token'});
  const rotated=readFileSync(path,'utf8');assert.doesNotMatch(rotated,/first-test-token/);assert.match(rotated,/rotated-test-token/);assert.match(rotated,/# 后续项目说明\n保留这部分/);assert.equal(rotated.split('<!-- codex-plus:webhook-token:start -->').length,2);
  if(process.platform!=='win32')assert.equal(statSync(path).mode&0o777,0o600);
  assert.equal(syncWorkspaceWebhookToken({cwd,token:'rotated-test-token'}),false);
  writeFileSync(path,'# 已跟踪的项目约定\n');assert.equal(git(['add','-f','AGENTS.md']).status,0);
  assert.throws(()=>syncWorkspaceWebhookToken({cwd,token:'must-not-write'}),/已被 Git 跟踪/);assert.equal(readFileSync(path,'utf8'),'# 已跟踪的项目约定\n');
});

test('执行约定托管区段：创建、升级、幂等、保留用户内容和令牌，拒绝损坏标记',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'codexplus-policy-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));const path=join(cwd,'AGENTS.md');
 assert.equal(syncWorkspaceWebhookPolicy({cwd}),true);assert.match(readFileSync(path,'utf8'),/git merge --ff-only/);assert.equal(syncWorkspaceWebhookPolicy({cwd}),false);
 writeFileSync(path,'# 用户规则\n'+workspaceWebhookPolicy.replace('Git 分支流程','旧版流程')+'\n# 用户尾部\n');
 syncWorkspaceWebhookToken({cwd,token:'policy-test-token'});assert.equal(syncWorkspaceWebhookPolicy({cwd}),true);
 const text=readFileSync(path,'utf8');assert.ok(text.startsWith('# 用户规则\n'));assert.match(text,/# 用户尾部/);assert.match(text,/policy-test-token/);assert.doesNotMatch(text,/旧版流程/);assert.equal(text.split('<!-- codex-plus:webhook-policy:start -->').length,2);assert.equal(syncWorkspaceWebhookPolicy({cwd}),false);
 writeFileSync(path,'# 保留\n<!-- codex-plus:webhook-policy:start -->');assert.throws(()=>syncWorkspaceWebhookPolicy({cwd}),/标记不完整/);assert.equal(readFileSync(path,'utf8'),'# 保留\n<!-- codex-plus:webhook-policy:start -->');
});
