const key='codex-plus.admin-token';
export function savedToken(){try{return localStorage.getItem(key)||'';}catch{return '';}}
export function rememberToken(token){try{localStorage.setItem(key,token);return true;}catch{return false;}}
export function forgetToken(){try{localStorage.removeItem(key);}catch{/* Storage may be disabled by the browser. */}}
