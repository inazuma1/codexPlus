const text = value => typeof value === 'string' ? value : '';
export function approvalFromHistory(content) {
  const prefixes=['需要审批：\n','[自动审批] 已根据本会话设置允许本次操作。\n'];
  const prefix=prefixes.find(p=>typeof content==='string'&&content.startsWith(p));
  if(!prefix)return null;
  try {
    const details=JSON.parse(content.slice(prefix.length));
    if(!details||typeof details!=='object'||Array.isArray(details))return null;
    const item=details.proposedItem || {};
    const type=details.permissions?'permissions':details.command||item.command||item.type==='commandExecution'?'commandExecution':details.changes||item.changes||details.grantRoot||item.type==='fileChange'?'fileChange':null;
    return {details,method:type?`item/${type}/requestApproval`:'unknown',automatic:prefix.startsWith('[自动审批]')};
  }catch{return null;}
}
// Keep untrusted model/tool content as text; the caller renders it with textContent.
export function approvalSummary(request) {
  const d=request.details || {},item=d.proposedItem || {};
  const result={title:'确认操作',description:'Codex 正在等待你的授权。',fields:[],changes:[],notice:'允许本次只批准这次请求；拒绝后由 Codex 决定下一步。'};
  const add=(label,value)=>{if(typeof value==='string'&&value.trim())result.fields.push({label,value});};
  add('申请原因',text(d.reason));
  const permissions=p=>{
    if(!p||typeof p!=='object')return;
    if(p.network?.enabled===true)add('网络权限','允许联网');
    if(p.network?.enabled===false)add('网络权限','不允许联网');
    const fs=p.fileSystem || p.file_system;
    if(!fs)return;
    for(const [key,label] of [['read','允许读取'],['write','允许写入']])if(Array.isArray(fs[key])&&fs[key].length)add(label,`申请访问 ${fs[key].length} 个位置`);
    if(Array.isArray(fs.entries))for(const entry of fs.entries)add(({read:'允许读取',write:'允许写入',deny:'禁止访问'})[entry.access]||'文件访问范围','申请访问额外位置');
  };
  if(request.method==='item/commandExecution/requestApproval') {
    result.title='允许执行此操作？';result.description='Codex 需要执行操作以继续当前任务。';
    permissions(d.additionalPermissions);
  } else if(request.method==='item/fileChange/requestApproval') {
    result.title='允许修改这些文件？';result.description='批准后，Codex 将尝试应用以下文件变更。';
    const changes=Array.isArray(item.changes)?item.changes:Array.isArray(d.changes)?d.changes:[];
    if(changes.length){const counts=new Map();for(const change of changes){const kind=typeof change.kind==='string'?change.kind:change.kind?.type;const label=({add:'新增文件',delete:'删除文件',update:'修改文件'})[kind]||'文件变更';counts.set(label,(counts.get(label)||0)+1);}for(const [label,count] of counts)add(label,count+' 个文件');}
    if(d.grantRoot)add('写入权限','申请额外目录写入权限');
    if(!changes.length)add('操作内容','申请修改文件，以继续当前任务。');
  } else if(request.method==='item/permissions/requestApproval') {
    result.title='允许使用这些权限？';result.description='这些是 Codex 为当前任务申请的额外访问权限。';
    permissions(d.permissions);add('授权期限','本次执行轮次内有效');
    if(!result.fields.some(f=>['网络权限','允许读取','允许写入','禁止访问','文件访问范围'].includes(f.label)))add('权限范围','申请额外访问权限，以继续当前任务。');
  } else {
    add('操作详情','申请执行操作，以继续当前任务。');
  }
  return result;
}
