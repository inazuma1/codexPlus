import { approvalSummary, approvalFromHistory } from './approval-view.js';
import { markdownContent } from './markdown.js';
import { savedToken, rememberToken, forgetToken } from './auth-storage.js';
let token = '', selected = null, state = null, refreshing = false, messageSignature = '';
let renderedSession = null;
const $ = id => document.getElementById(id);
const labels = { pending:'等待汇总',queued:'排队中',running:'执行中',waiting:'等待你回应',done:'已完成',failed:'失败' };
const interactionPanel = document.createElement('div'); interactionPanel.id = 'interactions'; $('compose').before(interactionPanel);
let interactionSignature = '', streamStarted = false;
const controls = node('div',undefined,'mode-controls');
const modeSelect = node('select'); modeSelect.id='session-mode'; modeSelect.setAttribute('aria-label','会话模式');
for (const [value,label] of [['default','执行模式'],['plan','计划模式'],['goal','目标模式']]) {const o=node('option',label);o.value=value;modeSelect.append(o);}
const executePlan = node('button','按计划执行'), renameSession = node('button','重命名'), deleteSession = node('button','删除会话');
controls.append(modeSelect,executePlan,renameSession,deleteSession); document.querySelector('.chat .section-head').after(controls);
const approvalBar=node('div',undefined,'approval-bar'),approvalLabel=node('label'),autoApprove=node('input'),approvalHint=node('span');
autoApprove.type='checkbox';autoApprove.id='auto-approve';approvalLabel.append(autoApprove,document.createTextNode('本会话自动审批'));approvalBar.append(approvalLabel,approvalHint);controls.after(approvalBar);
async function setAutomaticApproval(enabled) {
  const id=selected;if(!id)return;
  autoApprove.disabled=true;
  try{await api(`/api/sessions/${id}/approval`,{method:'PATCH',body:JSON.stringify({autoApprove:enabled})});await refresh();}catch(e){error(e);}finally{renderModes();}
}
autoApprove.onchange=()=>setAutomaticApproval(autoApprove.checked);
const goalPanel=node('form',undefined,'goal-panel');goalPanel.hidden=true;
const objective=node('textarea');objective.rows=2;objective.maxLength=4000;objective.placeholder='希望 Codex 持续完成什么？';objective.setAttribute('aria-label','目标描述');
const budget=node('input');budget.type='number';budget.min=1000;budget.max=1000000;budget.value=40000;budget.setAttribute('aria-label','Token预算');
const turns=node('input');turns.type='number';turns.min=1;turns.max=100;turns.value=10;turns.setAttribute('aria-label','最大推进轮数');
const budgetLabel=node('label','Token预算');budgetLabel.append(budget);const turnsLabel=node('label','最多推进轮数');turnsLabel.append(turns);
const limits=node('div',undefined,'goal-limits');limits.append(budgetLabel,turnsLabel);
const goalStatus=node('p'), startGoal=node('button','设置并启动','primary'),pauseGoal=node('button','暂停'),resumeGoal=node('button','继续'),clearGoal=node('button','清除目标');
startGoal.type='submit';for(const b of [pauseGoal,resumeGoal,clearGoal])b.type='button';
goalPanel.append(objective,limits,goalStatus,startGoal,pauseGoal,resumeGoal,clearGoal);approvalBar.after(goalPanel);
let goalSession=null;
async function ensureSession(mode='default') {if(!selected){const s=await api('/api/sessions',{method:'POST',body:JSON.stringify({title:'新对话',mode})});selected=s.id;messageSignature='';}return selected;}
async function goalAction(action) {try{const id=await ensureSession('goal');const data={action};if(action==='start')Object.assign(data,{objective:objective.value,tokenBudget:Number(budget.value),maxTurns:Number(turns.value)});await api(`/api/sessions/${id}/goal`,{method:'POST',body:JSON.stringify(data)});await refresh();}catch(e){error(e);}}
modeSelect.onchange=async()=>{try{const mode=modeSelect.value,id=await ensureSession(mode);await api(`/api/sessions/${id}`,{method:'PATCH',body:JSON.stringify({mode})});await refresh();}catch(e){error(e);await refresh();}};
goalPanel.onsubmit=e=>{e.preventDefault();goalAction('start');};pauseGoal.onclick=()=>goalAction('pause');resumeGoal.onclick=()=>goalAction('resume');clearGoal.onclick=()=>goalAction('clear');
executePlan.onclick=async()=>{try{await api(`/api/sessions/${selected}`,{method:'PATCH',body:JSON.stringify({mode:'default'})});await api(`/api/sessions/${selected}/messages`,{method:'POST',body:JSON.stringify({content:'请按照本会话已确认的计划开始执行。'})});await refresh();}catch(e){error(e);}};
deleteSession.onclick=async()=>{
  if(!selected||!confirm('删除此会话及其消息、任务和 Codex 原生历史？原始 Webhook 事件会保留。此操作无法在网页撤销。'))return;
  try{await api(`/api/sessions/${selected}`,{method:'DELETE'});selected=null;messageSignature='';$('messages').replaceChildren(node('div','会话已删除，可以新建对话。','empty'));interactionSignature='';await refresh();}catch(e){error(e);}
};
renameSession.onclick=async()=>{
  const s=state?.sessions.find(s=>s.id===selected);if(!s)return;
  const value=prompt('输入会话标题（1–100字符）',s.title);if(value===null)return;
  const title=value.trim();if(!title||title.length>100){error(new Error('标题需为1–100字符'));return;}
  renameSession.disabled=true;
  try{await api(`/api/sessions/${s.id}`,{method:'PATCH',body:JSON.stringify({title})});await refresh();}catch(e){error(e);}finally{renderModes();}
};
function renderModes() {
  const s=state.sessions.find(s=>s.id===selected),busy=state.jobs.some(j=>j.session_id===selected&&['queued','running','waiting'].includes(j.status));
  modeSelect.value=s?.mode||'default';modeSelect.disabled=busy;deleteSession.disabled=!s||busy;deleteSession.title=busy?'请先停止任务再删除':'';
  renameSession.disabled=!s||busy;renameSession.title=busy?'任务结束或停止后可重命名':'';
  autoApprove.checked=s?.auto_approve===true;autoApprove.disabled=!s;
  approvalHint.textContent=s?.auto_approve?(s.mode==='plan'?'计划模式下暂停自动审批':'已开启 · 操作审批自动同意，普通提问仍需回答'):'已关闭 · 每次操作审批单独确认';
  executePlan.hidden=s?.mode!=='plan';executePlan.disabled=busy;
  goalPanel.hidden=s?.mode!=='goal';
  if(goalSession!==selected){goalSession=selected;objective.value=s?.goal?.objective||'';budget.value=s?.goal?.tokenBudget||40000;turns.value=s?.goalConfig?.maxTurns||10;}
  const labels={active:'推进中',paused:'已暂停',blocked:'遇到阻塞',complete:'已完成',usageLimited:'用量受限',budgetLimited:'预算已用完'};
  goalStatus.textContent=s?.goal?`${labels[s.goal.status]||s.goal.status} · Token ${s.goal.tokensUsed||0}/${s.goal.tokenBudget||'不限'} · 已推进 ${s.goalConfig?.turns||0}/${s.goalConfig?.maxTurns||10} 轮`:'填写目标并启动；每轮完成后自动继续，达到预算或轮数限制后停止。';
  startGoal.disabled=busy;pauseGoal.disabled=s?.goal?.status!=='active';resumeGoal.disabled=!s?.goal||s.goal.status==='active'||busy;clearGoal.disabled=!s?.goal;
}
function renderLive() {
  const items = (state?.activity || []).filter(a => a.session_id === selected);
  let live = $('live-output');
  if (!items.length) { live?.remove(); return; }
  if (!live) { live = node('article', undefined, 'assistant'); live.id = 'live-output'; $('messages').append(live); }
  const nearBottom = $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 100;
  live.replaceChildren(node('div', 'CODEX · 正在回复', 'role'), markdownContent(items.map(a => a.text || '正在处理…').join('\n\n')));
  if (nearBottom) $('messages').scrollTop = $('messages').scrollHeight;
}
function renderApprovalContent(parent,r) {
  const view=approvalSummary(r);parent.append(node('p',view.description));
  const fields=node('dl',undefined,'approval-fields');
  for(const field of view.fields)fields.append(node('dt',field.label),node('dd',field.value));
  parent.append(fields);
}
function renderInteractions() {
  const requests = (state?.requests || []).filter(r => r.session_id === selected);
  const signature = JSON.stringify(requests);
  if (signature === interactionSignature) return;
  interactionSignature = signature;
  interactionPanel.replaceChildren(...requests.map(r => {
    const form = node('form', undefined, 'interaction-card');
    form.append(node('h3', r.kind === 'question' ? 'Codex 需要你的回答' : approvalSummary(r).title));
    async function submit(value) {
      const buttons = form.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
      try { await api(`/api/interactions/${r.id}/respond`, {method:'POST',body:JSON.stringify(value)}); interactionSignature = ''; await refresh(); }
      catch(e) { error(e); buttons.forEach(b => b.disabled = false); }
    }
    if (r.kind === 'question') {
      const fields = new Map();
      for (const q of r.questions) {
        const label = node('label', q.question), input = node('input'); input.type = q.isSecret ? 'password' : 'text'; input.required = true; input.maxLength = 20000; input.autocomplete = 'off'; label.append(input); form.append(label); fields.set(q.id, input);
        const choices = node('div', undefined, 'choices');
        for (const option of q.options || []) { const b = node('button', option.label); b.type = 'button'; b.title = option.description || ''; b.onclick = () => { input.value = option.label; input.focus(); }; choices.append(b); }
        form.append(choices);
      }
      const button = node('button', '提交回答并继续', 'primary'); button.type = 'submit'; form.append(button);
      form.onsubmit = e => { e.preventDefault(); submit({answers:Object.fromEntries([...fields].map(([id,input])=>[id,input.value]))}); };
    } else {
      renderApprovalContent(form,r);form.append(node('p',approvalSummary(r).notice,'approval-notice'));
      const actions=node('div',undefined,'approval-actions');
      for (const [decision, text] of [['accept','允许本次操作'],['decline','拒绝本次操作'],['cancel','取消本次请求']]) { const b = node('button', text, decision === 'accept' ? 'primary' : ''); b.type = 'button'; b.onclick = () => submit({decision}); actions.append(b); }
      if(state.sessions.find(s=>s.id===r.session_id)?.mode!=='plan'){const automatic=node('button','允许并自动同意本会话后续操作');automatic.title='同时开启本会话自动审批，可在会话顶部随时关闭';automatic.type='button';automatic.onclick=()=>setAutomaticApproval(true);actions.append(automatic);}
      form.append(actions);
    }
    const cancel = node('button', '停止此任务'); cancel.type = 'button'; cancel.onclick = async () => { try { await api(`/api/jobs/${r.job_id}/cancel`,{method:'POST'}); await refresh(); } catch(e) {error(e);} }; form.append(cancel);
    return form;
  }));
}
async function connectStream() {
  if (streamStarted) return; streamStarted = true;
  while (token) {
    try {
      const streamToken=token;
      const res = await fetch('/api/events', {headers:{Authorization:`Bearer ${streamToken}`}});
      if(res.status===401){if(token===streamToken)expireLogin();break;}
      if (!res.ok) throw new Error('实时连接失败');
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (token) {
        const {done,value} = await reader.read(); if (done) break;
        buffer += decoder.decode(value,{stream:true});
        let boundary;
        while ((boundary=buffer.indexOf('\n\n'))>=0) {
          const block = buffer.slice(0,boundary); buffer=buffer.slice(boundary+2);
          const line = block.split('\n').find(line=>line.startsWith('data: ')); if (!line) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'activity' && state) { state.activity=event.activity; state.requests=event.requests; renderInteractions(); renderLive(); }
          else refresh().catch(error);
        }
      }
    } catch { $('connection').textContent = '实时连接重连中'; }
    if (token) await new Promise(r=>setTimeout(r,2000));
  }
  streamStarted = false;
}
function node(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function error(e) { $('error').textContent = e.message; $('error').hidden = false; setTimeout(() => $('error').hidden = true, 6000); }
function expireLogin(){token='';forgetToken();$('login-error').textContent='访问令牌已失效，请重新输入。';if(!$('login').open)$('login').showModal();}
async function api(path, options = {}) { const requestToken=token;const res = await fetch(path, { ...options, headers: { 'Authorization': `Bearer ${requestToken}`, 'Content-Type': 'application/json' } }); const value = await res.json(); if (!res.ok) { if (res.status === 401&&token===requestToken) expireLogin(); throw new Error(value.error); } return value; }
function date(s) { return new Date(s).toLocaleString('zh-CN', { hour12:false }); }
async function select(id) { selected = id; messageSignature = ''; await refresh(); }
function renderState() {
  if(selected&&!state.sessions.some(s=>s.id===selected)){selected=null;messageSignature='';$('messages').replaceChildren(node('div','请选择或新建对话。','empty'));}
  renderModes();
  document.querySelector('.compose-bottom span').textContent = state.sandbox === 'workspace-write' ? '工作目录可读写 · 服务端模型配置' : '只读排查 · 服务端模型配置';
  $('mode').textContent = state.mock ? '模拟模式 · MOCK' : 'CODEX · 已连接';
  $('connection').textContent = '服务已连接';
  $('sessions').replaceChildren(...state.sessions.map(s => { const b = node('button', s.title, selected === s.id ? 'active' : ''); b.onclick = () => select(s.id).catch(error); return b; }));
  $('title').textContent = state.sessions.find(s => s.id === selected)?.title || '事件与对话，在这里连接。';
  $('count').textContent = `最近 ${state.hooks.length} 条`;
  $('hooks').replaceChildren(...(state.hooks.length ? state.hooks.map(h => {
    const box = node('div', undefined, 'hook'), top = node('div', undefined, 'hook-top');
    top.append(node('span', h.source, 'source'), node('span', labels[h.status], 'status ' + h.status));
    const p = JSON.parse(h.payload); const summary = p.commonAnnotations?.summary || p.alerts?.[0]?.annotations?.summary || p.message || p.title || p.commonLabels?.alertname || '收到外部事件';
    box.append(top, node('p', typeof summary === 'string' ? summary.slice(0, 160) : JSON.stringify(summary).slice(0, 160)), node('time', date(h.received_at)));
    const details = node('details'); details.append(node('summary', '原始事件'), node('pre', JSON.stringify(p, null, 2))); box.append(details);
    if (h.session_id) { const b = node('button', '查看分析 ↗'); b.onclick = () => select(h.session_id).catch(error); box.append(document.createElement('br'), b); }
    return box;
  }) : [node('div','暂无事件，等待 Webhook 接入','empty')]));
  $('jobs').replaceChildren(...(state.jobs.length ? state.jobs.slice(0, 8).map(j => {
    const d = node('div', undefined, 'job'); d.append(node('span', '#' + j.id), node('span', labels[j.status], 'status ' + j.status));
    const b = node('button', '查看'); b.onclick = () => select(j.session_id).catch(error); d.append(b);
    if (j.status === 'failed') { const retry = node('button', '重试'); retry.title = j.error; retry.onclick = async () => { try { await api(`/api/jobs/${j.id}/retry`, { method:'POST' }); await refresh(); } catch(e) { error(e); } }; d.append(retry); }
    if (['queued','running','waiting'].includes(j.status)) { const cancel = node('button','停止'); cancel.onclick = async () => { try {await api(`/api/jobs/${j.id}/cancel`,{method:'POST'});await refresh();} catch(e){error(e);} };d.append(cancel); }
    return d;
  }) : [node('div','任务会在这里显示','empty')]));
  const pending = state.jobs.filter(j => j.session_id === selected && ['queued','running','waiting'].includes(j.status));
  $('job-status').textContent = pending.length ? `${pending.length} 个任务 · ${pending.some(j=>j.status==='waiting') ? '等待你的回答或审批' : pending.some(j => j.status === 'running') ? 'Codex 正在执行…' : '等待处理'}` : '就绪';
  $('send').disabled = pending.length > 0;
  renderInteractions();
}
async function refresh() {
  if (!token || refreshing) return;
  refreshing = true;
  try {
    state = await api('/api/state'); renderState();
    if (selected) {
      const id = selected, messages = await api(`/api/sessions/${id}/messages`);
      if (id !== selected) return;
      const signature = JSON.stringify(messages);
      if (signature !== messageSignature || renderedSession !== id) {
        messageSignature = signature;
        const atBottom = renderedSession !== id || $('messages').scrollHeight - $('messages').scrollTop - $('messages').clientHeight < 90;
        $('messages').replaceChildren(...messages.map(m => { const a = node('article', undefined, m.role), role = node('div', undefined, 'role'); role.append(node('span', m.role === 'user' ? '你 / 外部事件' : m.role === 'error' ? '执行错误' : 'CODEX'), node('time', date(m.created_at)));a.append(role);const approval=m.role==='assistant'?approvalFromHistory(m.content):null;if(approval){const content=node('div',undefined,'approval-history');content.append(node('p',approval.automatic?'已自动允许操作':'操作审批记录'));renderApprovalContent(content,approval);a.append(content);}else a.append(m.role==='error'?node('div',m.content,'content'):markdownContent(m.content));return a; }));
        if (!messages.length) $('messages').append(node('div','对话已创建，发送第一条消息。','empty'));
        renderedSession = id;
        if (atBottom) $('messages').scrollTop = $('messages').scrollHeight;
      }
      renderLive();
    }
  } finally { refreshing = false; }
}
$('login').addEventListener('cancel', e => { if (!token) e.preventDefault(); });
async function signIn(value){token=value;await refresh();if(!token)throw new Error('访问令牌已失效');const remembered=rememberToken(token);$('login').close();$('token').value='';$('login-error').textContent='';connectStream();if(!remembered)error(new Error('浏览器禁止保存令牌，本次登录可用，刷新后需重新输入。'));}
$('auth').onsubmit = async e => { e.preventDefault();const button=$('auth').querySelector('button');button.disabled=true;try{await signIn($('token').value.trim());}catch(e){token='';$('login-error').textContent=e.message;}finally{button.disabled=false;} };
$('logout').onclick = () => {token='';forgetToken();location.reload();};
async function restoreLogin(){const saved=savedToken();if(!saved){$('login').showModal();return;}try{await signIn(saved);}catch(e){token='';$('login-error').textContent='自动登录失败：'+e.message;if(!$('login').open)$('login').showModal();}}
restoreLogin();
$('new').onclick = async () => { try { const s = await api('/api/sessions', { method:'POST', body:JSON.stringify({ title:'新对话 · ' + new Date().toLocaleTimeString('zh-CN') }) }); await select(s.id); $('input').focus(); } catch(e) { error(e); } };
$('compose').onsubmit = async e => { e.preventDefault(); const text = $('input').value.trim(); if (!text) return; $('send').disabled = true; try { if (!selected) { const s = await api('/api/sessions', { method:'POST', body:JSON.stringify({ title:text.slice(0, 30) }) }); selected = s.id; messageSignature = ''; } await api(`/api/sessions/${selected}/messages`, { method:'POST', body:JSON.stringify({ content:text }) }); $('input').value = ''; await refresh(); } catch(e) { error(e); } finally { $('send').disabled = false; } };
setInterval(() => refresh().catch(e => { $('connection').textContent = '连接中断'; error(e); }), 2000);
