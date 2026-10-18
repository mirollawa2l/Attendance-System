// QR Scouts & Church Tracking – container-bound Apps Script. See README.md.
const ATT=[['S1','حضر في الميعاد'],['S2','محضرش في الميعاد ومعتذر'],['S3','محضرش في الميعاد ومعتذر عذر غير مقبول'],['S4','محضرش في الميعاد ومعتذرش'],['S5','محضرش ومعتذر'],['S6','محضرش ومعتذر عذر غير مقبول'],['S7','محضرش ومعتذرش']];
const UNI=['التزام بالزي','عدم التزام بالزي ومش معتذر','عدم التزام بالزي ومعتذر'];
const YN=['أيوه','لأ','لم يُسجّل'], NA=YN[2];
const TROOPS_={Orion:['كروان','نمر','فيل','نحلة'],Polaris:['كوبرا','صقر','سنجاب','اسد']};
const TERMS_=['Spring','Fall','Summer'];
function termOptions_(){
 const currentYear=Number(Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy'));
 const out=[];for(let y=currentYear-3;y<=currentYear+2;y++)TERMS_.forEach(t=>out.push(t+' '+y));
 try{read_('Activities').forEach(a=>{const t=termForActivity_(a);if(t!=='Legacy'&&!out.includes(t))out.push(t);});}catch(_){}
 return out.sort((a,b)=>{const ya=Number(a.slice(-4)),yb=Number(b.slice(-4));if(ya!==yb)return yb-ya;return TERMS_.indexOf(a.replace(/ \d{4}$/,''))-TERMS_.indexOf(b.replace(/ \d{4}$/,''));});
}
function activityYear_(a){const d=String(a.activity_date||'');const m=d.match(/^(\d{4})/);return m?m[1]:String(new Date().getFullYear());}
function termForActivity_(a){const raw=String(a.term||'').trim();if(raw==='Legacy'||!raw)return 'Legacy';if(/^(Spring|Fall|Summer)$/.test(raw))return raw+' '+activityYear_(a);if(/^(Spring|Fall|Summer) \d{4}$/.test(raw))return raw;return 'Legacy';}
function displayDate_(v){const d=String(v||'').slice(0,10);const m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:d;}
function meetingName_(a){const unit=String(a.group_id||'ALL')==='ALL'?'All Units':String(a.group_id||'Unit');const term=termForActivity_(a);const season=term==='Legacy'?'Meeting':term.split(' ')[0];return unit+' '+season+' '+displayDate_(a.activity_date);}
function normalizeActivityTerms_(){
 const sh=ss_().getSheetByName('Activities');if(!sh||sh.getLastRow()<2)return;
 const rows=read_('Activities');rows.forEach(a=>{const term=termForActivity_(a);const name=meetingName_(Object.assign({},a,{term}));if(a.term!==term||a.activity_name!==name){const hs=headers_('Activities');const tcol=hs.indexOf('term')+1,ncol=hs.indexOf('activity_name')+1;if(tcol)sh.getRange(a._row,tcol).setValue(term);if(ncol)sh.getRange(a._row,ncol).setValue(name);}});
}
const H={
 Members:['member_id','full_name','group_id','year','contact_info','active','qr_token','created_at','updated_at','member_code','unit','troop','phone_number','national_id','mother_phone','father_phone','notes','birthday_date','location'],
 Activities:['activity_id','activity_name','activity_type','activity_date','group_id','status','created_at','created_by','term'],
 Attendance:['attendance_id','member_id','activity_id','attendance_status_code','attendance_status_label','uniform_status','mass_participation','sunday_school_participation','confession_participation','notes','recorded_at','recorded_by','updated_at','updated_by','member_name'],
 PointsLedger:['transaction_id','member_id','activity_id','points_delta','source','rule_code','reason','related_transaction_id','created_at','created_by','member_name'],
 Settings:['key','value','points','configured']};
const NUMCOLS=['points_delta','points'];
function include(filename){return HtmlService.createHtmlOutputFromFile(filename).getContent();}
function doGet(){return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Scouts QR').addMetaTag('viewport','width=device-width,initial-scale=1');}
function doPost(e){
 let p;
 try{p=JSON.parse(e&&e.postData&&e.postData.contents||'');}
 catch(_){return ContentService.createTextOutput(JSON.stringify({ok:false,error:{code:'INVALID_JSON',message:'Request body must be valid JSON'}})).setMimeType(ContentService.MimeType.JSON);}
 const result=api('submit',p);
 return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- helpers ----------
function err(c,m){const e=new Error(m);e.code=c;return e;}
const isOn=v=>String(v).toUpperCase()==='TRUE', b_=v=>(v===false||String(v).toUpperCase()==='FALSE')?'FALSE':'TRUE';
const now_=()=>new Date().toISOString().slice(0,19)+'Z', id_=p=>p+'-'+Utilities.getUuid().slice(0,8);
const ss_=()=>SpreadsheetApp.getActive();
function sh_(n){const s=ss_().getSheetByName(n);if(!s)throw err('NOT_INITIALIZED','Run setup() from the editor first');return s;}
function read_(n){const v=sh_(n).getDataRange().getValues(),h=v.shift();return v.filter(r=>r[0]!=='').map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=r[j] instanceof Date?r[j].toISOString().slice(0,19)+'Z':r[j]);return o;});}
function headers_(n){const s=sh_(n);if(!s.getLastRow())return H[n];return s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim());}
const row_=(n,o)=>headers_(n).map(k=>o[k]===undefined?'':o[k]);
const add_=(n,o)=>sh_(n).appendRow(row_(n,o));
const put_=(n,r,o)=>sh_(n).getRange(r,1,1,headers_(n).length).setValues([row_(n,o)]);
function deleteRowsBy_(sheetName, field, value){const rows=read_(sheetName).filter(r=>String(r[field]||'')===String(value));rows.sort((a,b)=>b._row-a._row).forEach(r=>sh_(sheetName).deleteRow(r._row));return rows.length;}
function ensureHeaders_(n){const s=sh_(n);if(s.getLastRow()===0){s.getRange(1,1,1,H[n].length).setValues([H[n]]).setFontWeight('bold');s.setFrozenRows(1);return;}let headers=headers_(n);H[n].forEach(k=>{if(!headers.includes(k)){const col=headers.length+1;s.getRange(1,col).setValue(k).setFontWeight('bold');headers.push(k);}});}
function locked_(f){const l=LockService.getScriptLock();if(!l.tryLock(20000))throw err('BUSY','Server busy, please retry');try{const r=f();SpreadsheetApp.flush();return r;}finally{l.releaseLock();}}
const PUBLIC_USER={email:'Public web app'};
const gmap_=()=>({Orion:{group_id:'Orion',group_name:'Orion',active:'TRUE'},Polaris:{group_id:'Polaris',group_name:'Polaris',active:'TRUE'}});
function unitGroup_(unit){if(!['Orion','Polaris'].includes(String(unit)))throw err('INVALID','Choose Orion or Polaris');return {group_id:String(unit),group_name:String(unit),active:'TRUE'};}
function migrateAndRemoveUnusedSheets_(){
 const ss=ss_(), gs=ss.getSheetByName('Groups');
 const groupNames={}; if(gs&&gs.getLastRow()>1){const v=gs.getDataRange().getValues(),h=v.shift();v.forEach(row=>{const o={};h.forEach((k,i)=>o[k]=row[i]);groupNames[String(o.group_id)]=String(o.group_name||'');});}
 const ms=ss.getSheetByName('Members'); if(ms&&ms.getLastRow()>1){const v=ms.getDataRange().getValues(),h=v[0],unitCol=h.indexOf('unit'),gidCol=h.indexOf('group_id');for(let i=1;i<v.length;i++){const old=String(v[i][gidCol]||''),name=groupNames[old];if(unitCol>=0&&(!v[i][unitCol]||!['Orion','Polaris'].includes(String(v[i][unitCol])))){if(['Orion','Polaris'].includes(name))v[i][unitCol]=name;}if(gidCol>=0){const u=String(unitCol>=0?v[i][unitCol]:'');if(['Orion','Polaris'].includes(u))v[i][gidCol]=u;else if(['Orion','Polaris'].includes(name))v[i][gidCol]=name;}}ms.getRange(1,1,v.length,v[0].length).setValues(v);}
 const as=ss.getSheetByName('Activities'); if(as&&as.getLastRow()>1){const v=as.getDataRange().getValues(),h=v[0],col=h.indexOf('group_id');if(col>=0){for(let i=1;i<v.length;i++){const old=String(v[i][col]||'');if(groupNames[old])v[i][col]=groupNames[old];}as.getRange(1,1,v.length,v[0].length).setValues(v);}}
 if(gs)ss.deleteSheet(gs);const ach=ss.getSheetByName('Achievements');if(ach)ss.deleteSheet(ach);
}
function act_(id){const a=read_('Activities').find(x=>x.activity_id===id);if(!a)throw err('NOT_FOUND','Activity not found');a.term=termForActivity_(a);a.activity_name=meetingName_(a);return a;}
function mem_(id){const m=read_('Members').find(x=>x.member_id===id);if(!m)throw err('NOT_FOUND','Member not found');return m;}
const elig_=(a,m,g)=>isOn(m.active)&&['Orion','Polaris'].includes(String(m.unit||m.group_id))&&(a.group_id==='ALL'||a.group_id===String(m.unit||m.group_id));
const rules_=()=>{const r={};read_('Settings').forEach(x=>{if(String(x.key).indexOf('attendance:')===0)r[x.key.slice(11)]=x;});return r;};
const allowNoPts_=()=>{const x=read_('Settings').find(r=>r.key==='allow_without_points');return !!x&&isOn(x.value);};
function target_(code){const r=rules_()[code];if(r&&isOn(r.configured)&&r.points!=='')return Number(r.points);
 if(allowNoPts_())return 0; throw err('RULE_UNCONFIGURED','Attendance is blocked until a point rule is configured in the Settings sheet.');}
