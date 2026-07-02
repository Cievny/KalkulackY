// Shared auth + navigation for cievny.sk tools
// Supabase Auth (JWT) s fallbackom na legacy heslo počas migrácie.
(function(){
  const HASH='1361e98fcf8c152a1f48690a2ec88c9fafb11c5a1355c3a2aa000154092065fc'; // legacy fallback
  const KEY='cievny_auth';
  const SB_URL='https://ncqtiicfqhaturjlfxcj.supabase.co';
  const SB_ANON='sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k';
  const AUTH_EMAIL='oira@cievny.sk'; // spoločný účet – fallback, keď sa nezadá email
  const TK=KEY+'_at', RK=KEY+'_rt', XK=KEY+'_exp', EK=KEY+'_email';

  async function sha256(str){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function storeSession(d){
    sessionStorage.setItem(KEY,'1');
    if(d&&d.access_token){
      sessionStorage.setItem(TK,d.access_token);
      sessionStorage.setItem(RK,d.refresh_token||'');
      sessionStorage.setItem(XK,String(Date.now()+(d.expires_in?d.expires_in*1000:3600000)));
      if(d.user&&d.user.email)sessionStorage.setItem(EK,d.user.email);
    }
  }

  // Email prihláseného používateľa ('' pri legacy/spoločnom prihlásení bez emailu)
  window.sbUserEmail=function(){
    return sessionStorage.getItem(EK)||'';
  };

  // Token pre REST volania: JWT prihláseného usera, fallback na anon kľúč (kým nie je RLS sprísnené)
  window.sbToken=function(){
    return sessionStorage.getItem(TK)||SB_ANON;
  };
  window.sbHeaders=function(){
    return {'apikey':SB_ANON,'Authorization':'Bearer '+window.sbToken(),'Content-Type':'application/json'};
  };

  async function refreshToken(){
    const rt=sessionStorage.getItem(RK);
    if(!rt)return false;
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:rt})
      });
      if(!r.ok)return false;
      storeSession(await r.json());
      return true;
    }catch(e){return false;}
  }

  function scheduleRefresh(){
    setInterval(()=>{
      const exp=parseInt(sessionStorage.getItem(XK)||'0');
      if(exp&&Date.now()>exp-10*60000)refreshToken();
    },5*60000);
  }

  window.checkAuth=function(){
    if(sessionStorage.getItem(KEY)!=='1'){
      sessionStorage.setItem('cievny_return',location.pathname);
      location.replace('/tools/login/');
      return;
    }
    const exp=parseInt(sessionStorage.getItem(XK)||'0');
    if(exp&&Date.now()>exp-10*60000)refreshToken();
    scheduleRefresh();
  };

  window.doLogin=async function(){
    const pw=document.getElementById('pw').value;
    const emailEl=document.getElementById('email');
    const email=emailEl?emailEl.value.trim():'';
    const msg=document.getElementById('login-msg');
    msg.textContent='Prihlasujem…';msg.style.color='#6b7280';
    function go(){
      const ret=sessionStorage.getItem('cievny_return')||'/tools/EVK/';
      sessionStorage.removeItem('cievny_return');
      location.replace(ret);
    }
    // 1) Supabase Auth – vlastný email; bez emailu spoločný účet
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
        body:JSON.stringify({email:email||AUTH_EMAIL,password:pw})
      });
      if(r.ok){storeSession(await r.json());go();return;}
    }catch(e){/* sieť — skús legacy */}
    // 2) Legacy fallback len bez zadaného emailu (kým RLS povoľuje anon zápis)
    if(!email){
      const h=await sha256(pw);
      if(h===HASH){storeSession(null);go();return;}
    }
    msg.textContent=email?'Nesprávny email alebo heslo.':'Nesprávne heslo.';
    msg.style.color='#dc2626';
    document.getElementById('pw').value='';
    document.getElementById('pw').focus();
  };

  window.doLogout=function(){
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(RK);
    sessionStorage.removeItem(XK);
    sessionStorage.removeItem(EK);
    location.replace('/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/tools/EVK/',label:'EVK'},
    {href:'/tools/CAS-generator/',label:'CAS'},
    {href:'/tools/PEVAR/',label:'PEVAR'},
    {href:'/tools/Aorta/',label:'📥 Požiadavky'},
    {href:'/tools/analytics/',label:'📊 Štatistiky'},
    {href:'/tools/zaznamy/',label:'📁 Záznamy'},
    {href:'/tools/ideas/',label:'💡 Nápady'},
    {href:'/tools/zaloha/',label:'💾 Záloha'},
  ];

  function injectNav(){
    if(location.pathname.includes('/login'))return; // na login stránke nav nezobrazuj
    const existing=document.querySelector('.shared-nav');
    if(existing)return;
    const nav=document.createElement('div');
    nav.className='shared-nav';
    nav.style.cssText='background:#0f1e3d;display:flex;align-items:center;padding:0 16px;gap:2px;position:sticky;top:0;z-index:200;';
    const cur=location.pathname.replace(/\/$/,'');
    NAV_LINKS.forEach(l=>{
      const a=document.createElement('a');
      a.href=l.href;
      const active=cur===l.href.replace(/\/$/,'');
      a.style.cssText='padding:9px 16px;font-size:13px;font-weight:600;color:'+(active?'#fff':'#8fa3c8')+';text-decoration:none;border-bottom:3px solid '+(active?'#3b82f6':'transparent')+';transition:.15s;';
      a.onmouseover=()=>{if(!active)a.style.color='#fff';};
      a.onmouseout=()=>{if(!active)a.style.color='#8fa3c8';};
      a.textContent=l.label;
      nav.appendChild(a);
    });
    const spacer=document.createElement('div');spacer.style.flex='1';nav.appendChild(spacer);
    const ue=window.sbUserEmail?window.sbUserEmail():'';
    if(ue){
      const who=document.createElement('span');
      who.textContent='👤 '+ue;
      who.style.cssText='font-size:12px;color:#8fa3c8;margin-right:10px;white-space:nowrap;';
      nav.appendChild(who);
    }
    const out=document.createElement('button');
    out.textContent='Odhlásiť';
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #4a5568;color:#8fa3c8;border-radius:6px;cursor:pointer;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#8fa3c8';
    out.onclick=doLogout;
    nav.appendChild(out);
    document.body.insertBefore(nav,document.body.firstChild);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',injectNav);
  } else {
    injectNav();
  }
})();
