const test=require('node:test'),assert=require('node:assert'),os=require('os'),path=require('path'),fs=require('fs');
const {openDb,createServer}=require('../server.js');
const jsQR=require('../public/vendor/jsqr.js'),qrcode=require('../public/vendor/qrcode.js');
// Independently typed copies of the required Arabic labels:
const ST=['حضر في الميعاد','محضرش في الميعاد ومعتذر','محضرش في الميعاد ومعتذر عذر غير مقبول','محضرش في الميعاد ومعتذرش','محضرش ومعتذر','محضرش ومعتذر عذر غير مقبول','محضرش ومعتذرش'];
const UN=['التزام بالزي','عدم التزام بالزي ومش معتذر','عدم التزام بالزي ومعتذر'],YN=['أيوه','لأ','لم يُسجّل'];
const file=path.join(os.tmpdir(),'scouts-test-'+process.pid+'.db');let db,srv,base;
const start=async()=>{db=openDb(file);srv=createServer(db);await new Promise(r=>srv.listen(0,r));base='http://127.0.0.1:'+srv.address().port;};
const stop=async()=>{await new Promise(r=>srv.close(r));db.close();};
const call=async(p,b)=>{const r=await fetch(base+'/api/'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}:{});return {s:r.status,j:await r.json()};};
test('full workflow',async()=>{
 await start();
 const cfg=(await call('config')).j;assert.deepStrictEqual(cfg.statuses,ST);assert.deepStrictEqual(cfg.uniform,UN);assert.deepStrictEqual(cfg.yn,YN);
 assert.strictEqual((await call('groups',{name:'TEST Troop'})).s,200);assert.strictEqual((await call('groups',{name:'TEST Troop'})).s,409);
 await call('groups',{name:'TEST Other'});
 assert.strictEqual((await call('members',{name:'Test Child A',team:'TEST Troop',year:'1'})).s,200);
 assert.strictEqual((await call('members',{name:'Test Child A',team:'TEST Troop',year:'1'})).s,409,'same name+group+year rejected');
 await call('members',{name:'Test Child B',team:'TEST Other'});await call('members',{name:'Test Child C',team:'TEST Troop',active:false});
 let ms=(await call('members')).j;const A=ms.find(m=>m.name==='Test Child A'),B=ms.find(m=>m.name==='Test Child B'),Cc=ms.find(m=>m.name==='Test Child C');
 assert.notStrictEqual(A.token,B.token);
 await call('members',{id:A.id,name:'Test Child A2',team:'TEST Troop',year:'1'});
 assert.strictEqual((await call('members')).j.find(m=>m.id===A.id).token,A.token,'token stable after edit');
 await call('groups',{name:'TEST Troop Renamed',old:'TEST Troop'});
 assert.strictEqual((await call('members')).j.find(m=>m.id===A.id).team,'TEST Troop Renamed','group rename cascades');
 await call('activities',{name:'TEST Meeting',date:'2026-10-16',team:'TEST Troop Renamed'});
 const act=(await call('activities')).j[0];assert.strictEqual((await call('activities',{name:'TEST Meeting',date:'2026-10-16'})).s,409);
 // QR roundtrip: generate locally, decode with the same jsQR bundle the browser uses
 const q=qrcode(0,'M');q.addData(A.token);q.make();const n=q.getModuleCount(),s=6,m=4,W=(n+2*m)*s,px=new Uint8ClampedArray(W*W*4).fill(255);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))for(let y=0;y<s;y++)for(let x=0;x<s;x++){const i=(((r+m)*s+y)*W+(c+m)*s+x)*4;px[i]=px[i+1]=px[i+2]=0;}
 const dec=jsQR(px,W,W);assert.strictEqual(dec.data,A.token);assert.ok(!/Test|\d{6,}/.test(dec.data.slice(0,0)));
 const sc=await call('scan?token='+dec.data+'&activity='+act.id);assert.strictEqual(sc.j.member.id,A.id);
 assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attendance').get().c,0,'scan alone saves nothing');
 assert.strictEqual((await call('scan?token=nope&activity='+act.id)).j.code,'INVALID_TOKEN');
 assert.strictEqual((await call('scan?token='+Cc.token+'&activity='+act.id)).j.code,'MEMBER_INACTIVE');
 assert.strictEqual((await call('scan?token='+B.token+'&activity='+act.id)).j.code,'NOT_ELIGIBLE');
 const body=o=>({member:A.id,activity:act.id,status:ST[0],uniform:UN[0],...o});
 assert.strictEqual((await call('attendance',body())).j.code,'RULE_UNCONFIGURED');
 assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attendance').get().c,0);
 await call('rules',{rules:{[ST[0]]:'10',[ST[6]]:'-3'},allow:false});
 assert.strictEqual((await call('attendance',{...body(),status:'bogus'})).s,400);
 assert.strictEqual((await call('attendance',body())).j.points_change,10);
 const row=db.prepare('SELECT * FROM attendance').get();assert.strictEqual(row.status,ST[0]);assert.strictEqual(row.uniform,UN[0]);assert.deepStrictEqual([row.mass,row.sunday,row.confession],[YN[2],YN[2],YN[2]]);
 assert.strictEqual((await call('attendance',body())).s,409);
 // simultaneous duplicate submissions
 const rs=await Promise.all(Array.from({length:15},()=>call('attendance',body({member:A.id}))));assert.strictEqual(rs.filter(r=>r.s===200).length,0);
 // correction reconciles points, keeps history
 const c=await call('attendance',body({status:ST[6],mass:YN[0],correct:true}));assert.strictEqual(c.j.points_change,-13);
 assert.strictEqual((await call('attendance',body({status:ST[6],correct:true}))).j.points_change,0,'no double award');
 assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attendance').get().c,1);
 let pl=(await call('points?member='+A.id)).j;assert.strictEqual(pl.total,-3);assert.strictEqual(pl.rows.length,2);
 assert.strictEqual((await call('attendance',body({status:ST[3],correct:true}))).j.code,'RULE_UNCONFIGURED');
 await call('rules',{rules:{},allow:true});assert.strictEqual((await call('attendance',body({status:ST[3],correct:true}))).s,200);
 assert.strictEqual((await call('points',{member:A.id,delta:'2',reason:' '})).s,400);
 assert.strictEqual((await call('points',{member:A.id,delta:'1.5',reason:'x'})).s,400);
 await call('points',{member:A.id,delta:'-4',reason:'TEST manual'});assert.strictEqual((await call('points?member='+A.id)).j.total,-4);
 await call('achievements',{member:A.id,title:'TEST badge',date:'2026-10-16'});assert.strictEqual((await call('achievements?member='+A.id)).j[0].title,'TEST badge');
 // new member, concurrent first submissions -> exactly one record
 await call('rules',{rules:{[ST[0]]:'10'},allow:false});
 const rs2=await Promise.all(Array.from({length:15},()=>call('attendance',{member:A.id,activity:act.id,status:ST[0],uniform:UN[0]})));
 assert.strictEqual(rs2.filter(r=>r.s===200).length,0);
 await stop();
 // persistence across restart
 await start();assert.strictEqual((await call('points?member='+A.id)).j.total,-4);assert.strictEqual((await call('members')).j.length,3);
 assert.strictEqual((await call('rules')).j.rules.find(r=>r.status===ST[6]).points,null);
 await stop();for(const f of [file,file+'-wal',file+'-shm'])fs.rmSync(f,{force:true});
});
test('concurrent first submissions create exactly one record',async()=>{
 await start();await call('groups',{name:'G'});await call('members',{name:'T1',team:'G'});await call('activities',{name:'Act',date:'2026-01-01'});
 await call('rules',{rules:{[ST[0]]:'5'}});const m=(await call('members')).j[0],a=(await call('activities')).j[0];
 const rs=await Promise.all(Array.from({length:20},()=>call('attendance',{member:m.id,activity:a.id,status:ST[0],uniform:UN[0]})));
 assert.strictEqual(rs.filter(r=>r.s===200).length,1);assert.strictEqual(rs.filter(r=>r.s===409).length,19);
 assert.strictEqual((await call('points?member='+m.id)).j.total,5);await stop();for(const f of [file,file+'-wal',file+'-shm'])fs.rmSync(f,{force:true});
});
