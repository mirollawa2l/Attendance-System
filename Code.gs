// QR Scouts & Church Tracking – container-bound Apps Script. See README.md.
const ATT=[['S1','حضر في الميعاد'],['S2','محضرش في الميعاد ومعتذر'],['S3','محضرش في الميعاد ومعتذر عذر غير مقبول'],['S4','محضرش في الميعاد ومعتذرش'],['S5','محضرش ومعتذر'],['S6','محضرش ومعتذر عذر غير مقبول'],['S7','محضرش ومعتذرش']];
const UNI=['التزام بالزي','عدم التزام بالزي ومش معتذر','عدم التزام بالزي ومعتذر'];
const YN=['أيوه','لأ','لم يُسجّل'], NA=YN[2];
const H={
 Groups:['group_id','group_name','active','created_at'],
 Members:['member_id','full_name','group_id','year','contact_info','active','qr_token','created_at','updated_at'],
 Activities:['activity_id','activity_name','activity_type','activity_date','group_id','status','created_at','created_by'],
 Attendance:['attendance_id','member_id','activity_id','attendance_status_code','attendance_status_label','uniform_status','mass_participation','sunday_school_participation','confession_participation','notes','recorded_at','recorded_by','updated_at','updated_by'],
 PointsLedger:['transaction_id','member_id','activity_id','points_delta','source','rule_code','reason','related_transaction_id','created_at','created_by'],
 Achievements:['achievement_id','member_id','title','description','earned_at','awarded_by'],
 Settings:['key','value','points','configured'],
 Users:['email','role','active']};
const NUMCOLS=['points_delta','points'];
function doGet(){return HtmlService.createHtmlOutputFromFile('Index').setTitle('Scouts QR').addMetaTag('viewport','width=device-width,initial-scale=1');}

// ---------- helpers ----------
function err(c,m){const e=new Error(m);e.code=c;return e;}
const isOn=v=>String(v).toUpperCase()==='TRUE', b_=v=>(v===false||String(v).toUpperCase()==='FALSE')?'FALSE':'TRUE';
const now_=()=>new Date().toISOString().slice(0,19)+'Z', id_=p=>p+'-'+Utilities.getUuid().slice(0,8);
const ss_=()=>SpreadsheetApp.getActive();
function sh_(n){const s=ss_().getSheetByName(n);if(!s)throw err('NOT_INITIALIZED','Run setup() from the editor first');return s;}
function read_(n){const v=sh_(n).getDataRange().getValues(),h=v.shift();return v.filter(r=>r[0]!=='').map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=r[j] instanceof Date?r[j].toISOString().slice(0,19)+'Z':r[j]);return o;});}
const row_=(n,o)=>H[n].map(k=>o[k]===undefined?'':o[k]);
const add_=(n,o)=>sh_(n).appendRow(row_(n,o));
const put_=(n,r,o)=>sh_(n).getRange(r,1,1,H[n].length).setValues([row_(n,o)]);
function locked_(f){const l=LockService.getScriptLock();if(!l.tryLock(20000))throw err('BUSY','Server busy, please retry');try{const r=f();SpreadsheetApp.flush();return r;}finally{l.releaseLock();}}
function who_(){const e=(Session.getActiveUser().getEmail()||'').toLowerCase();const u=e&&read_('Users').find(r=>String(r.email).toLowerCase()===e&&isOn(r.active));if(!u)throw err('FORBIDDEN','Your Google account is not authorised (Users tab).');return {email:e,role:u.role};}
const gmap_=()=>{const g={};read_('Groups').forEach(x=>g[x.group_id]=x);return g;};
const totals_=()=>{const t={};read_('PointsLedger').forEach(x=>t[x.member_id]=(t[x.member_id]||0)+Number(x.points_delta));return t;};
function act_(id){const a=read_('Activities').find(x=>x.activity_id===id);if(!a)throw err('NOT_FOUND','Activity not found');return a;}
function mem_(id){const m=read_('Members').find(x=>x.member_id===id);if(!m)throw err('NOT_FOUND','Member not found');return m;}
const elig_=(a,m,g)=>isOn(m.active)&&g[m.group_id]&&isOn(g[m.group_id].active)&&(a.group_id==='ALL'||a.group_id===m.group_id);
const rules_=()=>{const r={};read_('Settings').forEach(x=>{if(String(x.key).indexOf('attendance:')===0)r[x.key.slice(11)]=x;});return r;};
const allowNoPts_=()=>{const x=read_('Settings').find(r=>r.key==='allow_without_points');return !!x&&isOn(x.value);};
function target_(code){const r=rules_()[code];if(r&&isOn(r.configured)&&r.points!=='')return Number(r.points);
 if(allowNoPts_())return 0; throw err('RULE_UNCONFIGURED','No point rule configured for this attendance status. An admin must set it (Rules page).');}
