import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownHTML } from '../public/markdown.js';

test('Markdown 支持标题、列表、表格、代码和链接，阻止 HTML 与危险链接',()=>{
  const html=renderMarkdownHTML('# 标题\n\n**加粗**和`代码`\n\n- 一\n- 二\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = "<script>";\n```\n\n[文档](https://example.com)');
  for(const tag of ['h1','strong','code','ul','table','pre','a'])assert.match(html,new RegExp('<'+tag+'[ >]'));
  assert.match(html,/&lt;script&gt;/);assert.match(html,/rel="noopener noreferrer"/);
  for(const source of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','[点我](javascript:alert%281%29)','[点我](data:text/html;base64,PHNjcmlwdD4=)','![图片](javascript:alert%281%29)']){
    const output=renderMarkdownHTML(source);assert.doesNotMatch(output,/<(?:script|img)\b|href="(?:javascript|data):/i);
  }
  assert.doesNotMatch(renderMarkdownHTML('![图片](https://example.com/track.png)'),/<img/);
  assert.match(renderMarkdownHTML('```sh\necho hello'),/<pre><code/);
});
