// Shared auth + navigation for cievny.sk tools – CZ TEST verzia (oranzova)
(function(){
  const HASH='23e27bf4deef1bb078683d68a0f4f73902f144a9edd3a11d2d035236b4d4111f';
  const KEY='cievny_auth_test_cz';

  async function sha256(str){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  window.checkAuth=function(){
    if(sessionStorage.getItem(KEY)!=='1'){
      sessionStorage.setItem('cievny_return',location.pathname);
      location.replace('/test/cz/tools/login/');
    }
  };

  window.doLogin=async function(){
    const pw=document.getElementById('pw').value;
    const msg=document.getElementById('login-msg');
    const h=await sha256(pw);
    if(h===HASH){
      sessionStorage.setItem(KEY,'1');
      const ret=sessionStorage.getItem('cievny_return')||'/test/cz/tools/EVK/';
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
    location.replace('/test/cz/tools/login/');
  };

  // Inject shared nav after DOM ready
  const NAV_LINKS=[
    {href:'/test/cz/tools/EVK/',label:'EVK'},
    {href:'/test/cz/tools/CAS-generator/',label:'CAS'},
    {href:'/test/cz/tools/PEVAR/',label:'PEVAR'},
    {href:'/test/cz/tools/analytics/',label:'📊 Statistiky'},
    {href:'/test/cz/tools/zaznamy/',label:'📁 Záznamy'},
    {href:'/test/cz/tools/ideas/',label:'💡 Nápady'},
  ];

  function injectNav(){
    const existing=document.querySelector('.shared-nav');
    if(existing)return;
    const nav=document.createElement('div');
    nav.className='shared-nav';
    nav.style.cssText='background:#7c2d12;display:flex;align-items:center;padding:0 16px;gap:2px;position:sticky;top:0;z-index:200;';
    const badge=document.createElement('span');
    badge.textContent='🧪 TEST CZ';
    badge.style.cssText='font-size:12px;font-weight:800;color:#fff;background:#f97316;border-radius:6px;padding:3px 9px;margin-right:10px;letter-spacing:.5px;';
    nav.appendChild(badge);
    const cur=location.pathname.replace(/\/$/,'');
    NAV_LINKS.forEach(l=>{
      const a=document.createElement('a');
      a.href=l.href;
      const active=cur===l.href.replace(/\/$/,'');
      a.style.cssText='padding:9px 16px;font-size:13px;font-weight:600;color:'+(active?'#fff':'#fdba74')+';text-decoration:none;border-bottom:3px solid '+(active?'#f97316':'transparent')+';transition:.15s;';
      a.onmouseover=()=>{if(!active)a.style.color='#fff';};
      a.onmouseout=()=>{if(!active)a.style.color='#fdba74';};
      a.textContent=l.label;
      nav.appendChild(a);
    });
    const spacer=document.createElement('div');spacer.style.flex='1';nav.appendChild(spacer);
    const out=document.createElement('button');
    out.textContent='Odhlásit';
    out.style.cssText='padding:6px 12px;font-size:12px;font-weight:600;background:none;border:1.5px solid #9a3412;color:#fdba74;border-radius:6px;cursor:pointer;';
    out.onmouseover=()=>out.style.color='#fff';
    out.onmouseout=()=>out.style.color='#fdba74';
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
