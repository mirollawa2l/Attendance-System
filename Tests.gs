// Run runTests() in the editor on a COPY of the spreadsheet (it writes fictional rows). Results: View > Logs.
function runTests(){
 const u={email:'tester@example.com',role:'admin'},R=[],ok=(n,c)=>R.push((c?'PASS ':'FAIL ')+n);
 const fails=(c,f)=>{try{f();return false;}catch(e){return e.code===c;}};
 setup();
 ok('all tabs',Object.keys(H).every(n=>ss_().getSheetByName(n)));
 ok('7 distinct statuses',ATT.length===7&&new Set(ATT.map(x=>x[1])).size===7&&UNI.length===3&&YN.length===3);
 const g=API.saveGroup({group_name:'TEST Troop A',active:true},u);
 const m=API.saveMember({full_name:'Test Child A',group_id:g.group_id,active:true},u);
 const m2=API.saveMember({full_name:'Test Child B',group_id:g.group_id,active:false},u);
 ok('tokens unique',m.qr_token!==m2.qr_token);
 const m1b=API.saveMember({member_id:m.member_id,full_name:'Test Child A2',group_id:g.group_id,active:true},u);
 ok('token stable on edit',m1b.qr_token===m.qr_token);
 const a=API.saveActivity({activity_name:'TEST meeting',activity_type:'weekly meeting',activity_date:'2026-10-16',group_id:g.group_id},u);
 const sub=o=>API.submit(Object.assign({member_id:m.member_id,activity_id:a.activity_id,attendance_status_code:'S1',uniform_status:UNI[0]},o||{}),u);
 const rec=()=>read_('Attendance').filter(r=>r.member_id===m.member_id&&r.activity_id===a.activity_id);
 API.byToken({token:m.qr_token,activity_id:a.activity_id},u);
 ok('scan alone saves nothing',rec().length===0);
 ok('invalid token',fails('INVALID_TOKEN',()=>API.byToken({token:'bad',activity_id:a.activity_id},u)));
 ok('unconfigured rule blocks',fails('RULE_UNCONFIGURED',sub)&&rec().length===0);
 API.saveRules({rules:{S1:'5',S7:'-2'},allow:false},u);
 sub();
 ok('saved, participation default not لأ',rec().length===1&&rec()[0].mass_participation===NA&&rec()[0].confession_participation===NA);
 ok('auto points applied',totals_()[m.member_id]===5);
 ok('duplicate rejected',fails('DUPLICATE',sub)&&rec().length===1);
 const ex=rec()[0];
 ok('stale correction conflicts',fails('CONFLICT',()=>sub({attendance_status_code:'S7',correction:true,expected_updated_at:'old'})));
 sub({attendance_status_code:'S7',correction:true,expected_updated_at:ex.updated_at});
 const tx=read_('PointsLedger').filter(t=>t.member_id===m.member_id);
 ok('correction reconciles, history kept',rec().length===1&&tx.length===2&&totals_()[m.member_id]===-2&&tx[1].related_transaction_id===tx[0].transaction_id);
 ok('manual needs reason',fails('INVALID',()=>API.manualPoints({member_id:m.member_id,points:3,reason:' '},u)));
 API.manualPoints({member_id:m.member_id,points:3,reason:'test'},u);
 ok('manual total',API.ledger({member_id:m.member_id}).total===1);
 ok('inactive rejected',fails('MEMBER_INACTIVE',()=>API.submit({member_id:m2.member_id,activity_id:a.activity_id,attendance_status_code:'S1',uniform_status:UNI[0]},u)));
 API.addAchievement({member_id:m.member_id,title:'TEST badge',earned_at:'2026-10-16'},u);
 ok('achievement',API.listAchievements({member_id:m.member_id}).length===1);
 API.finalize({activity_id:a.activity_id,status:'closed',force:true},u);
 ok('closed rejects new',fails('ACTIVITY_CLOSED',()=>sub()));
 Logger.log(R.join('\n'));return R;}
