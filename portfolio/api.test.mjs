import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={PORTFOLIO_CONFIG:{supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'public-test-key'}};
const {videoSource,validUrl,request,login,setSession}=await import('./api.js');
test('YouTube URLs normalize to privacy-enhanced player',()=>{
  for(const url of ['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk','https://youtube.com/shorts/abcdefghijk']){
    assert.equal(videoSource(url).url,'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1');
  }
});
test('Vimeo preserves unlisted video hash',()=>{
  assert.equal(videoSource('https://vimeo.com/123456789/secret123').url,'https://player.vimeo.com/video/123456789?autoplay=1&h=secret123');
});
test('Unsafe schemes and deceptive video hosts are rejected',()=>{
  assert.equal(validUrl('javascript:alert(1)'),null);
  assert.equal(validUrl('data:text/html,test'),null);
  assert.equal(videoSource('https://youtube.com.attacker.test/watch?v=abcdefghijk'),null);
  assert.equal(videoSource('https://example.com/page.html'),null);
  assert.equal(videoSource('https://example.com/movie.mp4?token=abc').kind,'video');
});
test('Authenticated requests fail before fetch when signed out',async()=>{
  setSession(null);globalThis.fetch=()=>{throw new Error('Unexpected network call');};
  await assert.rejects(request('/rest/v1/projects',{authenticated:true}),/შეხვიდე/);
});
test('Login denies users without admin membership',async()=>{
  let calls=0;globalThis.fetch=async()=>new Response(JSON.stringify(calls++===0?{access_token:'token',refresh_token:'refresh',expires_in:3600}:[]),{status:200});
  await assert.rejects(login('user@example.com','test'),/მართვის უფლება/);
  await assert.rejects(request('/rest/v1/projects',{authenticated:true}),/შეხვიდე/);
});
