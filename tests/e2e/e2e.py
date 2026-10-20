import json, subprocess, time, urllib.request, sys, os, tempfile
from playwright.sync_api import sync_playwright
CHROME=os.environ.get('CHROME_PATH','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
PAGE='http://localhost:8081/'; API='http://127.0.0.1:8082/macros/s/MOCK/exec'
CFG='window.SCOUTS_CONFIG={API_URL:"%s",REQUEST_TIMEOUT_MS:8000};'%API
def ctl(p): return json.loads(urllib.request.urlopen('http://127.0.0.1:8082/__ctl/'+p).read())
def sheet(n): return ctl('sheets')[n]
results=[]
def check(name,cond,detail=''):
    results.append((name,bool(cond),detail)); print(('PASS ' if cond else 'FAIL ')+name+((' :: '+str(detail)) if detail and not cond else ''),flush=True)
SRV=subprocess.Popen(['node','mock-apps-script.js'],cwd=os.path.dirname(os.path.abspath(__file__)),stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
for _ in range(50):
    try: ctl('stats'); break
    except Exception: time.sleep(0.2)
seed=ctl('reset'); CODE=seed['code']; M1=seed['m1']; ACT=seed['act']
subprocess.run('node qr-matrix.js "%s" | python3 make_y4m.py /tmp/qr.y4m'%M1['qr_token'],shell=True,check=True,cwd=os.path.dirname(os.path.abspath(__file__)),stdout=subprocess.DEVNULL)

def new_page(ctx,errors):
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errors.append('pageerror: '+str(e))); pg.on('console',lambda m:errors.append('console.error: '+m.text) if m.type=='error' and 'favicon' not in m.text else None)
    return pg
def login(pg,code=CODE):
    pg.fill('#gate-code',code); pg.click('#gate-go'); 
def note(pg): return pg.inner_text('#msg')

with sync_playwright() as p:
    # ---------------- Suite 1: fake camera granted ----------------
    b=p.chromium.launch(executable_path=CHROME,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture=/tmp/qr.y4m'])
    ctx=b.new_context(viewport={'width':390,'height':844},permissions=['camera']); errors=[]; pg=new_page(ctx,errors)
    pg.goto(PAGE); pg.wait_for_selector('#gate',state='visible')
    check('secure context on page origin',pg.evaluate('isSecureContext'))
    check('gate shown first and no API request made before code entry',ctl('stats')['posts']==0)
    login(pg,'wrong'); pg.wait_for_function("document.querySelector('#gate-msg').textContent.length>0")
    check('wrong access code rejected with message',('incorrect' in pg.inner_text('#gate-msg')),pg.inner_text('#gate-msg'))
    check('wrong code not kept in storage',pg.evaluate("localStorage.getItem('scouts-qr-access-code')")is None)
    login(pg,CODE); pg.wait_for_selector('#nav button'); 
    check('correct code opens the app (cross-origin POST->302->echo works)',pg.locator('#nav button').count()==6)
    st=ctl('stats'); check('no CORS preflight (OPTIONS) was ever sent',st['options']==0,st)
    check('requests were text/plain simple requests',all(c.startswith('text/plain') for c in st['contentTypes']),st['contentTypes'][:3])
    # every view loads
    for key,label in [('review','Attendance'),('meetings','Meetings'),('records','Attendance Log'),('analytics','Analytics'),('members','Members'),('acts','Weekly Meetings')]:
        pg.click('[data-g=%s]'%key); pg.wait_for_timeout(900)
        bad=pg.evaluate("document.querySelector('#msg').className==='bad'"); check('view loads without error: '+label,not bad,note(pg))
    pg.click('[data-g=analytics]'); pg.wait_for_selector('#all-analytics table'); 
    check('Analytics lists members (regression: #analytics-form bug)',pg.locator('#all-analytics tbody tr').count()==2)
    pg.select_option('#analytics-season','Spring'); pg.select_option('#analytics-year','2026'); pg.wait_for_timeout(800)
    check('Analytics season+year filter works',pg.locator('#all-analytics tbody tr').count()==2 and 'bad'!=pg.evaluate("document.querySelector('#msg').className"))
    pg.select_option('#girl-pick',M1['member_id']); pg.wait_for_selector('#girl-report .metrics'); check('Per-member analytics renders',pg.locator('#girl-report .metric').count()>=10)
    # create meeting via UI
    pg.click('[data-g=acts]'); pg.wait_for_selector('#ad'); pg.fill('#ad','2026-03-20'); pg.select_option('#ag','Orion'); pg.select_option('#at','Spring'); pg.fill('#ay','2026'); pg.click('#as'); pg.wait_for_timeout(1200)
    check('create meeting via UI writes a row',len(sheet('Activities'))==3 and sheet('Activities')[2][1]=='Orion Spring 20-03-2026',sheet('Activities')[-1][:6])
    # create member via UI
    pg.click('[data-g=members]'); pg.wait_for_selector('#mn'); pg.fill('#mn','سارة اليوسف'); pg.select_option('#mu','Polaris'); pg.select_option('#mt','صقر'); pg.fill('#mp','01012345678'); pg.click('#ms'); pg.wait_for_timeout(1200)
    check('create member via UI writes a row',len(sheet('Members'))==4)
    # QR card generation + decode with the app's own scanner lib
    pg.fill('#q','منى'); pg.click('[data-q]'); pg.wait_for_selector('.qr-card-preview canvas')
    dec=pg.evaluate("""()=>{const c=document.querySelector('.qr-card-preview canvas'),x=c.getContext('2d');const d=x.getImageData(110,402,780,780);const r=jsQR(d.data,d.width,d.height);return r&&r.data;}""")
    check('QR member card generated and decodes back to the member token',dec==M1['qr_token'],dec)
    check('QR download link present',pg.locator('a.qr-download').get_attribute('download').endswith('.png'))
    # CSV import
    csv='الاسم,الوحدة,الفرقة,السنة الدراسية\nنورا,بولاريس,كوبرا,3\nمنى جرجس,Orion,كروان,2\n,Orion,نمر,1\n'
    f=tempfile.NamedTemporaryFile('w',suffix='.csv',delete=False,encoding='utf-8-sig'); f.write(csv); f.close()
    pg.set_input_files('#imp-file',f.name); pg.wait_for_selector('#imp-go'); pg.click('#imp-go'); pg.wait_for_selector('#import-result')
    txt=pg.inner_text('#import-result'); check('CSV import: Arabic headers, duplicate skipped, bad row reported',' '.join(txt.split()).startswith('Import finished Added 1 · Already existed 1 · Failed 1 (of 3 rows)'),txt.replace('\n',' '))
    check('CSV import wrote exactly 1 new member',len(sheet('Members'))==5,len(sheet('Members')))
    # manual attendance
    base=len(sheet('Attendance')); pg.click('[data-g=review]'); pg.wait_for_selector('#sa'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row')
    pg.fill('#q','منى'); pg.click('#res .row'); pg.wait_for_selector('#f1'); pg.select_option('#f1','S1'); pg.select_option('#f2',index=1); pg.select_option('#f3','أيوه'); pg.select_option('#f4','لأ'); pg.fill('#f6','manual test'); pg.click('#ok'); pg.wait_for_timeout(1200)
    rows=sheet('Attendance'); check('manual attendance saved (1 row, fields correct)',len(rows)==base+1 and rows[-1][3]=='S1' and rows[-1][5]=='التزام بالزي' and rows[-1][6]=='أيوه' and rows[-1][7]=='لأ' and rows[-1][9]=='manual test',rows[-1] if rows else '')
    check('points ledger +10 for S1',[r for r in sheet('PointsLedger')[1:] if r[1]==M1['member_id']][-1][3]==10)
    # camera scan of fake video: scanning alone must NOT write; existing record opens as correction
    pg.click('[data-g=review]'); pg.wait_for_selector('#sa'); pg.select_option('#sa',ACT['activity_id']); 
    pg.wait_for_selector('#f1',timeout=20000); n_before=len(sheet('Attendance'))
    check('camera (fake device) scanned the QR and opened the attendance form',M1['full_name'] in pg.inner_text('#v'),pg.inner_text('#v')[:80])
    check('scan opened existing record as a CORRECTION, nothing written by scanning',('Existing record' in pg.inner_text('#v')) and n_before==base+1)
    pg.click('#cx'); pg.wait_for_timeout(6000)  # camera restarts and still sees the card
    check('continued scanning of the same card created no duplicate rows',len(sheet('Attendance'))==base+1,len(sheet('Attendance')))
    # new meeting scan -> new record exactly once
    a2=sheet('Activities')[2][0]; pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',a2)
    pg.wait_for_selector('#f1',timeout=20000); check('scan on a fresh meeting shows a new (non-correction) form','Existing record' not in pg.inner_text('#v'))
    pg.select_option('#f1','S2'); pg.click('#ok'); pg.wait_for_timeout(1500); n=len(sheet('Attendance'))
    pg.wait_for_timeout(5000); check('saved once, camera restart does not duplicate (server also rejects)',n==base+2 and len(sheet('Attendance'))==n,len(sheet('Attendance')))
    pg.click('#cx') if pg.locator('#cx').count() else None
    # server-side duplicate through API from page
    dup=pg.evaluate("""async(a)=>{try{await ScoutsApi.call('submit',a);return 'saved'}catch(e){return e.code}}""",{'member_id':M1['member_id'],'activity_id':a2,'attendance_status_code':'S1'}); check('API rejects duplicate attendance (DUPLICATE)',dup=='DUPLICATE',dup)
    # offline queue
    pg.close(); pg=ctx.new_page(); pg.on('pageerror',lambda x:errors.append('pageerror: '+str(x)))
    pg.add_init_script("navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('no camera in this test','NotFoundError'))")  # manual-flow tests must not race with the fake camera
    pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row')
    # delete existing attendance for M2-like test: use Mariam? she is Polaris so not eligible; use new Orion member from CSV? none. register new Orion member via API
    om=pg.evaluate("""async()=>ScoutsApi.call('saveMember',{full_name:'عميل أوفلاين',unit:'Orion',troop:'نمر',active:true})"""); 
    pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row'); pg.fill('#q','أوفلاين'); pg.click('#res .row'); pg.wait_for_selector('#f1'); pg.select_option('#f1','S1')
    ctl('mode?m=offline'); b0=len(sheet('Attendance')); pg.click('#ok'); pg.wait_for_function("document.querySelector('#msg').textContent.includes('Offline')",timeout=15000)
    q=json.loads(pg.evaluate("localStorage.getItem('scouts-qr-offline-attendance')")); check('network failure queues the attendance on the device (nothing lost)',len(q)==1 and len(sheet('Attendance'))==b0)
    ctl('mode?m=normal'); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_function("JSON.parse(localStorage.getItem('scouts-qr-offline-attendance')||'[]').length===0",timeout=20000); pg.wait_for_timeout(800)
    check('queue syncs on reconnect, exactly one row added',len(sheet('Attendance'))==b0+1 and json.loads(pg.evaluate("localStorage.getItem('scouts-qr-offline-attendance')"))==[],len(sheet('Attendance')))
    # lost reply
    pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row'); 
    om2=pg.evaluate("""async()=>ScoutsApi.call('saveMember',{full_name:'ضياع الرد',unit:'Orion',troop:'فيل',active:true})"""); pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row'); pg.fill('#q','ضياع'); pg.click('#res .row'); pg.wait_for_selector('#f1'); pg.select_option('#f1','S1')
    ctl('mode?m=dropreply'); b1=len(sheet('Attendance')); pg.click('#ok'); pg.wait_for_function("document.querySelector('#msg').textContent.includes('Offline')",timeout=15000)
    check('lost reply: server applied the write, client queued it',len(sheet('Attendance'))==b1+1)
    ctl('mode?m=normal'); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_function("JSON.parse(localStorage.getItem('scouts-qr-offline-attendance')||'[]').length===0",timeout=20000); pg.wait_for_timeout(800)
    check('lost reply: retry gets DUPLICATE, queue drains, still exactly one row',len(sheet('Attendance'))==b1+1 and json.loads(pg.evaluate("localStorage.getItem('scouts-qr-offline-attendance')"))==[],pg.evaluate("localStorage.getItem('scouts-qr-offline-attendance')"))
    # lock
    pg.click('#lock-btn'); pg.wait_for_selector('#gate',state='visible'); check('Lock button clears the saved code and shows the gate',pg.evaluate("localStorage.getItem('scouts-qr-access-code')")is None)
    # code changed server-side -> re-prompt
    login(pg,CODE); pg.wait_for_selector('#nav button'); pg.evaluate("ScoutsApi.setKey('stale')"); pg.click('[data-g=records]'); pg.wait_for_selector('#gate',state='visible',timeout=8000); check('server rejecting a stored code re-opens the gate',True)
    pg.screenshot(path='/tmp/gate_mobile.png'); login(pg,CODE); pg.wait_for_selector('#nav button'); pg.click('[data-g=analytics]'); pg.wait_for_timeout(1500); pg.screenshot(path='/tmp/analytics_mobile.png',full_page=False)
    fatal=[e for e in errors if 'Failed to load resource' not in e]; check('no JavaScript errors in the console during suite 1',not fatal,fatal[:3])
    # backend unreachable on cold start
    ctx.close(); b.close()

    # ---------------- Suite 2: camera permission denied ----------------
    b=p.chromium.launch(executable_path=CHROME); ctx=b.new_context(viewport={'width':390,'height':844}); errors=[]; pg=new_page(ctx,errors)
    pg.goto(PAGE); pg.evaluate("localStorage.setItem('scouts-qr-access-code','%s')"%CODE); pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row',timeout=10000); pg.wait_for_timeout(1500)
    m=note(pg); check('camera denied/dismissed: clear message + retry button',('Camera' in m or 'camera' in m) and pg.locator('#retry-camera').is_visible(),m)
    pg.fill('#q','منى'); pg.click('#res .row'); pg.wait_for_selector('#f1'); check('camera denied: manual attendance still available',True)
    ctx.close(); b.close()
    # ---------------- Suite 3: no camera device ----------------
    b=p.chromium.launch(executable_path=CHROME,args=['--use-fake-ui-for-media-stream']); ctx=b.new_context(permissions=['camera']); errors=[]; pg=new_page(ctx,errors)
    pg.goto(PAGE); pg.evaluate("localStorage.setItem('scouts-qr-access-code','%s')"%CODE); pg.goto(PAGE); pg.wait_for_selector('#nav button'); pg.select_option('#sa',ACT['activity_id']); pg.wait_for_selector('#res .row',timeout=10000); pg.wait_for_timeout(1500)
    m=note(pg); check('no camera device: understandable message',('No accessible camera' in m) or ('could not start' in m.lower()) or ('not granted' in m),m)
    check('no camera device: manual search still lists members',pg.locator('#res .row').count()>=1)
    ctx.close()
    # ---------------- Suite 4: backend errors / misconfiguration ----------------
    ctl('api?u=http%3A%2F%2F127.0.0.1%3A9%2Fnothing'); ctx=b.new_context(); errors=[]; pg=ctx.new_page()
    pg.goto(PAGE); pg.evaluate("localStorage.setItem('scouts-qr-access-code','x')"); pg.goto(PAGE); pg.wait_for_function("document.querySelector('#v').textContent.length>12 && !document.querySelector('#v').textContent.startsWith('Loading')",timeout=8000)
    check('unreachable backend: readable network error, no crash',('Network failure' in pg.inner_text('#v')),pg.inner_text('#v')); ctl('api?u=http%3A%2F%2F127.0.0.1%3A8082%2Fmacros%2Fs%2FMOCK%2Fexec')
    r=pg.evaluate("""async()=>{const orig=window.fetch;window.fetch=async()=>new Response('<html>Sign in</html>',{status:200});try{await ScoutsApi.call('init')}catch(e){return e.code+'|'+e.message}finally{window.fetch=orig}}""")
    check('HTML (login/error page) instead of JSON gives a clear BAD_RESPONSE message',r.startswith('BAD_RESPONSE') and 'Execute as' in r,r)
    ctx.close()
    # ---------------- Suite 5: informational — redirect without CORS headers ----------------
    ctl('variant?v=B'); ctx=b.new_context(); pg=ctx.new_page(); pg.goto(PAGE)
    rB=pg.evaluate("""async()=>{try{await ScoutsApi.call('init');return 'worked'}catch(e){return e.code}}""")
    ctl('variant?v=A'); rA=pg.evaluate("""async()=>{try{await ScoutsApi.call('init');return 'worked'}catch(e){return e.code}}""")
    print('INFO redirect(302) WITHOUT ACAO header -> client result:',rB,'| WITH ACAO header ->',rA)
    # application/json would preflight
    pj=pg.evaluate("""async(u)=>{try{await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return 'worked'}catch(e){return 'blocked: '+e.message}}""",API)
    print('INFO application/json POST against Apps Script-like endpoint ->',pj,'| preflights seen:',ctl('stats')['options'])
    ctx.close(); b.close()
    # ---------------- Suite 6: diagnostic page ----------------
    b=p.chromium.launch(executable_path=CHROME); ctx=b.new_context(); pg=ctx.new_page()
    def diag(code=None):
        pg.goto(PAGE+'test-connection.html'); pg.wait_for_function("!document.querySelector('#t2 span').textContent.includes('running')",timeout=10000)
        if code is not None: pg.fill('#code',code); pg.click('#go'); pg.wait_for_function("!document.querySelector('#r3').textContent.includes('running')",timeout=10000)
        return [pg.inner_text('#t1 span'),pg.inner_text('#t2 span'),pg.inner_text('#r3')]
    d=diag(CODE); check('diagnostic page: healthy backend -> checks 1, 2 and 3 PASS',all(x.startswith('PASS') for x in d),d)
    d=diag('nope'); check('diagnostic page: wrong code -> check 3 FAIL, 1-2 PASS',d[0].startswith('PASS') and d[1].startswith('PASS') and d[2].startswith('FAIL'),d)
    ctl('mode?m=html'); d=diag(); check('diagnostic page: old/HTML backend -> clear FAIL with redeploy hint',d[0].startswith('FAIL') and d[1].startswith('FAIL') and 'Execute as' in d[1],d); ctl('mode?m=normal')
    ctl('variant?v=B'); d=diag(); check('diagnostic page: redirect without CORS -> FAIL (not a false pass)',d[1].startswith('FAIL'),d); ctl('variant?v=A')
    ctl('api?u=http%3A%2F%2F127.0.0.1%3A9%2Fx'); d=diag(); check('diagnostic page: unreachable URL -> FAIL',d[0].startswith('FAIL') and d[1].startswith('FAIL'),d)
    ctx.close(); b.close()
SRV.terminate()
f=[r for r in results if not r[1]]; print('\nSUMMARY: %d passed, %d failed'%(len(results)-len(f),len(f)))
json.dump(results,open('/tmp/e2e_results.json','w'),ensure_ascii=False); sys.exit(1 if f else 0)