function reconcile_(mid,aid,target,code,u){ // append-only; compensating tx linked to the original
 const tx=read_('PointsLedger').filter(t=>t.member_id===mid&&t.activity_id===aid&&t.source==='automatic_attendance');
 const d=target-tx.reduce((s,t)=>s+Number(t.points_delta),0);if(!d)return 0;
 add_('PointsLedger',{transaction_id:id_('T'),member_id:mid,activity_id:aid,points_delta:d,source:'automatic_attendance',rule_code:code,
  reason:tx.length?'Correction of automatic attendance points':'Automatic attendance points',related_transaction_id:tx.length?tx[tx.length-1].transaction_id:'',created_at:now_(),created_by:u.email,member_name:mem_(mid).full_name});
 return d;}

// Add the display-name column at the end so existing attendance columns/data stay intact.
function ensureAttendanceNameColumn_(){
 const s=ss_().getSheetByName('Attendance'); if(!s)return;
 const last=Math.max(s.getLastColumn(),1), headers=s.getRange(1,1,1,last).getDisplayValues()[0];
 if(headers.indexOf('member_name')<0)s.getRange(1,last+1).setValue('member_name').setFontWeight('bold');
}
function backfillAttendanceNames_(){
 const rows=read_('Attendance'), members={}; read_('Members').forEach(m=>members[m.member_id]=m.full_name);
 const headers=sh_('Attendance').getRange(1,1,1,sh_('Attendance').getLastColumn()).getDisplayValues()[0];const nameCol=headers.indexOf('member_name')+1;
 rows.forEach(r=>{const name=members[r.member_id]||'';if(name&&r.member_name!==name)sh_('Attendance').getRange(r._row,nameCol).setValue(name);});
}
function backfillRelatedNames_(){
 const members={};read_('Members').forEach(m=>members[m.member_id]=m.full_name);
 ['PointsLedger'].forEach(n=>{const rows=read_(n),hs=headers_(n),col=hs.indexOf('member_name')+1;if(!col)return;rows.forEach(r=>{const name=members[r.member_id]||r.member_name||'';if(name&&r.member_name!==name)sh_(n).getRange(r._row,col).setValue(name);});});
}
function backfillMemberProfiles_(){
 const groups={Orion:'Orion',Polaris:'Polaris'};
 const hs=headers_('Members'),codeCol=hs.indexOf('member_code')+1,unitCol=hs.indexOf('unit')+1;
 read_('Members').forEach(m=>{if(codeCol&&m.member_code!==m.member_id)sh_('Members').getRange(m._row,codeCol).setValue(m.member_id);const gn=groups[m.group_id];if(!m.unit&&unitCol&&['Orion','Polaris'].includes(gn))sh_('Members').getRange(m._row,unitCol).setValue(gn);});
}
function syncMemberNames_(memberId, name){
 ['Attendance','PointsLedger'].forEach(n=>{const hs=headers_(n),idCol=hs.indexOf('member_id')+1,nameCol=hs.indexOf('member_name')+1;if(!idCol||!nameCol)return;read_(n).filter(r=>r.member_id===memberId).forEach(r=>sh_(n).getRange(r._row,nameCol).setValue(name));});
}
function enrichAttendance_(r, members, activities, groups){
 const m=members[r.member_id]||{}, a=activities[r.activity_id]||{};
 return Object.assign({},r,{member_name:m.full_name||r.member_name||'Unknown girl',
   group_name:groups[m.group_id]||'',activity_name:a.activity_name||'Weekly meeting',
   activity_date:a.activity_date||'',attendance_status_label:r.attendance_status_label||''});
}
// Human-friendly code: three random uppercase letters + three random digits.
function randomMemberCode_(usedCodes){
 const used=usedCodes||new Set(read_('Members').map(m=>String(m.member_id||'')));
 for(let attempt=0;attempt<500;attempt++){
  let letters='';
  for(let i=0;i<3;i++)letters+=String.fromCharCode(65+Math.floor(Math.random()*26));
  const digits=String(Math.floor(Math.random()*1000)).padStart(3,'0');
  const code=letters+digits;
  if(!used.has(code))return code;
 }
 throw err('ID_GENERATION_FAILED','Could not generate a unique member code. Please try again.');
}
function normalizeMemberIds_(){
 const members=read_('Members');
 const used=new Set();
 // Reserve codes that already match the new format and are unique.
 members.forEach(m=>{const code=String(m.member_id||'');if(/^[A-Z]{3}\d{3}$/.test(code)&&!used.has(code))used.add(code);});
 const remap={};
 members.forEach(m=>{
  const old=String(m.member_id||'');
  let code=old;
  if(!/^[A-Z]{3}\d{3}$/.test(code)||members.filter(x=>String(x.member_id||'')===old).length>1){
   code=randomMemberCode_(used);used.add(code);
  }
  remap[old]=code;
 });
 // Keep existing attendance and points linked to the member code after migration.
 ['Attendance','PointsLedger'].forEach(name=>{
  const rows=read_(name), hs=headers_(name), idCol=hs.indexOf('member_id')+1;
  if(!idCol)return;
  rows.forEach(r=>{const mapped=remap[String(r.member_id||'')];if(mapped&&mapped!==r.member_id)sh_(name).getRange(r._row,idCol).setValue(mapped);});
 });
 const hs=headers_('Members'), idCol=hs.indexOf('member_id')+1, codeCol=hs.indexOf('member_code')+1;
 members.forEach(m=>{
  const code=remap[String(m.member_id||'')];
  if(code&&idCol)sh_('Members').getRange(m._row,idCol).setValue(code);
  if(code&&codeCol)sh_('Members').getRange(m._row,codeCol).setValue(code);
 });
}
function nextMemberId_(){return randomMemberCode_();}

