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
      const ret=sessionStorage.getItem('cievny_return')||'/tools/EVK/';
      sessionStorage.removeItem('cievny_return');
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
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(RK);
    sessionStorage.removeItem(XK);
    sessionStorage.removeItem(EK);
    location.replace('/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/tools/Program/',label:'📅 Program'},
    {href:'/tools/Aorta/',label:'📥 Požiadavky'},
    {label:'📝 Popisy',children:[
      {href:'/tools/EVK/',label:'EVK – endovaskulárne výkony'},
      {href:'/tools/CAS-generator/',label:'CAS – karotídy'},
      {href:'/tools/PEVAR/',label:'PEVAR – aortálne stentgrafty'},
      {href:'/tools/zaznamy/',label:'📁 Záznamy výkonov'},
    ]},
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
    nav.style.cssText='background:#0f1e3d;display:flex;align-items:center;padding:0 16px;gap:2px;position:sticky;top:0;z-index:200;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';
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
    document.body.insertBefore(nav,document.body.firstChild);
  }

  // PWA: manifest + ikona pre "Pridať na plochu" (mobil)
  function injectPWA(){
    if(document.querySelector('link[rel="manifest"]'))return;
    const l=document.createElement('link');l.rel='manifest';l.href='/manifest.webmanifest';document.head.appendChild(l);
    const a=document.createElement('link');a.rel='apple-touch-icon';a.href='/icons/icon-192.png';document.head.appendChild(a);
    const m=document.createElement('meta');m.name='theme-color';m.content='#0f1e3d';document.head.appendChild(m);
  }
  injectPWA();

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',injectNav);
  } else {
    injectNav();
  }
})();
