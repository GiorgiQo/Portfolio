const config = window.PORTFOLIO_CONFIG;
export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let session = null;
export function setSession(value) { session = value; }
export async function request(path, { method = 'GET', body, headers = {}, authenticated = false } = {}) {
  if (!configured) throw new Error('ჯერ დაუკავშირე Supabase — ინსტრუქცია README.md ფაილშია.');
  if (authenticated && !session) throw new Error('გთხოვ, შეხვიდე ანგარიშში.');
  if (authenticated && session.expires_at < Date.now() / 1000 + 60) {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {method:'POST',headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    if (!response.ok) { session=null; throw new Error('სესია დასრულდა. ხელახლა შედი ანგარიშში.'); }
    session=await response.json();
    session.expires_at=Date.now()/1000+session.expires_in;
  }
  const response = await fetch(`${config.supabaseUrl}${path}`, {method, headers:{apikey:config.supabaseAnonKey,...(authenticated ? {Authorization:`Bearer ${session.access_token}`} : {}),...(body ? {'Content-Type':'application/json'} : {}),...headers},body:body ? JSON.stringify(body) : undefined});
  if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.msg || error.message || error.error_description || `მოთხოვნა ვერ შესრულდა (${response.status}).`); }
  return response.status === 204 || response.headers.get('content-length') === '0' ? null : response.text().then(text=>text ? JSON.parse(text) : null);
}
export async function login(email,password) {
  const value = await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  value.expires_at=Date.now()/1000+value.expires_in; setSession(value);
  try { const admins=await request('/rest/v1/portfolio_admins?select=user_id',{authenticated:true}); if(!admins.length) throw new Error('ამ ანგარიშს მართვის უფლება არ აქვს.'); }
  catch(error){setSession(null);throw error;}
}
export async function logout(){ try{await request('/auth/v1/logout',{method:'POST',authenticated:true});}finally{setSession(null);} }
export const getProjects = () => request('/rest/v1/projects?select=*&order=created_at.desc');
export const saveProject = data => request('/rest/v1/projects',{method:'POST',body:data,authenticated:true});
export const deleteProject = id => request(`/rest/v1/projects?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',authenticated:true});
export function validUrl(value) { try { const u=new URL(value); return u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)) ? u : null; } catch{return null;} }
export function videoSource(value) {
  const url=validUrl(value); if(!url) return null;
  let id;
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) id=url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
  if(url.hostname==='youtu.be') id=url.pathname.slice(1);
  if(id && /^[\w-]{11}$/.test(id)) return {kind:'embed',url:`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`};
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)) {const match=url.pathname.match(/\/(\d+)(?:\/([a-zA-Z0-9]+))?$/);if(match){const hash=match[2] || url.searchParams.get('h');return {kind:'embed',url:`https://player.vimeo.com/video/${match[1]}?autoplay=1${hash ? '&h='+encodeURIComponent(hash) : ''}`};}}
  if(/\.(mp4|webm|mov)$/i.test(url.pathname)) return {kind:'video',url:url.href};
  return null;
}
export async function upload(file,onProgress=()=>{}) {
  await request('/rest/v1/portfolio_admins?select=user_id',{authenticated:true});
  const extension=file.type==='video/mp4'?'mp4':file.type==='video/webm'?'webm':file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':file.type==='image/webp'?'webp':null;
  if(!extension) throw new Error('დაშვებულია MP4, WebM, JPG, PNG და WebP.');
  const limit=file.type.startsWith('image/')?10*1024*1024:50*1024*1024;
  if(file.size>limit) throw new Error(file.type.startsWith('image/')?'სურათის მაქსიმალური ზომაა 10 MB.':'ვიდეოს მაქსიმალური ზომაა 50 MB. დიდი ვიდეოსთვის გამოიყენე Vimeo / YouTube.');
  const path=`${crypto.randomUUID()}.${extension}`;
  await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`${config.supabaseUrl}/storage/v1/object/portfolio/${path}`);xhr.setRequestHeader('apikey',config.supabaseAnonKey);xhr.setRequestHeader('Authorization',`Bearer ${session.access_token}`);xhr.setRequestHeader('Content-Type',file.type);xhr.timeout=600000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`ატვირთვა ვერ შესრულდა (${xhr.status}). ხელახლა სცადე.`));xhr.onerror=()=>reject(new Error('ქსელის შეცდომა. შეამოწმე ინტერნეტი და ხელახლა სცადე.'));xhr.ontimeout=()=>reject(new Error('ატვირთვის დრო ამოიწურა. ხელახლა სცადე.'));xhr.send(file);});
  return {url:`${config.supabaseUrl}/storage/v1/object/public/portfolio/${path}`,path};
}
export const removeFiles = paths => paths.length ? request('/storage/v1/object/portfolio',{method:'DELETE',authenticated:true,body:{prefixes:paths}}) : Promise.resolve();
