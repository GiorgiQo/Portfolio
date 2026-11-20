import {configured} from './api.js';
import {getEngagement,setLike,getComments,addComment} from './engagement-api.js';
const stats=new Map(), pending=new Set();
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
const message=el('div','engagement-toast');message.setAttribute('role','status');document.body.append(message);
let timer;
function notify(text){message.textContent=text;message.hidden=false;clearTimeout(timer);timer=setTimeout(()=>message.hidden=true,4500);}
message.hidden=true;
function paint(id){
  const data=stats.get(id);
  for(const node of document.querySelectorAll('[data-engagement-id]')){
    if(node.dataset.engagementId!==id)continue;
    const like=node.querySelector('.like-button');
    like.disabled=!data||pending.has(id);
    like.setAttribute('aria-pressed',String(Boolean(data?.liked)));
    like.textContent=`${data?.liked?'♥':'♡'} ${data?.liked?'Liked':'Like'}${data?' · '+data.likes:''}`;
    like.setAttribute('aria-label',data?`${data.liked?'Unlike':'Like'} this video. ${data.likes} likes.`:'Likes are currently unavailable');
    const count=node.querySelector('.comment-count');
    count.textContent=data?`${data.comments} ${Number(data.comments)===1?'comment':'comments'}`:'Comments';
  }
}
export async function loadEngagement(ids){
  if(!configured)return;
  try{for(const row of await getEngagement(ids)){stats.set(row.project_id,row);paint(row.project_id);}}catch{/* Missing migration must not prevent video playback. */}
}
export function engagementBar(id,onComments){
  const bar=el('div','engagement-bar');bar.dataset.engagementId=id;
  const like=el('button','like-button','♡ Like');like.type='button';like.disabled=true;like.setAttribute('aria-pressed','false');
  like.onclick=async()=>{
    if(pending.has(id)||!stats.has(id))return;
    const previous=stats.get(id),desired=!previous.liked;
    pending.add(id);paint(id);
    try{
      await setLike(id,desired);
      stats.set(id,{...previous,liked:desired,likes:Math.max(0,Number(previous.likes)+(desired?1:-1))});
      paint(id);await loadEngagement([id]);
    }catch{notify('Your like could not be saved. Please try again.');}
    finally{pending.delete(id);paint(id);}
  };
  const comments=el('button','comment-count','Comments');comments.type='button';comments.onclick=onComments;
  bar.append(like,comments);queueMicrotask(()=>paint(id));return bar;
}
let dispose=()=>{};
export function closeDiscussion(){dispose();dispose=()=>{};}
export function openDiscussion(project,focus=false){
  closeDiscussion();let active=true,offset=0,loading=false,posting=false,submission=null;
  dispose=()=>{active=false;};
  const host=document.querySelector('#discussion');host.replaceChildren();
  const heading=el('h3','','Join the conversation');heading.tabIndex=-1;
  const list=el('div','comment-list');
  const status=el('p','discussion-status','Loading comments…');status.setAttribute('role','status');
  const more=el('button','button secondary','Load more comments');more.type='button';more.hidden=true;
  const retry=el('button','button secondary','Try again');retry.type='button';retry.hidden=true;
  const form=el('form','comment-form');
  const nameLabel=el('label','','Your name'),name=el('input');name.id='comment-name';nameLabel.htmlFor=name.id;name.required=true;name.maxLength=60;name.autocomplete='name';
  const bodyLabel=el('label','','Your comment'),body=el('textarea');body.id='comment-body';bodyLabel.htmlFor=body.id;body.required=true;body.maxLength=1000;body.rows=3;body.placeholder='What did you think of this video?';
  const note=el('p','comment-note','Your name and comment will be public. Up to 1,000 characters.');body.setAttribute('aria-describedby','comment-note');note.id='comment-note';
  const trap=el('input','comment-trap');trap.name='website';trap.tabIndex=-1;trap.autocomplete='off';trap.setAttribute('aria-hidden','true');
  const submit=el('button','button primary','Post comment');submit.type='submit';submit.disabled=true;
  const feedback=el('p','discussion-status');feedback.setAttribute('role','status');
  form.append(nameLabel,name,bodyLabel,body,note,trap,submit,feedback);
  host.append(engagementBar(project.id,()=>heading.focus()),heading,status,retry,list,more,form);
  if(focus)heading.focus();
  if(!configured){status.textContent='Comments and likes are available on published projects.';return;}
  async function page(reset=false){
    if(loading)return;loading=true;more.disabled=true;retry.hidden=true;
    try{
      const rows=await getComments(project.id,reset?0:offset);
      if(!active)return;
      if(reset){offset=0;list.replaceChildren();}
      for(const row of rows){
        if([...list.children].some(n=>n.dataset.commentId===row.id))continue;
        const item=el('article','comment');item.dataset.commentId=row.id;
        const meta=el('div','comment-meta'),date=el('time');date.dateTime=row.created_at;date.textContent=new Date(row.created_at).toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'});
        meta.append(el('strong','',row.author_name),date);item.append(meta,el('p','',row.body));list.append(item);
      }
      offset+=rows.length;more.hidden=rows.length<20;
      status.textContent=list.children.length?'':'No comments yet. Be the first to share your thoughts.';
      submit.disabled=posting;
    }catch{if(active){status.textContent='Comments are temporarily unavailable. Please try again later.';retry.hidden=false;}}
    finally{loading=false;if(active)more.disabled=false;}
  }
  more.onclick=()=>page();retry.onclick=()=>{page(true);loadEngagement([project.id]);};
  form.onsubmit=async event=>{
    event.preventDefault();if(posting||trap.value)return;
    const author=name.value.trim(),text=body.value.trim();
    if(!author||!text){feedback.textContent='Please enter your name and a comment.';return;}
    const key=JSON.stringify([author,text]);if(submission?.key!==key)submission={key,id:crypto.randomUUID()};
    posting=true;submit.disabled=true;feedback.textContent='Posting your comment…';
    try{
      await addComment(project.id,author,text,submission.id);
      if(!active)return;
      body.value='';submission=null;feedback.textContent='Your comment has been posted. Thank you!';
      const previous=stats.get(project.id);if(previous){stats.set(project.id,{...previous,comments:Number(previous.comments)+1});paint(project.id);}
      await page(true);await loadEngagement([project.id]);
    }catch(error){if(active)feedback.textContent=/wait 30 seconds|daily comment limit|Enter your name/.test(error.message)?error.message:'Your comment could not be saved. Please try again.';}
    finally{posting=false;if(active)submit.disabled=false;}
  };
  page(true);loadEngagement([project.id]);
}