// ---------- setup (run once from the editor) ----------
function setup(){
 migrateAndRemoveUnusedSheets_();
 Object.keys(H).forEach(n=>{const s=ss_().getSheetByName(n)||ss_().insertSheet(n);ensureHeaders_(n);
  const hs=headers_(n);hs.forEach((k,i)=>{if(NUMCOLS.indexOf(k)<0)s.getRange(1,i+1,s.getMaxRows(),1).setNumberFormat('@');});
  if(!s.getFilter())s.getDataRange().createFilter();});
 normalizeMemberIds_();
 normalizeActivityTerms_();
 ensureAttendanceNameColumn_();
 if(read_('Settings').length===0){ATT.forEach(a=>add_('Settings',{key:'attendance:'+a[0],value:a[1],points:'',configured:'FALSE'}));add_('Settings',{key:'allow_without_points',value:'FALSE'});}
 let r=ss_().getSheetByName('Report');
 if(!r){r=ss_().insertSheet('Report');const v=[['Attendance status','Count']];
  ATT.forEach((a,i)=>v.push([a[1],'=COUNTIF(Attendance!E:E,A'+(i+2)+')']));
  v.push(['','']);v.push(['Uniform','Count']);UNI.forEach(x=>v.push([x,'=COUNTIF(Attendance!F:F,A'+(v.length+1)+')']));
  v.push(['','']);v.push(['قداس / مدارس أحد / اعتراف','أيوه · لأ · لم يُسجّل']);
  [['قداس','G'],['مدارس أحد','H'],['اعتراف','I']].forEach(p=>{const n=v.length+1;v.push([p[0]].concat(YN.map(y=>'=COUNTIF(Attendance!'+p[1]+':'+p[1]+',"'+y+'")')));});
  r.getRange(1,1,v.length,4).setValues(v.map(x=>{while(x.length<4)x.push('');return x;}));
  r.getRange(1,6).setFormula('=QUERY(PointsLedger!A:J,"select B, sum(D) where B is not null group by B label sum(D) \'points\'",1)');
  r.getRange(1,1,1,2).setFontWeight('bold');}
 r.getRange(1,6).setFormula('=QUERY(PointsLedger!A:K,"select K, sum(D) where K is not null group by K label K \'Member name\', sum(D) \'points\'",1)');
 backfillMemberProfiles_();backfillAttendanceNames_();backfillRelatedNames_();
 return 'Setup complete';}

