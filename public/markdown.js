import { Marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function safeLink(href) {
  try { return ['http:','https:','mailto:'].includes(new URL(href,'https://codex-plus.invalid/').protocol); } catch { return false; }
}
const markdown=new Marked({gfm:true,breaks:true,renderer:{
  html({text}) { return escape(text); },
  link({href,title,tokens}) {
    const label=this.parser.parseInline(tokens);
    if(!safeLink(href))return label;
    return `<a href="${escape(href)}"${title?` title="${escape(title)}"`:''} target="_blank" rel="noopener noreferrer">${label}</a>`;
  },
  image({href,text}) {
    const label=escape('图片：'+(text||'查看图片'));
    return safeLink(href)?`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label;
  },
}});

export function renderMarkdownHTML(text) { return markdown.parse(String(text || '')); }
export function markdownContent(text) {
  const element=document.createElement('div');element.className='content markdown';
  element.innerHTML=DOMPurify.sanitize(renderMarkdownHTML(text),{
    ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','ul','ol','li','blockquote','pre','code','hr','table','thead','tbody','tr','th','td','a','input','span'],
    ALLOWED_ATTR:['href','title','target','rel','class','start','type','checked','disabled','align'],
  });
  return element;
}
