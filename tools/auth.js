// Shared auth + navigation for cievny.sk tools
// Supabase Auth (JWT) – prihlásenie emailom (legacy heslo vypnuté 7/2026).
(function(){
  const KEY='cievny_auth';
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

  // Email prihláseného používateľa ('' pri legacy/spoločnom prihlásení bez emailu)
  window.sbUserEmail=function(){
    return sessionStorage.getItem(EK)||'';
  };

  // Prihlásenie cez Google (OAuth) – presmeruje na Supabase, ten na Google a späť.
  // POZOR: vlastný „state" parameter sa do /authorize posielať NESMIE – GoTrue si
  // state spravuje sám (podpísaný JWT) a cudzí odmietne s chybou bad_oauth_state.
  // Ochrana pred session fixation je marker v sessionStorage nižšie.
  window.doGoogle=function(){
    try{sessionStorage.setItem('cievny_oauth_state','1');}catch(e){}
    const redirect=location.origin+'/tools/login/';
    location.href=SB_URL+'/auth/v1/authorize?provider=google&redirect_to='+encodeURIComponent(redirect);
  };
  // Spracovanie návratu z OAuth: tokeny prídu v URL fragmente (#access_token=…)
  async function handleOAuthCallback(){
    if(!location.hash||location.hash.indexOf('access_token=')<0)return false;
    // prijmi tokeny LEN ak Google prihlásenie spustil tento prehliadač (inak ignoruj – ochrana pred session fixation)
    const started=sessionStorage.getItem('cievny_oauth_state');
    sessionStorage.removeItem('cievny_oauth_state');
    if(!started){history.replaceState(null,'',location.pathname+location.search);return false;}
    const p=new URLSearchParams(location.hash.slice(1));
    const at=p.get('access_token');if(!at)return false;
    const d={access_token:at,refresh_token:p.get('refresh_token')||'',expires_in:parseInt(p.get('expires_in')||'3600')};
    let emailOk=false;
    try{
      const r=await fetch(SB_URL+'/auth/v1/user',{headers:{'apikey':SB_ANON,'Authorization':'Bearer '+at}});
      if(r.ok){const u=await r.json();if(u&&u.email){d.user={email:u.email};emailOk=true;}}
    }catch(e){}
    history.replaceState(null,'',location.pathname+location.search); // vyčisti tokeny z URL
    if(!emailOk){
      // bez overeného emailu reláciu neukladáme (email je potrebný pre allowlist)
      const showErr=()=>{const m=document.getElementById('login-msg');if(m){m.textContent='Prihlásenie cez Google sa nepodarilo overiť – skúste znova.';m.style.color='#dc2626';}};
      if(location.pathname.indexOf('/login')>=0){
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showErr);else showErr();
        return true; // ostaň na login stránke s hláškou
      }
      location.replace('/tools/login/');
      return true;
    }
    storeSession(d);
    let ret=sessionStorage.getItem('cievny_return')||'/tools/EVK/';
    sessionStorage.removeItem('cievny_return');
    if(!/^\/[^/]/.test(ret))ret='/tools/EVK/'; // len interné cesty (ochrana pred open-redirect)
    location.replace(ret);
    return true;
  }

  // Token pre REST volania: JWT prihláseného usera, fallback na anon kľúč (kým nie je RLS sprísnené)
  window.sbToken=function(){
    return sessionStorage.getItem(TK)||SB_ANON;
  };
  window.sbHeaders=function(){
    return {'apikey':SB_ANON,'Authorization':'Bearer '+window.sbToken(),'Content-Type':'application/json'};
  };
  window.SB_BASE=SB_URL; // pre volania edge funkcií (napr. /functions/v1/extrakcia)

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

  window.sbRefresh=refreshToken; // umožní nástrojom obnoviť token pri 401 a zopakovať dotaz

  // Globálna samooprava: ak Supabase odmietne REST dotaz kvôli expirovanému
  // tokenu (401 – napr. po uspatí notebooka), obnov token a zopakuj dotaz raz.
  // 401 znamená, že sa dotaz NEVYKONAL, takže opakovanie je bezpečné aj pri zápise.
  (function(){
    const _fetch=window.fetch.bind(window);
    let refreshing=null;
    function deadSession(){
      // prihlásenie je mŕtve → pošli používateľa na login,
      // nech nevidí mätúce chybové hlášky v každom nástroji
      sessionStorage.removeItem(KEY);sessionStorage.removeItem(TK);
      sessionStorage.removeItem(RK);sessionStorage.removeItem(XK);
      if(localStorage.getItem('cievny_tv_kiosk')==='1'){location.replace('/tools/tv/');}
      // veľín (tablet pri sestrách) sa vie prihlásiť sám uloženým kódom sály
      else if(localStorage.getItem('cievny_velin')==='1'&&location.pathname.indexOf('/tools/velin')===0){location.replace('/tools/velin/'+location.search);}
      else{
        sessionStorage.setItem('cievny_return',location.pathname+location.search);
        location.replace('/tools/login/');
      }
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
          deadSession(); // refresh zlyhal
        }
        // dotaz odišiel anonymne (relácia bez tokenu, napr. karta otvorená spred
        // emailového loginu): RLS zamietne zápis s 403 – jediná náprava je nový login
        if(r.status===403 && auth==='Bearer '+SB_ANON &&
           sessionStorage.getItem(KEY)==='1' && !sessionStorage.getItem(TK)){
          deadSession();
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
    // relácia bez Supabase tokenu (stará vlajka spred emailového loginu) by čítala ako
    // anonym (prázdne zoznamy) a každé uloženie by padalo na RLS 403 → vyžaduj token
    if(sessionStorage.getItem(KEY)!=='1'||!sessionStorage.getItem(TK)){
      sessionStorage.removeItem(KEY);
      // TV kiosk (bez klávesnice) → obnov cez TV bránu s uloženým kódom, nie cez ľudský login
      const tvParam=new URLSearchParams(location.search).get('tv')==='1';
      if(localStorage.getItem('cievny_tv_kiosk')==='1'||tvParam){location.replace('/tools/tv/');return;}
      sessionStorage.setItem('cievny_return',location.pathname+location.search);
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
    if(!email){msg.textContent='Zadajte email.';msg.style.color='#dc2626';document.getElementById('email').focus();return;}
    msg.textContent='Prihlasujem…';msg.style.color='#6b7280';
    function go(){
      let ret=sessionStorage.getItem('cievny_return')||'/tools/EVK/';
      sessionStorage.removeItem('cievny_return');
      if(!/^\/[^/]/.test(ret))ret='/tools/EVK/'; // len interné cesty (nie //host, nie externé) – ochrana pred open-redirect
      location.replace(ret);
    }
    // Supabase Auth – email je povinný
    try{
      const r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
        body:JSON.stringify({email,password:pw})
      });
      if(r.ok){storeSession(await r.json());go();return;}
      msg.textContent='Nesprávny email alebo heslo.';
    }catch(e){
      msg.textContent='Chyba siete – skúste znova.';
    }
    msg.style.color='#dc2626';
    document.getElementById('pw').value='';
    document.getElementById('pw').focus();
  };

  window.doLogout=function(){
    // zruš reláciu aj na serveri, aby ukradnutý refresh token prestal platiť
    const at=sessionStorage.getItem(TK);
    if(at&&at!==SB_ANON){
      try{fetch(SB_URL+'/auth/v1/logout',{method:'POST',headers:{'apikey':SB_ANON,'Authorization':'Bearer '+at},keepalive:true});}catch(e){}
    }
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(RK);
    sessionStorage.removeItem(XK);
    sessionStorage.removeItem(EK);
    // zruš aj kioskové markery a uložené kódy (TV/veľín) – inak sa zdieľaný
    // tablet po odhlásení sám znovu prihlási a kód sály/TV ostane v plaintexte
    ['cievny_tv_kiosk','cievny_velin','cievny_tv_sala','cievny_tv_code','cievny_sala_code'].forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
    location.replace('/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/tools/',label:'🏠'},
    {href:'/tools/Program/',label:'📅 Program'},
    {href:'/tools/Aorta/',label:'📥 Požiadavky'},
    {href:'/tools/objednavky/',label:'🩻 CEUS/CT'},
    {label:'📝 Popisy',children:[
      {href:'/tools/EVK/',label:'EVK – endovaskulárne výkony'},
      {href:'/tools/CAS-generator/',label:'CAS – karotídy'},
      {href:'/tools/PEVAR/',label:'PEVAR – aortálne stentgrafty'},
      {href:'/tools/RAS/',label:'RAS – renálny stenting'},
      {href:'/tools/zaznamy/',label:'📁 Záznamy výkonov'},
    ]},
    {href:'/tools/kontroly/',label:'🩺 Kontroly'},
    {href:'/tools/pacient/',label:'🧍 Cesta pacienta'},
    {href:'/tools/kalendar/',label:'📆 Kalendár'},
    {href:'/tools/oznamy/',label:'📢 Oznamy'},
    {href:'/tools/ideas/',label:'💡 Nápady'},
    {href:'/tools/analytics/',label:'📊 Štatistiky'},
    {href:'/tools/zaloha/',label:'💾 Záloha'},
  ];

  function injectNav(){
    if(location.pathname.includes('/login'))return; // na login stránke nav nezobrazuj
    const existing=document.querySelector('.shared-nav');
    if(existing)return;
    const nav=document.createElement('div');
    nav.className='shared-nav';
    nav.style.cssText='background:#0f1e3d;display:flex;align-items:center;padding:0 16px;gap:2px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';
    const cur=location.pathname.replace(/\/$/,'');
    const linkCss=act=>'padding:9px 16px;font-size:13px;font-weight:600;color:'+(act?'#fff':'#8fa3c8')+';text-decoration:none;border-bottom:3px solid '+(act?'#3b82f6':'transparent')+';transition:.15s;white-space:nowrap;flex-shrink:0;background:none;border-top:none;border-left:none;border-right:none;cursor:pointer;font-family:inherit;';
    NAV_LINKS.forEach(l=>{
      if(l.children){
        // rozbaľovacie menu (Popisy)
        const active=l.children.some(c=>cur===c.href.replace(/\/$/,''));
        const btn=document.createElement('button');
        btn.textContent=l.label+' ▾';
        btn.style.cssText=linkCss(active);
        const menu=document.createElement('div');
        menu.style.cssText='position:fixed;display:none;background:#0f1e3d;border:1px solid #2a3f66;border-radius:0 0 10px 10px;box-shadow:0 12px 30px rgba(0,0,0,.4);z-index:1000;min-width:250px;padding:6px 0;';
        l.children.forEach(c=>{
          const ca=document.createElement('a');
          ca.href=c.href;
          const cact=cur===c.href.replace(/\/$/,'');
          ca.textContent=c.label;
          ca.style.cssText='display:block;padding:10px 16px;font-size:13px;font-weight:600;color:'+(cact?'#fff':'#8fa3c8')+';text-decoration:none;white-space:nowrap;'+(cact?'background:#1a2c52;':'');
          ca.onmouseover=()=>{ca.style.background='#1a2c52';ca.style.color='#fff';};
          ca.onmouseout=()=>{ca.style.background=cact?'#1a2c52':'none';ca.style.color=cact?'#fff':'#8fa3c8';};
          menu.appendChild(ca);
        });
        document.body.appendChild(menu);
        btn.onclick=e=>{
          e.stopPropagation();
          const open=menu.style.display==='block';
          menu.style.display=open?'none':'block';
          if(!open){const r=btn.getBoundingClientRect();menu.style.left=Math.round(r.left)+'px';menu.style.top=Math.round(r.bottom)+'px';}
        };
        document.addEventListener('click',()=>{menu.style.display='none';});
        nav.addEventListener('scroll',()=>{menu.style.display='none';});
        btn.onmouseover=()=>{if(!active)btn.style.color='#fff';};
        btn.onmouseout=()=>{if(!active)btn.style.color='#8fa3c8';};
        nav.appendChild(btn);
        return;
      }
      const a=document.createElement('a');
      a.href=l.href;
      const active=cur===l.href.replace(/\/$/,'');
      a.style.cssText=linkCss(active);
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
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #4a5568;color:#8fa3c8;border-radius:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#8fa3c8';
    out.onclick=doLogout;
    nav.appendChild(out);
    // obal: sticky pozíciu drží wrapper, aby fade (absolútny overlay) nescrolloval s obsahom
    const wrap=document.createElement('div');
    wrap.className='shared-nav-wrap';
    wrap.style.cssText='position:sticky;top:0;z-index:200;';
    wrap.appendChild(nav);
    // fade na pravom okraji – signalizuje, že navigácia pokračuje (mobil)
    const fade=document.createElement('div');
    fade.className='shared-nav-fade';
    fade.style.cssText='position:absolute;top:0;right:0;bottom:0;width:36px;background:linear-gradient(to left,#0f1e3d 20%,rgba(15,30,61,0));pointer-events:none;opacity:0;transition:opacity .2s;';
    wrap.appendChild(fade);
    function updFade(){
      const max=nav.scrollWidth-nav.clientWidth;
      fade.style.opacity=(max>4&&nav.scrollLeft<max-4)?'1':'0';
    }
    nav.addEventListener('scroll',updFade,{passive:true});
    window.addEventListener('resize',updFade);
    document.body.insertBefore(wrap,document.body.firstChild);
    updFade();
  }

  // PWA: manifest + ikona pre "Pridať na plochu" (mobil)
  function injectPWA(){
    if(document.querySelector('link[rel="manifest"]'))return;
    const l=document.createElement('link');l.rel='manifest';l.href='/manifest.webmanifest';document.head.appendChild(l);
    const a=document.createElement('link');a.rel='apple-touch-icon';a.href='/icons/icon-192.png';document.head.appendChild(a);
    const m=document.createElement('meta');m.name='theme-color';m.content='#0f1e3d';document.head.appendChild(m);
  }
  injectPWA();

  // Service worker – offline záchranná sieť (statika z cache, dáta vždy zo siete)
  if('serviceWorker' in navigator){
    try{navigator.serviceWorker.register('/sw.js').catch(function(){});}catch(e){}
  }

  // ak OAuth vrátil chybu (?error_code=…), ukáž ju na login stránke namiesto tichého zlyhania
  function showOAuthError(){
    if(location.pathname.indexOf('/login')<0)return;
    const q=new URLSearchParams(location.search);
    if(!q.get('error')&&!q.get('error_code'))return;
    const desc=q.get('error_description')||q.get('error_code')||q.get('error');
    const show=()=>{const m=document.getElementById('login-msg');if(m){m.textContent='Prihlásenie cez Google zlyhalo: '+desc+' – skúste znova.';m.style.color='#dc2626';}};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
    history.replaceState(null,'',location.pathname); // vyčisti chybu z URL
  }
  showOAuthError();

  // ak sa vraciame z Google (tokeny v URL fragmente), spracuj a presmeruj – inak bežná inicializácia
  handleOAuthCallback().then(handled=>{
    if(handled)return; // prebehne presmerovanie
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',injectNav);
    } else {
      injectNav();
    }
  });
})();
