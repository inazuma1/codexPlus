import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalSummary, approvalFromHistory } from '../public/approval-view.js';

test('审批只展示说明和权限类别，隐藏命令、路径、文件内容及原始请求',()=>{
  const command=approvalSummary({method:'item/commandExecution/requestApproval',details:{reason:'需要重新启动服务',proposedItem:{command:'sudo systemctl restart library',cwd:'/srv/library'},additionalPermissions:{network:{enabled:true}}}});
  assert.equal(command.title,'允许执行此操作？');
  assert.ok(command.fields.some(f=>f.value==='需要重新启动服务'));
  assert.doesNotMatch(JSON.stringify(command),/sudo systemctl|\/srv\/library|执行命令|执行目录/);
  const files=approvalSummary({method:'item/fileChange/requestApproval',details:{proposedItem:{changes:[{path:'old.js',kind:{type:'update',movePath:'new.js'},diff:'-old\n+new'},{path:'unused.js',kind:{type:'delete'}}]}}});
  assert.ok(files.fields.some(f=>f.label==='删除文件'&&f.value==='1 个文件'));
  assert.doesNotMatch(JSON.stringify(files),/old\.js|new\.js|unused\.js|-old/);
  const permissions=approvalSummary({method:'item/permissions/requestApproval',details:{permissions:{network:{enabled:true},fileSystem:{read:['/etc/library'],entries:[{access:'write',path:{type:'path',path:'/srv/library'}},{access:'deny',path:{type:'glob_pattern',pattern:'**/.env'}}]}}}});
  assert.ok(permissions.fields.some(f=>f.label==='允许写入'));
  assert.ok(permissions.fields.some(f=>f.label==='禁止访问'));
  assert.doesNotMatch(JSON.stringify(permissions),/\/etc\/library|\/srv\/library|\.env/);
  assert.ok(permissions.fields.some(f=>f.label==='授权期限'&&f.value==='本次执行轮次内有效'));
  for(const method of ['item/fileChange/requestApproval','item/commandExecution/requestApproval','item/permissions/requestApproval','unknown'])assert.doesNotMatch(JSON.stringify(approvalSummary({method})),/详细信息|展开/);
  assert.doesNotThrow(()=>approvalSummary({method:'unknown',details:{reason:{unexpected:true}}}));
  const history=approvalFromHistory('需要审批：\n'+JSON.stringify({command:'echo test'}));
  assert.equal(history.method,'item/commandExecution/requestApproval');
  assert.equal(history.automatic,false);
  assert.equal(approvalFromHistory('[自动审批] 已根据本会话设置允许本次操作。\n{"permissions":{}}').automatic,true);
  assert.equal(approvalFromHistory('需要审批：\nnot json'),null);
  assert.equal(approvalFromHistory('ordinary text'),null);
});
