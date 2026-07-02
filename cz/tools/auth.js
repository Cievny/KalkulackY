// Shared auth + navigation for cievny.sk tools – CZ verzia (VFN)
// Supabase Auth (JWT) s fallbackem na legacy heslo během migrace.
(function(){
  const HASH='eed80dcdb814905923770f85e576d75c7eefde07504aeb8cd45edd0a3d594276'; // legacy fallback
  const KEY='cievny_auth_cz';
  const SB_URL='https://ncqtiicfqhaturjlfxcj.supabase.co';
  const SB_ANON='sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k';
  const AUTH_EMAIL='vfn@cievny.sk'; // účet vytvořený v Supabase → Authentication → Users
  const TK=KEY+'_at', RK=KEY+'_rt', XK=KEY+'_exp';

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
    }
  }

  // Token pro REST volání: JWT přihlášeného usera, fallback na anon klíč (dokud není RLS zpřísněné)
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
      location.replace('/cz/tools/login/');
      return;
    }
    const exp=parseInt(sessionStorage.getItem(XK)||'0');
    if(exp&&Date.now()>exp-10*60000)refreshToken();
    scheduleRefresh();
  };

  window.doLogin=async function(){
    const pw=document.getElementById('pw').value;
    const msg=document.getElementById('login-msg');
    msg.textContent='Přihlašuji…';msg.style.color='#6b7280';
    // 1) Supabase Auth
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
        body:JSON.stringify({email:AUTH_EMAIL,password:pw})
      });
      if(r.ok){
        storeSession(await r.json());
        const ret=sessionStorage.getItem('cievny_return')||'/cz/tools/EVK/';
        sessionStorage.removeItem('cievny_return');
        location.replace(ret);
        return;
      }
    }catch(e){/* síť — zkus legacy */}
    // 2) Legacy fallback (funguje jen dokud RLS povoluje anon zápis)
    const h=await sha256(pw);
    if(h===HASH){
      storeSession(null);
      const ret=sessionStorage.getItem('cievny_return')||'/cz/tools/EVK/';
      sessionStorage.removeItem('cievny_return');
      location.replace(ret);
    } else {
      msg.textContent='Nesprávné heslo.';
      msg.style.color='#dc2626';
      document.getElementById('pw').value='';
      document.getElementById('pw').focus();
    }
  };

  window.doLogout=function(){
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(RK);
    sessionStorage.removeItem(XK);
    location.replace('/cz/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/cz/tools/EVK/',label:'EVK'},
    {href:'/cz/tools/CAS-generator/',label:'CAS'},
    {href:'/cz/tools/PEVAR/',label:'PEVAR'},
    {href:'/cz/tools/analytics/',label:'📊 Statistiky'},
    {href:'/cz/tools/zaznamy/',label:'📁 Záznamy'},
    {href:'/cz/tools/ideas/',label:'💡 Nápady'},
  ];

  function injectNav(){
    if(location.pathname.includes('/login'))return; // na login stránke nav nezobrazuj
    const existing=document.querySelector('.shared-nav');
    if(existing)return;
    const nav=document.createElement('div');
    nav.className='shared-nav';
    nav.style.cssText='background:#5b0e1a;display:flex;align-items:center;padding:0 16px;gap:2px;position:sticky;top:0;z-index:200;';
    const badge=document.createElement('span');
    badge.textContent='🇨🇿 CZ';
    badge.style.cssText='font-size:12px;font-weight:800;color:#fff;background:#b91c1c;border-radius:6px;padding:3px 9px;margin-right:10px;letter-spacing:.5px;';
    nav.appendChild(badge);
    const cur=location.pathname.replace(/\/$/,'');
    NAV_LINKS.forEach(l=>{
      const a=document.createElement('a');
      a.href=l.href;
      const active=cur===l.href.replace(/\/$/,'');
      a.style.cssText='padding:9px 16px;font-size:13px;font-weight:600;color:'+(active?'#fff':'#e3a8ae')+';text-decoration:none;border-bottom:3px solid '+(active?'#ef4444':'transparent')+';transition:.15s;';
      a.onmouseover=()=>{if(!active)a.style.color='#fff';};
      a.onmouseout=()=>{if(!active)a.style.color='#e3a8ae';};
      a.textContent=l.label;
      nav.appendChild(a);
    });
    const spacer=document.createElement('div');spacer.style.flex='1';nav.appendChild(spacer);
    const out=document.createElement('button');
    out.textContent='Odhlásit';
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #a14a55;color:#e3a8ae;border-radius:6px;cursor:pointer;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#e3a8ae';
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
