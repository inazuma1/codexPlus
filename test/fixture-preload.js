import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
if (basename(process.argv[1] || '') === 'app-server') {
  const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
  let thread = 'fixture-thread', prompt = '', pendingType = '', goal = null, planMode = false, sandbox='',instructions='';
  const riskResult=(decision='execute',risk='low')=>({decision,risk,reason:'已核对当前项目测试、部署和恢复方式',plan:['修复项目代码','运行测试','部署并验证恢复'],canVerify:true,canRollback:true,needsClarification:false});
  function unattendedQuestion(){pendingType='unattended-question';emit({id:'server-1',method:'item/tool/call',params:{threadId:thread,turnId:'turn-1',tool:'bridge_ask_user',callId:'q-auto',arguments:{question:'缺少部署信息'}}});}
  const complete = text => {
    emit({method:planMode?'item/plan/delta':'item/agentMessage/delta',params:{threadId:thread,itemId:'a',delta:text}});
    emit({method:'item/completed',params:{threadId:thread,item:{id:'a',type:planMode?'plan':'agentMessage',text}}});
    emit({method:'turn/completed',params:{threadId:thread,turn:{id:'turn-1',status:'completed',error:null}}});
  };
  createInterface({input:process.stdin}).on('line',line=>{
    const m=JSON.parse(line);
    if(m.method==='initialize') emit({id:m.id,result:{}});
    if(m.method==='thread/start'||m.method==='thread/resume') {thread=m.params.threadId||thread;sandbox=m.params.sandbox;instructions=m.params.developerInstructions;emit({id:m.id,result:{thread:{id:thread},model:'fixture-model',reasoningEffort:'high'}});}
    if(m.method==='thread/goal/get') emit({id:m.id,result:{goal}});
    if(m.method==='thread/goal/set') {goal={...goal,...m.params,tokensUsed:goal?.tokensUsed||0};emit({id:m.id,result:{goal}});emit({method:'thread/goal/updated',params:{threadId:thread,goal}});}
    if(m.method==='thread/goal/clear') {goal=null;emit({id:m.id,result:{}});}
    if(m.method==='thread/delete') emit({id:m.id,result:{}});
    if(m.method==='thread/name/set') emit({id:m.id,result:{}});
    if(m.method==='turn/start') {
      planMode=m.params.collaborationMode?.mode==='plan';
      prompt=m.params.input[0].text;emit({id:m.id,result:{turn:{id:'turn-1'}}});
      if(process.env.FIXTURE_TURN_LOG)appendFileSync(process.env.FIXTURE_TURN_LOG,JSON.stringify({prompt,thread,sandbox,instructions,mode:m.params.collaborationMode?.mode})+'\n');
      const scenario=process.env.FIXTURE_WEBHOOK_SCENARIO||'advice';
      if(prompt.startsWith('WEBHOOK_ASSESSMENT')){
        if(scenario==='question-assess'){unattendedQuestion();return;}
        if(scenario==='invalid'){complete('不是有效的风险评估 JSON');return;}
        if(scenario==='approval-assess'){pendingType='assessment-approval';emit({id:'server-1',method:'item/commandExecution/requestApproval',params:{threadId:thread,turnId:'turn-1',itemId:'cmd',command:'echo inspect'}});return;}
        complete(JSON.stringify(scenario==='high'?riskResult('advise','high'):scenario==='advice'?riskResult('advise','unknown'):riskResult()));return;
      }
      if(prompt.startsWith('WEBHOOK_REPAIR')){
        if(scenario==='question-repair'){unattendedQuestion();return;}
        pendingType='unattended-repair';emit({id:'server-1',method:scenario==='permissions'?'item/permissions/requestApproval':'item/commandExecution/requestApproval',params:{threadId:thread,turnId:'turn-1',itemId:'cmd',command:'apply known fix and deploy',permissions:{network:{enabled:true}}}});return;
      }
      if(prompt.startsWith('CODEX_PLUS_WORKSPACE_INITIALIZATION')){if(process.env.FIXTURE_SKIP_AGENTS!=='true'&&!existsSync('AGENTS.md'))writeFileSync('AGENTS.md',prompt.split('AGENTS.md 内容模板：\n')[1],{flag:'wx'});complete('工作区初始化完成');return;}
      if(prompt.includes('timeout')) return;
      if(prompt.includes('fail')) {emit({method:'turn/completed',params:{threadId:thread,turn:{id:'turn-1',status:'failed',error:{message:'测试模型错误'}}}});return;}
      if(prompt.includes('ask')) {pendingType='ask';emit({id:'server-1',method:'item/tool/call',params:{threadId:thread,turnId:'turn-1',callId:'call-1',tool:'bridge_ask_user',arguments:{question:'请选择部署环境',options:['测试','生产']}}});return;}
      if(prompt.includes('native')) {pendingType='native';emit({id:'server-1',method:'item/tool/requestUserInput',params:{threadId:thread,turnId:'turn-1',itemId:'q',isBlocking:true,questions:[{id:'env',header:'环境',question:'请选择环境'}]}});return;}
      if(prompt.includes('permission')) {pendingType='permission';emit({id:'server-1',method:'item/permissions/requestApproval',params:{threadId:thread,turnId:'turn-1',permissions:{network:{enabled:true}},reason:'请审批网络权限'}});return;}
      if(prompt.includes('approve')) {pendingType='approve';emit({id:'server-1',method:prompt.includes('approve-file')?'item/fileChange/requestApproval':'item/commandExecution/requestApproval',params:{threadId:thread,turnId:'turn-1',itemId:'cmd',command:'echo test',reason:'请审批'}});return;}
      if(goal && prompt.includes('complete-goal')){goal.status='complete';emit({method:'thread/goal/updated',params:{threadId:thread,goal}});}
      complete((m.params.collaborationMode?.mode === 'plan' ? 'PLAN:' : '')+'回复：'+prompt);
    }
    if(m.id==='server-1'&&!m.method){
      if(pendingType==='assessment-approval'){complete(JSON.stringify(riskResult('advise','unknown')));return;}
      if(pendingType==='unattended-repair'){const accepted=m.result?.decision==='accept'||m.result?.permissions?.network?.enabled===true;if(accepted){writeFileSync('autofix.txt','fixed');if(!prompt.includes('本次只授权分支修复'))writeFileSync('deployed.txt','verified');}complete(accepted?'已修复、测试、部署并验证':'未执行修改与部署');return;}
      complete(pendingType+':'+JSON.stringify(m.result));
    }
  }).on('close',()=>process.exit(0));
  await new Promise(()=>{setInterval(()=>{},1000);});
}