function reconcile_(mid,aid,target,code,u){ // append-only; compensating tx linked to the original
 const tx=read_('PointsLedger').filter(t=>t.member_id===mid&&t.activity_id===aid&&t.source==='automatic_attendance');
 const d=target-tx.reduce((s,t)=>s+Number(t.points_delta),0);if(!d)return 0;
 add_('PointsLedger',{transaction_id:id_('T'),member_id:mid,activity_id:aid,points_delta:d,source:'automatic_attendance',rule_code:code,
  reason:tx.length?'Correction of automatic attendance points':'Automatic attendance points',related_transaction_id:tx.length?tx[tx.length-1].transaction_id:'',created_at:now_(),created_by:u.email});
 return d;}

// ---------- setup (run once from the editor) ----------
function setup(){
 Object.keys(H).forEach(n=>{const s=ss_().getSheetByName(n)||ss_().insertSheet(n);
  H[n].forEach((k,i)=>{if(NUMCOLS.indexOf(k)<0)s.getRange(1,i+1,s.getMaxRows(),1).setNumberFormat('@');});
  if(s.getLastRow()===0){s.getRange(1,1,1,H[n].length).setValues([H[n]]).setFontWeight('bold');s.setFrozenRows(1);}
  if(!s.getFilter())s.getDataRange().createFilter();});
 if(read_('Settings').length===0){ATT.forEach(a=>add_('Settings',{key:'attendance:'+a[0],value:a[1],points:'',configured:'FALSE'}));add_('Settings',{key:'allow_without_points',value:'FALSE'});}
 if(read_('Users').length===0)add_('Users',{email:Session.getEffectiveUser().getEmail().toLowerCase(),role:'admin',active:'TRUE'});
 let r=ss_().getSheetByName('Report');
 if(!r){r=ss_().insertSheet('Report');const v=[['Attendance status','Count']];
  ATT.forEach((a,i)=>v.push([a[1],'=COUNTIF(Attendance!E:E,A'+(i+2)+')']));
  v.push(['','']);v.push(['Uniform','Count']);UNI.forEach(x=>v.push([x,'=COUNTIF(Attendance!F:F,A'+(v.length+1)+')']));
  v.push(['','']);v.push(['قداس / مدارس أحد / اعتراف','أيوه · لأ · لم يُسجّل']);
  [['قداس','G'],['مدارس أحد','H'],['اعتراف','I']].forEach(p=>{const n=v.length+1;v.push([p[0]].concat(YN.map(y=>'=COUNTIF(Attendance!'+p[1]+':'+p[1]+',"'+y+'")')));});
  r.getRange(1,1,v.length,4).setValues(v.map(x=>{while(x.length<4)x.push('');return x;}));
  r.getRange(1,6).setFormula('=QUERY(PointsLedger!A:J,"select B, sum(D) where B is not null group by B label sum(D) \'points\'",1)');
  r.getRange(1,1,1,2).setFontWeight('bold');}
 return 'Setup complete';}

// ---------- API ----------
const ADMIN={saveGroup:1,saveMember:1,saveRules:1,getRules:1,manualPoints:1,finalize:1};
function api(fn,p){try{const u=who_();if(!API.hasOwnProperty(fn))throw err('BAD_CALL','Unknown function');
 if(ADMIN[fn]&&u.role!=='admin')throw err('FORBIDDEN','Admin only');return {ok:true,data:API[fn](p||{},u)};}
 catch(e){return {ok:false,error:{code:e.code||'SERVER_ERROR',message:e.message}};}}
