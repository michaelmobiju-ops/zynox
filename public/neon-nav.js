document.getElementById('neon-more')?.addEventListener('click',()=>document.getElementById('open-menu')?.click());

const collapse=document.getElementById('neon-collapse');collapse?.addEventListener('click',()=>{const closed=document.body.classList.toggle('neon-collapsed');collapse.setAttribute('aria-expanded',String(!closed));collapse.setAttribute('aria-label',closed?'Expandir menu':'Recolher menu');});

const sidebar=document.getElementById('sidebar'),more=document.getElementById('neon-more');if(sidebar&&more)new MutationObserver(()=>more.setAttribute('aria-expanded',String(sidebar.classList.contains('open')))).observe(sidebar,{attributes:true,attributeFilter:['class']});
