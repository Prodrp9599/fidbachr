#!/usr/bin/env python3
"""Fidbachr browser smoke test. Requires Chromium, ffmpeg, Python websocket-client."""
import json, os, subprocess, tempfile, time, urllib.request, websocket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TMP=Path(tempfile.mkdtemp(prefix='fidbachr-smoke-'))
VIDEO=TMP/'vertical.mp4'; CDP=9333
subprocess.run(['ffmpeg','-y','-f','lavfi','-i','testsrc2=size=360x640:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(VIDEO)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css" />','<style>'+(ROOT/'styles.css').read_text()+'</style>').replace('<script src="app.js"></script>','<script>'+(ROOT/'app.js').read_text().replace('</script>','<\\/script>')+'</script>')
chrome=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required',f'--remote-debugging-port={CDP}','--remote-allow-origins=*',f'--user-data-dir={TMP}/chrome','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ws=None
try:
  for _ in range(80):
    try:
      tabs=json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json',timeout=1).read());
      if tabs: break
    except: time.sleep(.1)
  ws=websocket.create_connection(tabs[0]['webSocketDebuggerUrl'],timeout=5); cid=0
  def call(method,params=None):
    nonlocal_box=None
    global cid
    cid+=1; ws.send(json.dumps({'id':cid,'method':method,'params':params or {}}))
    while True:
      m=json.loads(ws.recv())
      if m.get('id')==cid:
        if 'error' in m: raise RuntimeError(m['error'])
        return m.get('result',{})
  def ev(expr,awaitPromise=False):
    r=call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':awaitPromise})
    if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
    return r.get('result',{}).get('value')
  call('Runtime.enable'); call('Page.enable'); call('DOM.enable')
  frame=call('Page.getFrameTree')['frameTree']['frame']['id']; call('Page.setDocumentContent',{'frameId':frame,'html':html}); time.sleep(.4)
  assert ev("document.querySelector('#uploadBtn')!==null")
  obj=call('Runtime.evaluate',{'expression':"document.querySelector('#videoPicker')"})['result']['objectId']; call('DOM.setFileInputFiles',{'files':[str(VIDEO)],'objectId':obj}); time.sleep(.5)
  for _ in range(50):
    if ev("document.querySelector('#video')?.readyState>=1"): break
    time.sleep(.1)
  assert ev("document.querySelector('#video').videoHeight===640")
  r=ev("(()=>{const r=document.querySelector('#layer').getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height}})()")
  x1,y1=r['x']+r['w']*.2,r['y']+r['h']*.25; x2,y2=r['x']+r['w']*.75,r['y']+r['h']*.6
  call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17,'modifiers':2}); time.sleep(.03)
  assert ev("getComputedStyle(document.querySelector('#layer')).cursor")=='crosshair'
  ev("(()=>{const v=document.querySelector('#video');v.currentTime=1;return v.play().then(()=>true)})()",True)
  call('Input.dispatchMouseEvent',{'type':'mousePressed','x':x1,'y':y1,'button':'left','buttons':1,'clickCount':1,'modifiers':2}); call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':x2,'y':y2,'button':'left','buttons':1,'modifiers':2}); ev("document.querySelector('#video').currentTime=4.4"); call('Input.dispatchMouseEvent',{'type':'mouseReleased','x':x2,'y':y2,'button':'left','clickCount':1,'modifiers':2}); time.sleep(.05)
  d=ev('window.__fidbachrTest.draft()'); assert d['mark']['type']=='area' and d['end']-d['start']>3
  ev("document.querySelector('#draftText').value='Smoke test range';document.querySelector('[data-save]').click()"); time.sleep(.05)
  f=ev('window.__fidbachrTest.snapshot().feedback[0]'); assert f['mark']['type']=='area' and f['end']-f['start']>3
  call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17}); assert ev('window.__fidbachrTest.ctrl()') is False
  ev("document.querySelector('#video').pause()"); call('Input.dispatchKeyEvent',{'type':'keyDown','key':' ','code':'Space','windowsVirtualKeyCode':32}); time.sleep(.06); assert ev("document.querySelector('#video').paused") is False
  call('Input.dispatchKeyEvent',{'type':'keyDown','key':' ','code':'Space','windowsVirtualKeyCode':32}); time.sleep(.04); assert ev("document.querySelector('#video').paused") is True
  assert ev("document.querySelectorAll('.gutter').length")>=2
  for _ in range(200):
    call('Input.dispatchKeyEvent',{'type':'keyDown','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17,'modifiers':2}); call('Input.dispatchKeyEvent',{'type':'keyUp','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17})
  assert ev("document.querySelectorAll('#layer').length") == 1
  print(json.dumps({'PASS':True,'video':'9:16 360x640 30fps','range_seconds':round(f['end']-f['start'],2),'ctrl_cursor':'crosshair','space':True,'stress_ctrl_cycles':200},indent=2))
finally:
  try:
    if ws: ws.close()
  except: pass
  chrome.terminate()
