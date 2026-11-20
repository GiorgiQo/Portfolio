import {adminComments,deleteComment} from './engagement-api.js';
const panel=document.createElement('section');panel.className='admin-panel';
const heading=document.createElement('h2');heading.textContent='კომენტარების მართვა';
const status=document.createElement('p');status.className='status';status.setAttribute('role','status');
const list=document.createElement('div');
const refresh=document.createElement('button');refresh.className='button secondary';refresh.textContent='განახლება';
const more=document.createElement('button');more.className='button secondary';more.textContent='მეტის ჩვენება';more.hidden=true;
panel.append(heading,refresh,status,list,more);document.querySelector('#dashboard').append(panel);
let offset=0,epoch=0,titles=new Map();
export function clearModeration(){epoch++;list.replaceChildren();offset=0;}
export function refreshModeration(projects){titles=new Map(projects.map(p=>[p.id,p.title]));return load(true);}
async function load(reset=false){
  const current=++epoch;refresh.disabled=true;more.disabled=true;status.textContent='კომენტარები იტვირთება…';
  try{
    const rows=await adminComments(reset?0:offset);if(current!==epoch)return;
    if(reset){list.replaceChildren();offset=0;}
    for(const row of rows){
      const article=document.createElement('article');article.className='moderation-comment';
      const title=document.createElement('strong');title.textContent=`${row.author_name} · ${titles.get(row.project_id)||'ვიდეო'}`;
      const body=document.createElement('p');body.textContent=row.body;
      const date=document.createElement('small');date.textContent=new Date(row.created_at).toLocaleString();
      const del=document.createElement('button');del.className='button secondary';del.textContent='კომენტარის წაშლა';
      del.onclick=async()=>{
        if(!confirm('წაიშალოს ეს კომენტარი?'))return;del.disabled=true;const actionEpoch=epoch;
        try{const deleted=await deleteComment(row.id);if(!deleted?.length)throw Error('No permission');if(actionEpoch!==epoch)return;await load(true);}
        catch{if(actionEpoch===epoch){status.textContent='წაშლა ვერ შესრულდა. შეამოწმე ადმინისტრატორის სესია და ხელახლა სცადე.';del.disabled=false;}}
      };
      article.append(title,date,body,del);list.append(article);
    }
    offset+=rows.length;more.hidden=rows.length<20;status.textContent=list.children.length?'':'კომენტარები ჯერ არ არის.';
  }catch{if(current===epoch)status.textContent='კომენტარები ვერ ჩაიტვირთა. თუ ფუნქციას პირველად რთავ, Supabase-ში გაუშვი supabase-engagement.sql და დააჭირე განახლებას.';}
  finally{if(current===epoch){refresh.disabled=false;more.disabled=false;}}
}
refresh.onclick=()=>load(true);more.onclick=()=>load();
