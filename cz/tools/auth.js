// Shared auth + navigation for cievny.sk tools – CZ verzia (VFN)
// Supabase Auth (JWT) – přihlášení emailem (legacy heslo vypnuto 7/2026).
(function(){
  const KEY='cievny_auth_cz';
  const SB_URL='https://ncqtiicfqhaturjlfxcj.supabase.co';
  const SB_ANON='sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k';
  const TK=KEY+'_at', RK=KEY+'_rt', XK=KEY+'_exp', EK=KEY+'_email';

  function storeSession(d){
    sessionStorage.setItem(KEY,'1');
    if(d&&d.access_token){
      sessionStorage.setItem(TK,d.access_token);
      sessionStorage.setItem(RK,d.refresh_token||'');
      sessionStorage.setItem(XK,String(Date.now()+(d.expires_in?d.expires_in*1000:3600000)));
      if(d.user&&d.user.email)sessionStorage.setItem(EK,d.user.email);
    }
  }

  // Email přihlášeného uživatele ('' při legacy/společném přihlášení bez emailu)
  window.sbUserEmail=function(){
    return sessionStorage.getItem(EK)||'';
  };

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

  window.sbRefresh=refreshToken;

  // Globální samooprava (stejná jako v SK verzi): 401 po expiraci tokenu → obnovit
  // token a zopakovat dotaz; mrtvá relace nebo anonymní 403 → přesměrovat na login.
  (function(){
    const _fetch=window.fetch.bind(window);
    let refreshing=null;
    function deadSession(){
      sessionStorage.removeItem(KEY);sessionStorage.removeItem(TK);
      sessionStorage.removeItem(RK);sessionStorage.removeItem(XK);
      sessionStorage.setItem('cievny_return_cz',location.pathname+location.search);
      location.replace('/cz/tools/login/');
    }
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:(input&&input.url)||'';
      const r=await _fetch(input,init);
      if(url.indexOf(SB_URL+'/rest/')===0 && init && init.headers){
        const auth=init.headers['Authorization']||init.headers.Authorization||'';
        if(r.status===401 && auth.indexOf('Bearer ')===0 && auth!=='Bearer '+SB_ANON){
          refreshing=refreshing||refreshToken();
          const ok=await refreshing; refreshing=null;
          if(ok)return _fetch(input,{...init,headers:{...init.headers,'Authorization':'Bearer '+window.sbToken()}});
          deadSession(); // refresh selhal
        }
        if(r.status===403 && auth==='Bearer '+SB_ANON &&
           sessionStorage.getItem(KEY)==='1' && !sessionStorage.getItem(TK)){
          deadSession(); // relace bez tokenu – dotazy odcházejí anonymně
        }
      }
      return r;
    };
  })();

  function scheduleRefresh(){
    setInterval(()=>{
      const exp=parseInt(sessionStorage.getItem(XK)||'0');
      if(exp&&Date.now()>exp-10*60000)refreshToken();
    },5*60000);
  }

  window.checkAuth=function(){
    // relace bez Supabase tokenu (stará vlajka z doby před emailovým loginem) by četla
    // jako anonym (prázdné seznamy) a každé uložení by padalo na RLS 403 → vyžaduj token
    if(sessionStorage.getItem(KEY)!=='1'||!sessionStorage.getItem(TK)){
      sessionStorage.removeItem(KEY);
      sessionStorage.setItem('cievny_return_cz',location.pathname+location.search);
      location.replace('/cz/tools/login/');
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
    if(!email){msg.textContent='Zadejte email.';msg.style.color='#dc2626';document.getElementById('email').focus();return;}
    msg.textContent='Přihlašuji…';msg.style.color='#6b7280';
    function go(){
      let ret=sessionStorage.getItem('cievny_return_cz')||'/cz/tools/EVK/';
      sessionStorage.removeItem('cievny_return_cz');
      if(!/^\/[^/]/.test(ret))ret='/cz/tools/EVK/'; // jen interní cesty (ochrana proti open-redirect)
      location.replace(ret);
    }
    // Supabase Auth – email je povinný
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
        body:JSON.stringify({email,password:pw})
      });
      if(r.ok){storeSession(await r.json());go();return;}
      msg.textContent='Nesprávný email nebo heslo.';
    }catch(e){
      msg.textContent='Chyba sítě – zkuste znovu.';
    }
    msg.style.color='#dc2626';
    document.getElementById('pw').value='';
    document.getElementById('pw').focus();
  };

  window.doLogout=function(){
    const at=sessionStorage.getItem(TK);
    if(at&&at!==SB_ANON){
      try{fetch(SB_URL+'/auth/v1/logout',{method:'POST',headers:{'apikey':SB_ANON,'Authorization':'Bearer '+at},keepalive:true});}catch(e){}
    }
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(RK);
    sessionStorage.removeItem(XK);
    sessionStorage.removeItem(EK);
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
    const ue=window.sbUserEmail?window.sbUserEmail():'';
    if(ue){
      const who=document.createElement('span');
      who.textContent='👤 '+ue;
      who.style.cssText='font-size:12px;color:#8fa3c8;margin-right:10px;white-space:nowrap;';
      nav.appendChild(who);
    }
    const out=document.createElement('button');
    out.textContent='Odhlásit';
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #a14a55;color:#e3a8ae;border-radius:6px;cursor:pointer;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#e3a8ae';
    out.onclick=doLogout;
    nav.appendChild(out);
    document.body.insertBefore(nav,document.body.firstChild);
  }

  // PWA: manifest + ikona pro "Přidat na plochu" (mobil)
  function injectPWA(){
    if(document.querySelector('link[rel="manifest"]'))return;
    const l=document.createElement('link');l.rel='manifest';l.href='/cz/manifest.webmanifest';document.head.appendChild(l);
    const a=document.createElement('link');a.rel='apple-touch-icon';a.href='/icons/icon-192.png';document.head.appendChild(a);
    const m=document.createElement('meta');m.name='theme-color';m.content='#5b0e1a';document.head.appendChild(m);
  }
  injectPWA();

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',injectNav);
  } else {
    injectNav();
  }
})();