// ---------- API ----------
function api(fn,p){try{if(!Object.prototype.hasOwnProperty.call(API,fn))throw err('BAD_CALL','Unknown function');
 return {ok:true,data:API[fn](p||{},PUBLIC_USER)};}
 catch(e){return {ok:false,error:{code:e.code||'SERVER_ERROR',message:e.message}};}}
const API={
 init:()=>({att:ATT,uni:UNI,yn:YN,terms:termOptions_()}),
 listGroups:()=>Object.values(gmap_()),
 listMembers:()=>{const g=gmap_();return read_('Members').map(m=>{m.group_name=g[m.unit||m.group_id]?g[m.unit||m.group_id].group_name:'';return m;});},
 saveMember:(p,u)=>locked_(()=>{const n=String(p.full_name||'').trim();if(!n)throw err('INVALID','Name required');if(!['Orion','Polaris'].includes(String(p.unit||'')))throw err('INVALID','Choose Orion or Polaris');if(!(TROOPS_[String(p.unit)]||[]).includes(String(p.troop||'')))throw err('INVALID','Choose a valid troop for the selected unit');const unitGroup=unitGroup_(String(p.unit));
  const ex=p.member_id&&read_('Members').find(m=>m.member_id===p.member_id);if(p.member_id&&!ex)throw err('NOT_FOUND','Member');
  const o=ex||{member_id:nextMemberId_(),qr_token:(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''),created_at:now_()}; // generated once; stable on edits
  Object.assign(o,{member_id:o.member_id,member_code:o.member_id,full_name:n,group_id:unitGroup.group_id,year:String(p.year||''),contact_info:String(p.contact_info||''),active:b_(p.active),updated_at:now_(),
   unit:String(p.unit||''),troop:String(p.troop||''),phone_number:String(p.phone_number||''),national_id:String(p.national_id||''),
   mother_phone:String(p.mother_phone||''),father_phone:String(p.father_phone||''),notes:String(p.notes||''),birthday_date:String(p.birthday_date||''),location:String(p.location||'')});
  ex?put_('Members',ex._row,o):add_('Members',o);syncMemberNames_(o.member_id,n);return o;}),
 deleteMember:(p,u)=>locked_(()=>{const id=String(p.member_id||'');if(!id)throw err('INVALID','Member is required');const m=read_('Members').find(x=>x.member_id===id);if(!m)throw err('NOT_FOUND','Member not found');deleteRowsBy_('Attendance','member_id',id);deleteRowsBy_('PointsLedger','member_id',id);deleteRowsBy_('Members','member_id',id);return {deleted:true,member_id:id};}),
 deleteActivity:(p,u)=>locked_(()=>{const id=String(p.activity_id||'');if(!id)throw err('INVALID','Meeting is required');const a=read_('Activities').find(x=>x.activity_id===id);if(!a)throw err('NOT_FOUND','Meeting not found');deleteRowsBy_('Attendance','activity_id',id);deleteRowsBy_('PointsLedger','activity_id',id);deleteRowsBy_('Activities','activity_id',id);return {deleted:true,activity_id:id};}),
 deleteAttendance:(p,u)=>locked_(()=>{const id=String(p.attendance_id||'');if(!id)throw err('INVALID','Attendance record is required');const r=read_('Attendance').find(x=>x.attendance_id===id);if(!r)throw err('NOT_FOUND','Attendance record not found');deleteRowsBy_('Attendance','attendance_id',id); // retain manually awarded points; remove only auto attendance transactions for this meeting
  const rows=read_('PointsLedger').filter(x=>x.member_id===r.member_id&&x.activity_id===r.activity_id&&x.source==='automatic_attendance').sort((a,b)=>b._row-a._row);rows.forEach(x=>sh_('PointsLedger').deleteRow(x._row));return {deleted:true,attendance_id:id};}),
 listActivities:()=>read_('Activities').map(a=>Object.assign({},a,{term:termForActivity_(a),activity_name:meetingName_(a)})).sort((a,b)=>String(a.activity_date)<String(b.activity_date)?1:-1),
 listAttendance:()=>{
  const members={},activities={},groups={};
  read_('Members').forEach(m=>members[m.member_id]=m);
  read_('Activities').forEach(a=>activities[a.activity_id]=a);
  Object.keys(gmap_()).forEach(k=>groups[k]=k);
  return read_('Attendance').map(r=>enrichAttendance_(r,members,activities,groups))
   .sort((a,b)=>String(b.activity_date).localeCompare(String(a.activity_date))||String(b.recorded_at).localeCompare(String(a.recorded_at)));
 },
 meetingReport:(p)=>{
  const a=act_(p.activity_id), groups=gmap_(), members=read_('Members'), records=read_('Attendance').filter(r=>r.activity_id===a.activity_id), byId={};
  records.forEach(r=>byId[r.member_id]=r);
  const eligibleMembers=members.filter(m=>elig_(a,m,groups));
  const rows=eligibleMembers.map(m=>({member_id:m.member_id,member_name:m.full_name,group_name:m.unit||m.group_id,
    attendance:byId[m.member_id]||null}));
  const statusCounts={}; ATT.forEach(x=>statusCounts[x[1]]=0);
  records.forEach(r=>{if(r.attendance_status_label)statusCounts[r.attendance_status_label]=(statusCounts[r.attendance_status_label]||0)+1;});
  return {activity:a,eligible_count:eligibleMembers.length,recorded_count:rows.filter(r=>r.attendance).length,
    missing_count:rows.filter(r=>!r.attendance).length,status_counts:statusCounts,rows:rows};
 },
 girlAnalytics:(p)=>{
  const m=mem_(p.member_id), groups=gmap_(), term=String(p.term||'All'), today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'), allActs=read_('Activities').filter(a=>(a.group_id==='ALL'||a.group_id===m.group_id)&&(String(a.activity_date).slice(0,10)<=today||['finalized','closed'].includes(a.status))&&(term==='All'||termForActivity_(a)===term))
    .sort((a,b)=>String(b.activity_date).localeCompare(String(a.activity_date)));
  const validActivityIds=new Set(allActs.map(a=>a.activity_id));
  const allAtt=read_('Attendance').filter(r=>r.member_id===m.member_id&&validActivityIds.has(r.activity_id)), byAct={};allAtt.forEach(r=>byAct[r.activity_id]=r);
  const history=allActs.map(a=>{const r=byAct[a.activity_id]||null;return {activity_id:a.activity_id,activity_name:a.activity_name,activity_date:a.activity_date,
    activity_status:a.status,attendance_status_code:r?r.attendance_status_code:'',attendance_status_label:r?r.attendance_status_label:'لم يُسجّل',
    uniform_status:r?r.uniform_status:'',mass_participation:r?r.mass_participation:NA,
    sunday_school_participation:r?r.sunday_school_participation:NA,confession_participation:r?r.confession_participation:NA,
    notes:r?r.notes:'',recorded:!!r};});
  const counts={};ATT.forEach(x=>counts[x[1]]=0);allAtt.forEach(r=>{if(r.attendance_status_label)counts[r.attendance_status_label]=(counts[r.attendance_status_label]||0)+1;});
  const onTime=allAtt.filter(r=>r.attendance_status_code==='S1').length, late=0,
    absences=allAtt.filter(r=>['S2','S3','S4','S5','S6','S7'].includes(r.attendance_status_code)).length, total=allActs.length;
  const points=read_('PointsLedger').filter(x=>x.member_id===m.member_id).reduce((n,x)=>n+Number(x.points_delta||0),0); // Lifetime total across all terms
  const recorded=allActs.filter(a=>byAct[a.activity_id]).length, pct=total?Math.round((onTime/total)*1000)/10:0;
  const className=pct>=80?'A':pct>=60?'B':'C';
  const yes=v=>v==='أيوه';
  return {member:{member_id:m.member_id,member_code:m.member_code||m.member_id,full_name:m.full_name,group_name:groups[m.unit||m.group_id]?groups[m.unit||m.group_id].group_name:'',year:m.year,active:m.active,unit:m.unit||'',troop:m.troop||'',phone_number:m.phone_number||'',national_id:m.national_id||'',mother_phone:m.mother_phone||'',father_phone:m.father_phone||'',notes:m.notes||'',birthday_date:m.birthday_date||'',location:m.location||''},
   total_meetings:total,recorded_meetings:recorded,missing_records:Math.max(0,total-recorded),on_time:onTime,late:late,absences:absences,
   attendance_percent:pct,class_name:className,watch_status:absences>=3?'يحتاج متابعة':'منتظم',total_points:points,
   uniform_compliance:allAtt.filter(r=>r.uniform_status==='التزام بالزي').length,
   mass_yes:allAtt.filter(r=>yes(r.mass_participation)).length,sunday_yes:allAtt.filter(r=>yes(r.sunday_school_participation)).length,
   confession_yes:allAtt.filter(r=>yes(r.confession_participation)).length,status_counts:counts,
   history:history};
 },
 allMemberAnalytics:(p)=>{
  const term=String((p&&p.term)||'All'),members=read_('Members'),activities=read_('Activities'),attendance=read_('Attendance'),ledger=read_('PointsLedger'),groups=gmap_();
  const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
  return members.map(m=>{
   const acts=activities.filter(a=>(a.group_id==='ALL'||a.group_id===m.group_id)&&(String(a.activity_date).slice(0,10)<=today||['finalized','closed'].includes(a.status))&&(term==='All'||termForActivity_(a)===term));
   const ids=new Set(acts.map(a=>a.activity_id)), at=attendance.filter(r=>r.member_id===m.member_id&&ids.has(r.activity_id));
   const onTime=at.filter(r=>r.attendance_status_code==='S1').length,late=0;
   const absences=at.filter(r=>['S2','S3','S4','S5','S6','S7'].includes(r.attendance_status_code)).length;
   const recorded=new Set(at.map(r=>r.activity_id)).size, pct=acts.length?Math.round((onTime/acts.length)*1000)/10:0;
   return {member_id:m.member_id,member_code:m.member_code||m.member_id,full_name:m.full_name,unit:m.unit||'',troop:m.troop||'',birthday_date:m.birthday_date||'',location:m.location||'',group_name:groups[m.unit||m.group_id]?groups[m.unit||m.group_id].group_name:'',
    total_meetings:acts.length,recorded_meetings:recorded,attended:onTime+late,on_time:onTime,late:late,absences:absences,attendance_percent:pct,
    total_points:ledger.filter(x=>x.member_id===m.member_id).reduce((n,x)=>n+Number(x.points_delta||0),0),class_name:pct>=80?'A':pct>=60?'B':'C',watch_status:absences>=3?'يحتاج متابعة':'منتظم',active:m.active};
  }).sort((a,b)=>a.full_name.localeCompare(b.full_name));
 },
 listPointsLedger:()=>{const ms={};read_('Members').forEach(m=>ms[m.member_id]=m.full_name);const acts={};read_('Activities').forEach(a=>acts[a.activity_id]=a.activity_name+' · '+a.activity_date);return read_('PointsLedger').map(r=>Object.assign({},r,{member_name:ms[r.member_id]||r.member_name||'Unknown girl',activity_name:acts[r.activity_id]||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));},
 saveActivity:(p,u)=>locked_(()=>{ensureHeaders_('Activities');const term=String(p.term||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.activity_date||''))throw err('INVALID','Choose a valid meeting date (YYYY-MM-DD)');
  if(!/^(Spring|Fall|Summer) \d{4}$/.test(term))throw err('INVALID','Choose a season and year, such as Spring 2026');
  if(p.group_id!=='ALL'&&!['Orion','Polaris'].includes(String(p.group_id)))throw err('INVALID','Choose Orion or Polaris');
  const unit=p.group_id==='ALL'?'ALL':String(p.group_id||'');if(unit!=='ALL'&&!['Orion','Polaris'].includes(unit))throw err('INVALID','Choose Orion or Polaris');const o={activity_id:id_('ACT'),activity_name:'',activity_type:'Weekly meeting',activity_date:p.activity_date,group_id:unit,term:term,status:'open',created_at:now_(),created_by:u.email};o.activity_name=meetingName_(o);add_('Activities',o);return o;}),
 eligible:(p)=>{const a=act_(p.activity_id),g=gmap_(),at={};read_('Attendance').filter(r=>r.activity_id===a.activity_id).forEach(r=>at[r.member_id]=r);
  return read_('Members').filter(m=>elig_(a,m,g)).map(m=>({member_id:m.member_id,member_code:m.member_code||m.member_id,full_name:m.full_name,unit:m.unit||'',troop:m.troop||'',group_name:m.unit||m.group_id,att:at[m.member_id]||null}));},
 byToken:(p,u)=>{const t=String(p.token||'').trim(),m=t&&read_('Members').find(x=>x.qr_token===t);if(!m)throw err('INVALID_TOKEN','Unknown QR code');
  const a=act_(p.activity_id),g=gmap_();if(!isOn(m.active))throw err('MEMBER_INACTIVE','Member is inactive');
  if(!elig_(a,m,g))throw err('NOT_ELIGIBLE','Member not eligible for this activity');
  if(a.status!=='open')throw err('ACTIVITY_CLOSED','Activity is '+a.status);
  return {member:{member_id:m.member_id,member_code:m.member_code||m.member_id,full_name:m.full_name,unit:m.unit||'',troop:m.troop||'',group_name:m.unit||m.group_id},
   existing:read_('Attendance').find(r=>r.member_id===m.member_id&&r.activity_id===a.activity_id)||null};}, // read-only: nothing is saved
 submit:(p,u)=>locked_(()=>{
  const a=act_(p.activity_id),m=mem_(p.member_id);
  if(!isOn(m.active))throw err('MEMBER_INACTIVE','Member is inactive');
  if(!elig_(a,m,gmap_()))throw err('NOT_ELIGIBLE','Member not eligible for this activity');
  const st=ATT.find(x=>x[0]===p.attendance_status_code);if(!st)throw err('INVALID','Attendance status required');
  if(UNI.indexOf(p.uniform_status)<0)throw err('INVALID','Uniform status required');
  const part=k=>{const v=(p[k]===undefined||p[k]==='')?NA:p[k];if(YN.indexOf(v)<0)throw err('INVALID','Bad value: '+k);return v;};
  const recordedAt=p.scanned_at?new Date(p.scanned_at):new Date();if(isNaN(recordedAt.getTime()))throw err('INVALID','Bad scan timestamp');
  const mass=part('mass_participation'),sun=part('sunday_school_participation'),conf=part('confession_participation');
  const ex=read_('Attendance').find(r=>r.member_id===m.member_id&&r.activity_id===a.activity_id),corr=!!p.correction;
  if(!corr&&a.status!=='open')throw err('ACTIVITY_CLOSED','Activity is '+a.status);
  if(!corr&&ex)throw err('DUPLICATE','Attendance already recorded for this member and activity');
  if(corr&&!ex)throw err('NOT_FOUND','No record to correct');
  if(corr&&String(p.expected_updated_at)!==String(ex.updated_at))throw err('CONFLICT','Record changed by someone else – reload and retry');
  const target=target_(st[0]); // throws before any write if rule unconfigured
  const o=ex||{attendance_id:id_('A'),member_id:m.member_id,member_name:m.full_name,activity_id:a.activity_id,recorded_at:recordedAt.toISOString().slice(0,19)+'Z',recorded_by:u.email};
  o.member_name=m.full_name;
  Object.assign(o,{attendance_status_code:st[0],attendance_status_label:st[1],uniform_status:p.uniform_status,mass_participation:mass,sunday_school_participation:sun,confession_participation:conf,notes:String(p.notes||'').slice(0,500),updated_at:now_(),updated_by:u.email,member_name:m.full_name});
  ex?put_('Attendance',ex._row,o):add_('Attendance',o);
  reconcile_(m.member_id,a.activity_id,target,st[0],u);
  return {attendance_id:o.attendance_id};}),
 finalize:(p,u)=>locked_(()=>{const a=act_(p.activity_id);if(['finalized','closed'].indexOf(p.status)<0)throw err('INVALID','Bad status');
  const have=new Set(read_('Attendance').filter(r=>r.activity_id===a.activity_id).map(r=>r.member_id)),g=gmap_();
  const miss=read_('Members').filter(m=>elig_(a,m,g)&&!have.has(m.member_id)).length;
  if(miss&&!p.force)throw err('MISSING_ATTENDANCE',miss+' eligible member(s) have no attendance record.');
  a.status=p.status;put_('Activities',a._row,a);return a;}),

};
