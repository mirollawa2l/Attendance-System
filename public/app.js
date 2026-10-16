const $=s=>document.querySelector(s),V=$('#v'),on=v=>v==1;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=(a,sel,ph)=>(ph?`<option value="">${ph}</option>`:'')+a.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(sel)?' selected':''}>${esc(l)}</option>`).join('');
async function api(p,b){let r;try{r=await fetch('/api/'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{});}catch(e){throw{message:'Network failure – check your connection and retry'};}
 let j={};try{j=await r.json();}catch(e){}if(!r.ok)throw{code:j.code,message:j.message||'Server error'};return j;}
function note(t,bad){const m=$('#msg');m.textContent=t||'';m.className=bad?'bad':'';}
let C,S={act:''},stream=null;const P={};
const stopCam=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}};
async function go(n){stopCam();note('');V.textContent='Loading…';document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.g===n));try{await P[n]();}catch(e){V.textContent='';note(e.message,1);}}
const actPick=a=>`<select id=sa>${opts(a.map(x=>[x.id,x.date+' · '+x.name+(x.team?' ('+x.team+')':'')]),S.act,'— select activity —')}</select>`;
const bindAct=cb=>$('#sa').onchange=e=>{S.act=e.target.value;cb&&cb();};
const need=()=>{if(S.act)return true;note('Select an activity first',1);return false;};
function qrCanvas(text){const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount(),s=8,m=4,c=document.createElement('canvas');c.width=c.height=(n+2*m)*s;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';
 for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))x.fillRect((k+m)*s,(r+m)*s,s,s);return c;}
const save=async(fn,done,btn)=>{if(btn)btn.disabled=true;try{await fn();await done();note('Saved');}catch(e){note(e.message,1);if(btn)btn.disabled=false;}};

P.groups=async()=>{const g=await api('groups');let old='';
 V.innerHTML=g.map(x=>`<div class=row data-n="${esc(x.name)}" dir=auto>${esc(x.name)}</div>`).join('')+'<h3>Add / rename (tap a group to rename)</h3><input id=gn dir=auto placeholder="Group name"><button id=gs>Save</button>';
 document.querySelectorAll('.row').forEach(r=>r.onclick=()=>{old=r.dataset.n;$('#gn').value=old;});
 $('#gs').onclick=e=>save(()=>api('groups',{name:$('#gn').value,old}),()=>P.groups(),e.target);};
P.members=async()=>{const [ms,gs]=await Promise.all([api('members'),api('groups')]);let id=null;
 V.innerHTML=`<input id=q placeholder="Search by name"><div id=res></div><div id=qr></div><h3>Add / edit member</h3><input id=mn dir=auto placeholder="Name"><select id=mg>${opts(gs.map(g=>[g.name,g.name]),'','— group —')}</select><input id=my placeholder="Year (optional)"><label><input type=checkbox id=ma checked> Active</label><button id=ms>Save</button>`;
 const draw=()=>{const q=$('#q').value.toLowerCase();$('#res').innerHTML=ms.filter(m=>(m.name+m.team+m.year).toLowerCase().includes(q)).map(m=>`<div class=row><b dir=auto>${esc(m.name)}</b> <small dir=auto>${esc(m.team)} ${esc(m.year)} · ${m.points} pts ${on(m.active)?'':'(inactive)'}</small><br><button class=sec data-e=${m.id}>Edit</button> <button class=sec data-q=${m.id}>QR</button></div>`).join('');
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const m=ms.find(x=>x.id==b.dataset.e);id=m.id;$('#mn').value=m.name;$('#mg').value=m.team;$('#my').value=m.year;$('#ma').checked=on(m.active);scrollTo(0,document.body.scrollHeight);});
  document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const m=ms.find(x=>x.id==b.dataset.q),d=$('#qr'),c=qrCanvas(m.token);d.innerHTML='';d.append(c);c.style.cssText='width:220px;max-width:100%';
   const a=document.createElement('a');a.textContent='Download PNG – '+m.name;a.download='qr-'+m.name+'.png';a.href=c.toDataURL('image/png');d.append(document.createElement('br'),a);});};
 $('#q').oninput=draw;draw();
 $('#ms').onclick=e=>save(()=>api('members',{id,name:$('#mn').value,team:$('#mg').value,year:$('#my').value,active:$('#ma').checked}),()=>P.members(),e.target);};
P.acts=async()=>{const [as,gs]=await Promise.all([api('activities'),api('groups')]);let id=null;
 V.innerHTML=as.map(a=>`<div class=row data-i=${a.id} dir=auto>${esc(a.date)} · ${esc(a.name)} <small>${a.team?esc(a.team):'All groups'}</small></div>`).join('')+`<h3>Add / edit (tap to edit)</h3><input id=an dir=auto placeholder="Activity name"><input id=ad type=date value="${new Date().toISOString().slice(0,10)}"><select id=ag>${opts(gs.map(g=>[g.name,g.name]),'')  .replace('<option','<option value="">All groups</option><option')}</select><button id=as>Save</button>`;
 document.querySelectorAll('.row').forEach(r=>r.onclick=()=>{const a=as.find(x=>x.id==r.dataset.i);id=a.id;$('#an').value=a.name;$('#ad').value=a.date;$('#ag').value=a.team||'';});
 $('#as').onclick=e=>save(()=>api('activities',{id,name:$('#an').value,date:$('#ad').value,team:$('#ag').value}),()=>P.acts(),e.target);};
function form(m,ex,back){stopCam();const g=(i,l,k)=>`<label>${l}</label><select id=${i}>${opts(C.yn.map(x=>[x,x]),ex?ex[k]:C.yn[2])}</select>`;
 V.innerHTML=`<h3 dir=auto>${esc(m.name)}</h3><p dir=auto>${esc(m.team)} ${esc(m.year)}</p>${ex&&ex.status?'<p class=bad>Existing record – saving is a correction.</p>':''}
 <label>الحضور</label><select id=f1>${opts(C.statuses.map(x=>[x,x]),ex&&ex.status,'— اختر —')}</select><label>الزي</label><select id=f2>${opts(C.uniform.map(x=>[x,x]),ex&&ex.uniform,'— اختر —')}</select>
 ${g('f3','قداس','mass')}${g('f4','مدارس أحد','sunday')}${g('f5','اعتراف','confession')}<label>Notes</label><textarea id=f6 dir=auto>${esc(ex&&ex.notes)}</textarea><button id=ok>Submit</button> <button id=cx class=sec>Cancel / Rescan</button>`;
 $('#cx').onclick=()=>go(back);
 $('#ok').onclick=async e=>{const v=i=>$('#'+i).value;if(!v('f1')||!v('f2'))return note('Attendance and uniform are required',1);const b=e.target;b.disabled=true;
  try{const r=await api('attendance',{member:m.id,activity:S.act,status:v('f1'),uniform:v('f2'),mass:v('f3'),sunday:v('f4'),confession:v('f5'),notes:v('f6'),correct:!!(ex&&ex.status)});await go(back);note('Saved: '+m.name+' (points change '+r.points_change+')');}
  catch(x){note(x.message,1);b.disabled=false;}};}
async function roster(back){const d=await api('roster?activity='+S.act);const draw=()=>{const q=$('#q').value.toLowerCase();$('#res').innerHTML=d.filter(m=>(m.name+m.team).toLowerCase().includes(q)).map(m=>`<div class=row data-i=${m.id}><b dir=auto>${esc(m.name)}</b> <small dir=auto>${esc(m.team)}</small><br><small dir=auto>${m.status?esc(m.status)+' · '+esc(m.uniform)+' · قداس: '+esc(m.mass)+' · مدارس أحد: '+esc(m.sunday)+' · اعتراف: '+esc(m.confession):'— no record —'}</small></div>`).join('');
  document.querySelectorAll('#res .row').forEach(r=>r.onclick=()=>form(d.find(x=>x.id==r.dataset.i),d.find(x=>x.id==r.dataset.i),back));};$('#q').oninput=draw;draw();}
P.scan=async()=>{const as=await api('activities');V.innerHTML=actPick(as)+'<button id=cam>Start camera</button><video id=vid playsinline muted hidden></video><h4>Manual search</h4><input id=q placeholder="Name"><div id=res></div>';
 bindAct(()=>S.act&&roster('scan'));if(S.act)await roster('scan');
 $('#cam').onclick=async()=>{if(!need())return;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});}catch(e){return note(e.name==='NotAllowedError'?'Camera permission denied – use manual search':'No camera available – use manual search',1);}
  const v=$('#vid');v.hidden=false;v.srcObject=stream;await v.play();const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  const loop=async()=>{if(!stream)return;if(v.videoWidth){cv.width=v.videoWidth;cv.height=v.videoHeight;cx.drawImage(v,0,0);const im=cx.getImageData(0,0,cv.width,cv.height),r=jsQR(im.data,im.width,im.height);
   if(r&&r.data){stopCam();try{const d=await api('scan?token='+encodeURIComponent(r.data)+'&activity='+S.act);return form(d.member,d.existing,'scan');}catch(e){await go('scan');return note(e.message,1);}}}setTimeout(loop,150);};loop();};};
P.records=async()=>{const as=await api('activities');V.innerHTML=actPick(as)+'<input id=q placeholder="Search by name"><div id=res></div>';bindAct(()=>S.act&&roster('records'));if(S.act)await roster('records');};
P.points=async()=>{const [ms,as,r]=await Promise.all([api('members'),api('activities'),api('rules')]);
 V.innerHTML=`<h3>Attendance points per status</h3><p><small>Blank = not configured (attendance with that status is blocked unless the option below is ticked).</small></p>${r.rules.map(x=>`<div dir=auto>${esc(x.status)}<input type=number step=1 data-s="${esc(x.status)}" value="${x.points??''}"></div>`).join('')}
 <label><input type=checkbox id=aw ${r.allow?'checked':''}> Allow attendance without points</label><button id=rs>Save rules</button>
 <h3>Manual points</h3><select id=pm>${opts(ms.map(m=>[m.id,m.name+' ('+m.team+') — '+m.points]),'','— member —')}</select><div id=pl></div><select id=pa>${opts(as.map(a=>[a.id,a.date+' '+a.name]),'','(no activity)')}</select><input id=pd type=number step=1 placeholder="Points (integer, may be negative)"><input id=pr dir=auto placeholder="Reason (required)"><button id=ps>Add</button>`;
 $('#rs').onclick=e=>save(()=>{const rules={};document.querySelectorAll('[data-s]').forEach(i=>rules[i.dataset.s]=i.value);return api('rules',{rules,allow:$('#aw').checked});},()=>0,e.target);
 const load=async()=>{if(!$('#pm').value)return;const l=await api('points?member='+$('#pm').value);$('#pl').innerHTML=`<h4>Total: ${l.total}</h4>`+l.rows.map(t=>`<div class=row>${t.delta} · ${t.kind} · <small dir=auto>${esc(t.reason)} · ${t.date}</small></div>`).join('');};
 $('#pm').onchange=load;$('#ps').onclick=e=>save(()=>api('points',{member:$('#pm').value,activity:$('#pa').value,delta:$('#pd').value,reason:$('#pr').value}),async()=>{$('#pd').value=$('#pr').value='';await load();},e.target).then(()=>$('#ps').disabled=false);};
P.ach=async()=>{const ms=await api('members');V.innerHTML=`<select id=am>${opts(ms.map(m=>[m.id,m.name+' ('+m.team+')']),'','— member —')}</select><div id=al></div><input id=at dir=auto placeholder="Title"><input id=ac dir=auto placeholder="Description (optional)"><input id=ad type=date value="${new Date().toISOString().slice(0,10)}"><button id=as>Record</button>`;
 const load=async()=>{if(!$('#am').value)return;const r=await api('achievements?member='+$('#am').value);$('#al').innerHTML=r.map(a=>`<div class=row dir=auto>${esc(a.date)} · <b>${esc(a.title)}</b> <small>${esc(a.description)}</small></div>`).join('');};
 $('#am').onchange=load;$('#as').onclick=e=>save(()=>api('achievements',{member:$('#am').value,title:$('#at').value,description:$('#ac').value,date:$('#ad').value}),load,e.target).then(()=>$('#as').disabled=false);};
api('config').then(c=>{C=c;$('#nav').innerHTML=[['members','Members'],['groups','Groups'],['acts','Activities'],['scan','Scan attendance'],['records','Attendance records'],['points','Points'],['ach','Achievements']].map(([k,l])=>`<button data-g=${k}>${l}</button>`).join('');
 document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.g));go('scan');}).catch(e=>V.textContent=e.message);
try{if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js');}catch(e){}
