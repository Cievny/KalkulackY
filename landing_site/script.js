// Mobile nav toggle
const navToggleButton = document.querySelector('.nav-toggle');
const navMenu = document.getElementById('nav-menu');

if (navToggleButton && navMenu) {
  navToggleButton.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    navToggleButton.setAttribute('aria-expanded', String(isOpen));
  });

  // Close menu on link click (mobile)
  navMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.tagName === 'A') {
      navMenu.classList.remove('open');
      navToggleButton.setAttribute('aria-expanded', 'false');
    }
  });
}

// Smooth scroll for in-page anchors
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('a[href^="#"]')) {
    const anchor = target.getAttribute('href');
    if (!anchor) return;
    const el = document.querySelector(anchor);
    if (el) {
      event.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});

// Set current year in footer
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

// Basic form handler (demo only)
const formEl = document.querySelector('form[name="contact"]');
if (formEl) {
  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(formEl);
    const name = formData.get('name');
    alert(`Ďakujeme, ${name || 'priateľ'}! Ozveme sa čoskoro.`);
    formEl.reset();
  });
}

// Accordion
const accordionToggle = document.querySelector('.accordion-toggle');
const accordionPanel = document.querySelector('.accordion-panel');
if (accordionToggle && accordionPanel) {
  accordionToggle.addEventListener('click', () => {
    const isOpen = accordionPanel.classList.toggle('open');
    accordionToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// Calculators
function textToBool(value) {
  return String(value) === 'yes';
}

function formatPercent(num) {
  return `${(num * 100).toFixed(0)}%`;
}

// Simplified CVD risk (educational, not clinical): combine age, SBP, TC/HDL, smoking, diabetes
function calculateCvdRisk(form) {
  const age = Number(form.age.value || 0);
  const sbp = Number(form.sbp.value || 0);
  const tc = Number(form.tc.value || 0);
  const hdl = Number(form.hdl.value || 1);
  const smoke = textToBool(form.smoke.value);
  const dm = textToBool(form.dm.value);
  const htx = textToBool(form.htx.value);

  // Heuristic score (not a true Framingham!)
  let score = 0;
  if (age >= 50) score += 0.08;
  if (age >= 60) score += 0.06;
  if (sbp >= 140) score += htx ? 0.08 : 0.06;
  const ratio = tc && hdl ? tc / hdl : 0;
  if (ratio >= 4) score += 0.05;
  if (ratio >= 5) score += 0.04;
  if (smoke) score += 0.07;
  if (dm) score += 0.08;
  score = Math.min(score, 0.95);
  return score;
}

function handleCvdCalc() {
  const wrap = document.getElementById('calc-cvd');
  if (!wrap) return;
  const btn = wrap.querySelector('[data-action="calc-cvd"]');
  const out = wrap.querySelector('.calc-output');
  const form = wrap.querySelector('form');
  if (!btn || !out || !form) return;
  btn.addEventListener('click', () => {
    const risk = calculateCvdRisk(form);
    let level = 'nízke';
    if (risk >= 0.20) level = 'vysoké';
    else if (risk >= 0.10) level = 'stredné';
    out.textContent = `Odhad rizika: ${formatPercent(risk)} (${level}). Pre klinické rozhodovanie sa poraďte s lekárom.`;
  });
}

function handleDvtCalc() {
  const wrap = document.getElementById('calc-dvt');
  if (!wrap) return;
  const btn = wrap.querySelector('[data-action="calc-dvt"]');
  const out = wrap.querySelector('.calc-output');
  const form = wrap.querySelector('form');
  if (!btn || !out || !form) return;
  btn.addEventListener('click', () => {
    const points = ['age60','surg','immob','ca','preg','history']
      .map((k) => textToBool(form[k].value) ? 1 : 0)
      .reduce((a,b) => a + b, 0);
    let risk = 'nízke';
    if (points >= 4) risk = 'vysoké';
    else if (points >= 2) risk = 'stredné';
    out.textContent = `Odhad rizika trombózy: ${risk}. Pri bolesti a opuchu končatiny kontaktujte lekára.`;
  });
}

function handleAbiCalc() {
  const wrap = document.getElementById('calc-abi');
  if (!wrap) return;
  const btn = wrap.querySelector('[data-action="calc-abi"]');
  const out = wrap.querySelector('.calc-output');
  const form = wrap.querySelector('form');
  if (!btn || !out || !form) return;
  btn.addEventListener('click', () => {
    const ankle = Number(form.ankle.value || 0);
    const brachial = Number(form.brachial.value || 1);
    if (!ankle || !brachial) {
      out.textContent = 'Zadajte tlaky pre výpočet.';
      return;
    }
    const abi = ankle / brachial;
    let interp = 'normálny (0.9–1.3)';
    if (abi < 0.9) interp = 'znížený – možná ischemická choroba DK';
    if (abi > 1.3) interp = 'zvýšený – tuhšie cievy (mediaskleróza)';
    out.textContent = `ABI: ${abi.toFixed(2)} (${interp}). Výsledok konzultujte s lekárom.`;
  });
}

handleCvdCalc();
handleDvtCalc();
handleAbiCalc();

