import { request } from './api.js';
let visitor;
export function visitorId() {
  if (visitor) return visitor;
  try { visitor = localStorage.getItem('portfolio-visitor'); } catch {}
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(visitor || '')) visitor = crypto.randomUUID();
  try { localStorage.setItem('portfolio-visitor', visitor); } catch {}
  return visitor;
}
const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body });
export async function getEngagement(ids) {
  const rows=[];
  for(let i=0;i<ids.length;i+=100) rows.push(...await rpc('portfolio_engagement',{p_projects:ids.slice(i,i+100),p_visitor:visitorId()}));
  return rows;
}
export const setLike = (id,liked) => rpc('portfolio_set_like',{p_project:id,p_visitor:visitorId(),p_liked:liked});
export const getComments = (id,offset=0) => rpc('portfolio_comments',{p_project:id,p_offset:offset});
export function addComment(id,name,body,submissionId) {
  name=name.trim();body=body.trim();
  if(!name || name.length>60 || !body || body.length>1000) throw new Error('Enter your name and a comment of up to 1,000 characters.');
  return rpc('portfolio_add_comment',{p_id:submissionId,p_project:id,p_visitor:visitorId(),p_name:name,p_body:body});
}
export const adminComments = offset => request(`/rest/v1/project_comments?select=id,project_id,author_name,body,created_at&order=created_at.desc,id.desc&limit=20&offset=${offset}`,{authenticated:true});
export const deleteComment = id => request(`/rest/v1/project_comments?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',authenticated:true,headers:{Prefer:'return=representation'}});
