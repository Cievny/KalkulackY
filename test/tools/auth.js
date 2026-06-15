// Shared auth + navigation for cievny.sk tools – TEST verzia (zlta)
(function(){
  const HASH='682e05c914cb8003e99a2376e9170c3c6bf93c6d7f3d722b0aa276985ea46245';
  const KEY='cievny_auth_test';

  async function sha256(str){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  window.checkAuth=function(){
    if(sessionStorage.getItem(KEY)!=='1'){
      sessionStorage.setItem('cievny_return',location.pathname);
      location.replace('/test/tools/login/');
    }
  };

  window.doLogin=async function(){
    const pw=document.getElementById('pw').value;
    const msg=document.getElementById('login-msg');
    const h=await sha256(pw);
    if(h===HASH){
      sessionStorage.setItem(KEY,'1');
      const ret=sessionStorage.getItem('cievny_return')||'/test/tools/EVK/';
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
    location.replace('/test/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/test/tools/EVK/',label:'EVK'},
    {href:'/test/tools/CAS-generator/',label:'CAS'},
    {href:'/test/tools/PEVAR/',label:'PEVAR'},
    {href:'/test/tools/analytics/',label:'📊 Štatistiky'},
    {href:'/test/tools/zaznamy/',label:'📁 Záznamy'},
    {href:'/test/tools/ideas/',label:'💡 Nápady'},
  ];

  function injectNav(){
    const existing=document.querySelector('.shared-nav');
    if(existing)return;
    const nav=document.createElement('div');
    nav.className='shared-nav';
    nav.style.cssText='background:#78350f;display:flex;align-items:center;padding:0 16px;gap:2px;position:sticky;top:0;z-index:200;';
    const badge=document.createElement('span');
    badge.textContent='🧪 TEST';
    badge.style.cssText='font-size:12px;font-weight:800;color:#1a1a1a;background:#f59e0b;border-radius:6px;padding:3px 9px;margin-right:10px;letter-spacing:.5px;';
    nav.appendChild(badge);
    const cur=location.pathname.replace(/\/$/,'');
    NAV_LINKS.forEach(l=>{
      const a=document.createElement('a');
      a.href=l.href;
      const active=cur===l.href.replace(/\/$/,'');
      a.style.cssText='padding:9px 16px;font-size:13px;font-weight:600;color:'+(active?'#fff':'#fcd34d')+';text-decoration:none;border-bottom:3px solid '+(active?'#f59e0b':'transparent')+';transition:.15s;';
      a.onmouseover=()=>{if(!active)a.style.color='#fff';};
      a.onmouseout=()=>{if(!active)a.style.color='#fcd34d';};
      a.textContent=l.label;
      nav.appendChild(a);
    });
    const spacer=document.createElement('div');spacer.style.flex='1';nav.appendChild(spacer);
    const out=document.createElement('button');
    out.textContent='Odhlásiť';
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #92400e;color:#fcd34d;border-radius:6px;cursor:pointer;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#fcd34d';
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
