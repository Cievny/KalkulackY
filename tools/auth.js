// Shared auth + navigation for cievny.sk tools
(function(){
  const HASH='1361e98fcf8c152a1f48690a2ec88c9fafb11c5a1355c3a2aa000154092065fc';
  const KEY='cievny_auth';

  async function sha256(str){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  window.checkAuth=function(){
    if(sessionStorage.getItem(KEY)!=='1'){
      sessionStorage.setItem('cievny_return',location.pathname);
      location.replace('/tools/login/');
    }
  };

  window.doLogin=async function(){
    const pw=document.getElementById('pw').value;
    const msg=document.getElementById('login-msg');
    const h=await sha256(pw);
    if(h===HASH){
      sessionStorage.setItem(KEY,'1');
      const ret=sessionStorage.getItem('cievny_return')||'/tools/EVK/';
      sessionStorage.removeItem('cievny_return');
      location.replace(ret);
    } else {
      msg.textContent='Nesprávne heslo.';
      msg.style.color='#dc2626';
      document.getElementById('pw').value='';
      document.getElementById('pw').focus();
    }
  };

  window.doLogout=function(){
    sessionStorage.removeItem(KEY);
    location.replace('/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/tools/EVK/',label:'EVK'},
    {href:'/tools/CAS-generator/',label:'CAS'},
    {href:'/tools/PEVAR/',label:'PEVAR'},
    {href:'/tools/analytics/',label:'📊 Štatistiky'},
    {href:'/tools/zaznamy/',label:'📁 Záznamy'},
    {href:'/tools/ideas/',label:'💡 Nápady'},
  ];

  function injectNav(){
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
