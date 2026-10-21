import { createInterface } from 'node:readline';
import { basename } from 'node:path';
if (basename(process.argv[1] || '') === 'app-server') {
  const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
  let thread = 'fixture-thread', prompt = '', pendingType = '', goal = null, planMode = false;
  const complete = text => {
    emit({method:planMode?'item/plan/delta':'item/agentMessage/delta',params:{threadId:thread,itemId:'a',delta:text}});
    emit({method:'item/completed',params:{threadId:thread,item:{id:'a',type:planMode?'plan':'agentMessage',text}}});
    emit({method:'turn/completed',params:{threadId:thread,turn:{id:'turn-1',status:'completed',error:null}}});
  };
  createInterface({input:process.stdin}).on('line',line=>{
    const m=JSON.parse(line);
    if(m.method==='initialize') emit({id:m.id,result:{}});
    if(m.method==='thread/start'||m.method==='thread/resume') {thread=m.params.threadId||thread;emit({id:m.id,result:{thread:{id:thread},model:'fixture-model',reasoningEffort:'high'}});}
    if(m.method==='thread/goal/get') emit({id:m.id,result:{goal}});
    if(m.method==='thread/goal/set') {goal={...goal,...m.params,tokensUsed:goal?.tokensUsed||0};emit({id:m.id,result:{goal}});emit({method:'thread/goal/updated',params:{threadId:thread,goal}});}
    if(m.method==='thread/goal/clear') {goal=null;emit({id:m.id,result:{}});}
    if(m.method==='thread/delete') emit({id:m.id,result:{}});
    if(m.method==='thread/name/set') emit({id:m.id,result:{}});
    if(m.method==='turn/start') {
      planMode=m.params.collaborationMode?.mode==='plan';
      prompt=m.params.input[0].text;emit({id:m.id,result:{turn:{id:'turn-1'}}});
      if(prompt.includes('timeout')) return;
      if(prompt.includes('fail')) {emit({method:'turn/completed',params:{threadId:thread,turn:{id:'turn-1',status:'failed',error:{message:'测试模型错误'}}}});return;}
      if(prompt.includes('ask')) {pendingType='ask';emit({id:'server-1',method:'item/tool/call',params:{threadId:thread,turnId:'turn-1',callId:'call-1',tool:'bridge_ask_user',arguments:{question:'请选择部署环境',options:['测试','生产']}}});return;}
      if(prompt.includes('native')) {pendingType='native';emit({id:'server-1',method:'item/tool/requestUserInput',params:{threadId:thread,turnId:'turn-1',itemId:'q',isBlocking:true,questions:[{id:'env',header:'环境',question:'请选择环境'}]}});return;}
      if(prompt.includes('permission')) {pendingType='permission';emit({id:'server-1',method:'item/permissions/requestApproval',params:{threadId:thread,turnId:'turn-1',permissions:{network:{enabled:true}},reason:'请审批网络权限'}});return;}
      if(prompt.includes('approve')) {pendingType='approve';emit({id:'server-1',method:prompt.includes('approve-file')?'item/fileChange/requestApproval':'item/commandExecution/requestApproval',params:{threadId:thread,turnId:'turn-1',itemId:'cmd',command:'echo test',reason:'请审批'}});return;}
      if(goal && prompt.includes('complete-goal')){goal.status='complete';emit({method:'thread/goal/updated',params:{threadId:thread,goal}});}
      complete((m.params.collaborationMode?.mode === 'plan' ? 'PLAN:' : '')+'回复：'+prompt);
    }
    if(m.id==='server-1'&&!m.method) complete(pendingType+':'+JSON.stringify(m.result));
  }).on('close',()=>process.exit(0));
  await new Promise(()=>{setInterval(()=>{},1000);});
}