const API={
 init:(p,u)=>({att:ATT,uni:UNI,yn:YN,role:u.role,email:u.email}),
 listGroups:()=>read_('Groups'),
 saveGroup:(p,u)=>locked_(()=>{const n=String(p.group_name||'').trim();if(!n)throw err('INVALID','Group name required');
  const ex=p.group_id&&read_('Groups').find(g=>g.group_id===p.group_id);if(p.group_id&&!ex)throw err('NOT_FOUND','Group');
  const o=ex||{group_id:id_('G'),created_at:now_()};o.group_name=n;o.active=b_(p.active);ex?put_('Groups',ex._row,o):add_('Groups',o);return o;}),
 listMembers:(p,u)=>{const t=totals_(),g=gmap_();return read_('Members').map(m=>{m.group_name=g[m.group_id]?g[m.group_id].group_name:'';m.points=t[m.member_id]||0;if(u.role!=='admin'){delete m.qr_token;delete m.contact_info;}return m;});},
 saveMember:(p,u)=>locked_(()=>{const n=String(p.full_name||'').trim();if(!n)throw err('INVALID','Name required');if(!gmap_()[p.group_id])throw err('INVALID','Valid group required');
  const ex=p.member_id&&read_('Members').find(m=>m.member_id===p.member_id);if(p.member_id&&!ex)throw err('NOT_FOUND','Member');
  const o=ex||{member_id:id_('M'),qr_token:(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''),created_at:now_()}; // token never changes on edit
  Object.assign(o,{full_name:n,group_id:p.group_id,year:String(p.year||''),contact_info:String(p.contact_info||''),active:b_(p.active),updated_at:now_()});
  ex?put_('Members',ex._row,o):add_('Members',o);return o;}),
 listActivities:()=>read_('Activities').sort((a,b)=>a.activity_date<b.activity_date?1:-1),
 saveActivity:(p,u)=>locked_(()=>{const n=String(p.activity_name||'').trim();
  if(!n||!/^\d{4}-\d{2}-\d{2}$/.test(p.activity_date||''))throw err('INVALID','Name and date (YYYY-MM-DD) required');
  if(p.group_id!=='ALL'&&!gmap_()[p.group_id])throw err('INVALID','Valid group or ALL required');
  const o={activity_id:id_('ACT'),activity_name:n,activity_type:String(p.activity_type||''),activity_date:p.activity_date,group_id:p.group_id,status:'open',created_at:now_(),created_by:u.email};add_('Activities',o);return o;}),
 eligible:(p)=>{const a=act_(p.activity_id),g=gmap_(),at={};read_('Attendance').filter(r=>r.activity_id===a.activity_id).forEach(r=>at[r.member_id]=r);
  return read_('Members').filter(m=>elig_(a,m,g)).map(m=>({member_id:m.member_id,full_name:m.full_name,group_name:g[m.group_id].group_name,att:at[m.member_id]||null}));},
 byToken:(p,u)=>{const t=String(p.token||'').trim(),m=t&&read_('Members').find(x=>x.qr_token===t);if(!m)throw err('INVALID_TOKEN','Unknown QR code');
  const a=act_(p.activity_id),g=gmap_();if(!isOn(m.active))throw err('MEMBER_INACTIVE','Member is inactive');
  if(!elig_(a,m,g))throw err('NOT_ELIGIBLE','Member not eligible for this activity');
  if(a.status!=='open'&&u.role!=='admin')throw err('ACTIVITY_CLOSED','Activity is '+a.status);
  return {member:{member_id:m.member_id,full_name:m.full_name,group_name:g[m.group_id].group_name},
   existing:read_('Attendance').find(r=>r.member_id===m.member_id&&r.activity_id===a.activity_id)||null};}, // read-only: nothing is saved
 submit:(p,u)=>locked_(()=>{
  const a=act_(p.activity_id),m=mem_(p.member_id);
  if(!isOn(m.active))throw err('MEMBER_INACTIVE','Member is inactive');
  if(!elig_(a,m,gmap_()))throw err('NOT_ELIGIBLE','Member not eligible for this activity');
  const st=ATT.find(x=>x[0]===p.attendance_status_code);if(!st)throw err('INVALID','Attendance status required');
  if(UNI.indexOf(p.uniform_status)<0)throw err('INVALID','Uniform status required');
  const part=k=>{const v=(p[k]===undefined||p[k]==='')?NA:p[k];if(YN.indexOf(v)<0)throw err('INVALID','Bad value: '+k);return v;};
  const mass=part('mass_participation'),sun=part('sunday_school_participation'),conf=part('confession_participation');
  const ex=read_('Attendance').find(r=>r.member_id===m.member_id&&r.activity_id===a.activity_id),corr=!!p.correction;
  if(corr&&u.role!=='admin')throw err('FORBIDDEN','Corrections need an admin');
  if(!corr&&a.status!=='open')throw err('ACTIVITY_CLOSED','Activity is '+a.status);
  if(!corr&&ex)throw err('DUPLICATE','Attendance already recorded for this member and activity');
  if(corr&&!ex)throw err('NOT_FOUND','No record to correct');
  if(corr&&String(p.expected_updated_at)!==String(ex.updated_at))throw err('CONFLICT','Record changed by someone else – reload and retry');
  const target=target_(st[0]); // throws before any write if rule unconfigured
  const o=ex||{attendance_id:id_('A'),member_id:m.member_id,activity_id:a.activity_id,recorded_at:now_(),recorded_by:u.email};
  Object.assign(o,{attendance_status_code:st[0],attendance_status_label:st[1],uniform_status:p.uniform_status,mass_participation:mass,sunday_school_participation:sun,confession_participation:conf,notes:String(p.notes||'').slice(0,500),updated_at:now_(),updated_by:u.email});
  ex?put_('Attendance',ex._row,o):add_('Attendance',o);
  return {attendance_id:o.attendance_id,points_change:reconcile_(m.member_id,a.activity_id,target,st[0],u)};}),
 finalize:(p,u)=>locked_(()=>{const a=act_(p.activity_id);if(['finalized','closed'].indexOf(p.status)<0)throw err('INVALID','Bad status');
  const have=new Set(read_('Attendance').filter(r=>r.activity_id===a.activity_id).map(r=>r.member_id)),g=gmap_();
  const miss=read_('Members').filter(m=>elig_(a,m,g)&&!have.has(m.member_id)).length;
  if(miss&&!p.force)throw err('MISSING_ATTENDANCE',miss+' eligible member(s) have no attendance record.');
  a.status=p.status;put_('Activities',a._row,a);return a;}),
 getRules:()=>({rules:ATT.map(a=>{const r=rules_()[a[0]]||{};return {code:a[0],label:a[1],points:isOn(r.configured)?r.points:''};}),allow:allowNoPts_()}),
 saveRules:(p)=>locked_(()=>{const S=read_('Settings');ATT.forEach(a=>{const r=S.find(x=>x.key==='attendance:'+a[0]),v=String((p.rules||{})[a[0]]??'').trim();
   if(v!==''&&!/^-?\d+$/.test(v))throw err('INVALID','Points must be an integer');
   r.points=v===''?'':Number(v);r.configured=v===''?'FALSE':'TRUE';put_('Settings',r._row,r);});
  const al=S.find(x=>x.key==='allow_without_points');al.value=p.allow?'TRUE':'FALSE';put_('Settings',al._row,al);return true;}),
 manualPoints:(p,u)=>locked_(()=>{const m=mem_(p.member_id),reason=String(p.reason||'').trim(),d=String(p.points??'').trim();
  if(!reason)throw err('INVALID','Reason required');if(!/^-?\d+$/.test(d))throw err('INVALID','Points must be an integer');
  if(p.activity_id)act_(p.activity_id);
  add_('PointsLedger',{transaction_id:id_('T'),member_id:m.member_id,activity_id:p.activity_id||'',points_delta:Number(d),source:'manual',rule_code:'',reason:reason,related_transaction_id:'',created_at:now_(),created_by:u.email});return true;}),
 ledger:(p)=>{const rows=read_('PointsLedger').filter(t=>t.member_id===p.member_id);return {total:rows.reduce((s,t)=>s+Number(t.points_delta),0),rows:rows.reverse()};},
 addAchievement:(p,u)=>locked_(()=>{const m=mem_(p.member_id),t=String(p.title||'').trim();if(!t)throw err('INVALID','Title required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.earned_at||''))throw err('INVALID','Date required');
  add_('Achievements',{achievement_id:id_('AC'),member_id:m.member_id,title:t,description:String(p.description||''),earned_at:p.earned_at,awarded_by:(p.awarded_by?p.awarded_by+' (entered by ':'(entered by ')+u.email+')'});return true;}),
 listAchievements:(p)=>read_('Achievements').filter(a=>a.member_id===p.member_id)
};
