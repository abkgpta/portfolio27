/* ---------- "last updated" stamp on every under-construction note (IST) ---------- */
(function(){
  const fmt=d=>'Last updated '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d).replace(' at ',', ').replace(/\b(am|pm)\b/,m=>m.toUpperCase())+' IST';
  const paint=iso=>{const d=new Date(iso);if(isNaN(d))return;const t=fmt(d);window.SITE_UPDATED=t;
    document.querySelectorAll('[data-updated]').forEach(el=>{el.textContent=t;});};
  const wip=document.querySelector('.wip');
  if(wip&&'ResizeObserver' in window)new ResizeObserver(()=>document.documentElement.style.setProperty('--wip-h',wip.offsetHeight+'px')).observe(wip);
  // archived copies carry their own commit time
  const pinned=document.querySelector('meta[name="site-updated"]');
  if(pinned){paint(pinned.content);return;}
  const KEY='abk-site-updated';
  try{const c=JSON.parse(sessionStorage.getItem(KEY)||'null');if(c&&Date.now()-c.at<600000){paint(c.iso);return;}}catch(e){}
  const save=iso=>{paint(iso);try{sessionStorage.setItem(KEY,JSON.stringify({iso,at:Date.now()}));}catch(e){}};
  const lastModified=()=>fetch(location.pathname,{method:'HEAD',cache:'no-store'}).then(r=>{const h=r.headers.get('last-modified');if(h)save(h);}).catch(()=>{});
  // latest site change on main, skipping the bot's archive commits
  fetch('https://api.github.com/repos/abkgpta/portfolio27/commits?sha=main&per_page=10')
    .then(r=>r.ok?r.json():Promise.reject())
    .then(list=>{const c=list.find(x=>!/^Archive site as v\d+/.test(x.commit.message))||list[0];
      if(c)save(c.commit.committer.date);else return lastModified();})
    .catch(lastModified);
})();
