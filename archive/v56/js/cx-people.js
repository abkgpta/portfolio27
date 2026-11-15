/* CortX player app (phone) and kit view (dock): small interactive mock-ups. Illustrative data only. */
(() => {
  const ph = document.getElementById('cxPlayer');
  if (ph) {
    const tabs = [...ph.querySelectorAll('[role="tab"]')];
    const show = t => {
      tabs.forEach(b => b.setAttribute('aria-selected', b === t));
      ph.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t.dataset.p; });
    };
    tabs.forEach(t => t.addEventListener('click', () => show(t)));
    ph.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n);
    });
  }
  const kit = document.getElementById('cxKit');
  if (kit) {
    // n, name, battery %, fit, note
    const U = [[1, 'Van der Sar', 71, 'Good', ''], [6, 'Brown', 64, 'Good', ''], [5, 'Ferdinand', 58, 'Good', ''], [15, 'Vidić', 66, 'Good', ''],
      [3, 'Evra', 49, 'Good', ''], [4, 'Hargreaves', 61, 'Good', ''], [18, 'Scholes', 33, 'Good', ''], [16, 'Carrick', 55, 'Loose', 'Retighten Boa dial'],
      [32, 'Tevez', 52, 'Good', ''], [7, 'Ronaldo', 36, 'Good', ''], [11, 'Giggs', 38, 'Good', ''], [10, 'Rooney', 57, 'Good', 'Liner pad worn, swap']];
    const grid = kit.querySelector('.cxk-grid');
    grid.innerHTML = U.map(([n, name, b, fit, note]) => {
      const low = b < 40, fault = !!note, tags = ['wash', low ? 'charge' : '', fault ? 'fault' : ''].filter(Boolean).join(' ');
      return `<li data-tags="${tags}"><span class="who"><b>${name}</b><span>CX-${String(n).padStart(2, '0')}</span></span><span class="cxk-bat${low ? ' low' : ''}" role="img" aria-label="Battery ${b}%"><i style="width:${b}%"></i></span><span class="st">${b}% · fit ${fit.toLowerCase()} · vest and mesh to wash</span>${note ? `<span class="st flag">${note}</span>` : ''}</li>`;
    }).join('');
    kit.querySelectorAll('[data-k]').forEach(btn => btn.addEventListener('click', () => {
      kit.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-pressed', b === btn));
      grid.querySelectorAll('li').forEach(li => { li.hidden = btn.dataset.k !== 'all' && !li.dataset.tags.split(' ').includes(btn.dataset.k); });
    }));
  }
})();
