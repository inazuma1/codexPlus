import test from 'node:test';
import assert from 'node:assert/strict';
import { runCodex, responseFor, describeRequest } from '../src/codex.js';
import { resolve } from 'node:path';
test('app-server：握手、续接、流式事件、反问、审批、超时与取消',async()=>{
  const previous=process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS=`--import=${new URL('./fixture-preload.js',import.meta.url).href}`;
  try {
    const options={bin:process.execPath,cwd:resolve('.'),timeout:1500,prompt:'hello 世界',threadId:'existing-thread'};
    let thread;const events=[];
    assert.match(await runCodex({...options,onEvent:e=>events.push(e)},id=>thread=id),/hello 世界/);
    assert.equal(thread,'existing-thread');assert.equal(events[0].type,'delta');
    assert.match(await runCodex({...options,mode:'plan'},()=>{}),/^PLAN:/);
    const goals=[];
    await runCodex({...options,prompt:'work',goal:{objective:'work',tokenBudget:4000},goalStopAfterTurn:true,onEvent:e=>{if(e.type==='goal')goals.push(e.goal);}},()=>{});
    assert.equal(goals.at(-1).status,'paused');
    assert.deepEqual(await runCodex({...options,control:{method:'thread/delete',params:{}}},()=>{}),{});
    const answer=await runCodex({...options,prompt:'ask',timeout:500,onRequest:async r=>{assert.equal(r.kind,'question');await new Promise(r=>setTimeout(r,700));return responseFor(r,{answers:{answer:'测试'}});}},()=>{});
    assert.match(answer,/测试/);
    assert.match(await runCodex({...options,prompt:'native',onRequest:r=>responseFor(r,{answers:{env:'staging'}})},()=>{}),/staging/);
    assert.match(await runCodex({...options,prompt:'approve',onRequest:r=>responseFor(r,{decision:'decline'})},()=>{}),/decline/);
    await assert.rejects(runCodex({...options,prompt:'fail'},()=>{}),/测试模型错误/);
    await assert.rejects(runCodex({...options,prompt:'timeout',timeout:250},()=>{}),/超时/);
    const controller=new AbortController();
    const cancelled=runCodex({...options,prompt:'ask',signal:controller.signal,onRequest:()=>{controller.abort();return new Promise(()=>{});}},()=>{});
    await assert.rejects(cancelled,/取消/);
    assert.throws(()=>responseFor({kind:'question',questions:[{id:'x'}]},{}),/回答所有问题/);
    assert.throws(()=>describeRequest('unknown',{}),/暂不支持/);
  } finally {if(previous===undefined) delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=previous;}
});
