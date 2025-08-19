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

