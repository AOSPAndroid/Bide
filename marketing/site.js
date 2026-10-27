(() => {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('site-nav');
  if (!header || !toggle || !nav) return;
  toggle.hidden = false;
  header.classList.add('nav-enhanced');
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); header.classList.remove('nav-open'); };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('nav-open', open);
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.classList.contains('nav-open')) { close(); toggle.focus(); }
  });
  document.addEventListener('click', event => { if (!header.contains(event.target)) close(); });
})();
