#!/usr/bin/env python3
"""Fidbachr browser smoke test.

Default: generate a synthetic vertical MP4.
Real fixture: python tests/browser_smoke.py --video /path/to/reel.mp4

Requires Chromium, ffmpeg/ffprobe, and Python websocket-client.
The fixture is read locally and is never copied into the repository.
"""
import argparse, json, subprocess, tempfile, time, urllib.request, websocket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix='fidbachr-smoke-'))

parser = argparse.ArgumentParser()
parser.add_argument('--video', type=Path, help='Optional real video fixture outside the repo')
parser.add_argument('--port', type=int, default=9333)
args = parser.parse_args()
CDP = args.port

if args.video:
    VIDEO = args.video.expanduser().resolve()
    if not VIDEO.exists():
        raise SystemExit(f'Video not found: {VIDEO}')
else:
    VIDEO = TMP / 'vertical.mp4'
    subprocess.run([
        'ffmpeg','-y','-f','lavfi','-i','testsrc2=size=360x640:rate=30',
        '-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','8',
        '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(VIDEO)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

probe = json.loads(subprocess.check_output([
    'ffprobe','-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height,avg_frame_rate',
    '-show_entries','format=duration,size','-of','json',str(VIDEO)
]))
vs = probe['streams'][0]
fmt = probe['format']
expected_w = int(vs['width'])
expected_h = int(vs['height'])
expected_duration = float(fmt['duration'])

html = (ROOT/'index.html').read_text().replace(
    '<link rel="stylesheet" href="styles.css" />',
    '<style>' + (ROOT/'styles.css').read_text() + '</style>'
).replace(
    '<script src="app.js"></script>',
    '<script>' + (ROOT/'app.js').read_text().replace('</script>','<\\/script>') + '</script>'
)

chrome = subprocess.Popen([
    '/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu',
    '--autoplay-policy=no-user-gesture-required','--window-size=1280,900',
    f'--remote-debugging-port={CDP}','--remote-allow-origins=*',
    f'--user-data-dir={TMP}/chrome','about:blank'
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ws = None

try:
    tabs = None
    for _ in range(100):
        try:
            tabs = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP}/json', timeout=1).read())
            if tabs: break
        except Exception:
            time.sleep(.1)
    if not tabs:
        raise RuntimeError('Chromium CDP unavailable')

    ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], timeout=5)
    cid = 0

    def call(method, params=None):
        nonlocal_box = None
        global cid
        cid += 1
        ws.send(json.dumps({'id':cid,'method':method,'params':params or {}}))
        while True:
            message = json.loads(ws.recv())
            if message.get('id') == cid:
                if 'error' in message:
                    raise RuntimeError(message['error'])
                return message.get('result', {})

    def ev(expr, await_promise=False):
        result = call('Runtime.evaluate', {
            'expression': expr,
            'returnByValue': True,
            'awaitPromise': await_promise,
        })
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')

    call('Runtime.enable'); call('Page.enable'); call('DOM.enable')
    frame = call('Page.getFrameTree')['frameTree']['frame']['id']
    call('Page.setDocumentContent', {'frameId':frame,'html':html})
    time.sleep(.25)

    picker = call('Runtime.evaluate', {'expression':"document.querySelector('#videoPicker')"})['result']['objectId']
    load_started = time.time()
    call('DOM.setFileInputFiles', {'files':[str(VIDEO)],'objectId':picker})
    for _ in range(200):
        if ev("document.querySelector('#video')?.readyState>=1"):
            break
        time.sleep(.05)
    metadata_load_seconds = time.time() - load_started

    meta = ev("(()=>{const v=document.querySelector('#video');return{w:v.videoWidth,h:v.videoHeight,d:v.duration,ready:v.readyState}})()")
    assert meta['w'] == expected_w and meta['h'] == expected_h, meta
    assert abs(meta['d'] - expected_duration) < .25, (meta['d'], expected_duration)

    rect = ev("(()=>{const r=document.querySelector('#layer').getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height}})()")
    assert rect['w'] > 100 and rect['h'] > 100, rect
    x1, y1 = rect['x'] + rect['w']*.18, rect['y'] + rect['h']*.20
    x2, y2 = rect['x'] + rect['w']*.62, rect['y'] + rect['h']*.50

    # Ctrl review mode + visual cursor.
    call('Input.dispatchKeyEvent', {'type':'keyDown','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17,'modifiers':2})
    time.sleep(.02)
    assert ev('window.__fidbachrTest.ctrl()') is True
    assert ev("getComputedStyle(document.querySelector('#layer')).cursor") == 'crosshair'

    # Area draft and Esc cancellation.
    call('Input.dispatchMouseEvent', {'type':'mousePressed','x':x1,'y':y1,'button':'left','buttons':1,'clickCount':1,'modifiers':2})
    call('Input.dispatchMouseEvent', {'type':'mouseMoved','x':x2,'y':y2,'button':'left','buttons':1,'modifiers':2})
    call('Input.dispatchMouseEvent', {'type':'mouseReleased','x':x2,'y':y2,'button':'left','clickCount':1,'modifiers':2})
    time.sleep(.03)
    draft = ev('window.__fidbachrTest.draft()')
    assert draft and draft['mark']['type'] == 'area', draft
    call('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
    time.sleep(.02)
    assert ev('window.__fidbachrTest.draft()') is None

    # Multi-second range selection and save without resetting playback.
    start = 1.0
    end = min(start + 3.4, expected_duration - .2)
    ev(f"(()=>{{const v=document.querySelector('#video');v.currentTime={start};return v.play().then(()=>true)}})()", True)
    call('Input.dispatchMouseEvent', {'type':'mousePressed','x':x1,'y':y1,'button':'left','buttons':1,'clickCount':1,'modifiers':2})
    call('Input.dispatchMouseEvent', {'type':'mouseMoved','x':x2,'y':y2,'button':'left','buttons':1,'modifiers':2})
    ev(f"document.querySelector('#video').currentTime={end}")
    call('Input.dispatchMouseEvent', {'type':'mouseReleased','x':x2,'y':y2,'button':'left','clickCount':1,'modifiers':2})
    time.sleep(.03)
    draft = ev('window.__fidbachrTest.draft()')
    assert draft and draft['end'] - draft['start'] > 3, draft
    before = ev("document.querySelector('#video').currentTime")
    ev("document.querySelector('#draftText').value='Smoke test range';document.querySelector('[data-save]').click()")
    time.sleep(.03)
    after = ev("document.querySelector('#video').currentTime")
    item = ev('window.__fidbachrTest.snapshot().feedback[0]')
    assert item['mark']['type'] == 'area' and item['end'] - item['start'] > 3
    assert abs(after - before) < .25, (before, after)

    call('Input.dispatchKeyEvent', {'type':'keyUp','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17})
    time.sleep(.02)
    assert ev('window.__fidbachrTest.ctrl()') is False

    # Normal mouse must not create feedback.
    count = len(ev('window.__fidbachrTest.snapshot().feedback'))
    xn, yn = rect['x'] + rect['w']*.88, rect['y'] + rect['h']*.82
    call('Input.dispatchMouseEvent', {'type':'mousePressed','x':xn,'y':yn,'button':'left','buttons':1,'clickCount':1})
    call('Input.dispatchMouseEvent', {'type':'mouseReleased','x':xn,'y':yn,'button':'left','clickCount':1})
    time.sleep(.03)
    assert len(ev('window.__fidbachrTest.snapshot().feedback')) == count

    # Space play/pause.
    ev("document.querySelector('#video').pause()")
    call('Input.dispatchKeyEvent', {'type':'keyDown','key':' ','code':'Space','windowsVirtualKeyCode':32})
    time.sleep(.07)
    assert ev("document.querySelector('#video').paused") is False
    call('Input.dispatchKeyEvent', {'type':'keyDown','key':' ','code':'Space','windowsVirtualKeyCode':32})
    time.sleep(.04)
    assert ev("document.querySelector('#video').paused") is True

    # Stress modifier state to catch event/listener regressions and browser hangs.
    stress_started = time.time()
    for _ in range(200):
        call('Input.dispatchKeyEvent', {'type':'keyDown','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17,'modifiers':2})
        call('Input.dispatchKeyEvent', {'type':'keyUp','key':'Control','code':'ControlLeft','windowsVirtualKeyCode':17})
    stress_seconds = time.time() - stress_started
    assert stress_seconds < 8, stress_seconds
    assert ev("document.querySelectorAll('#layer').length") == 1

    print(json.dumps({
        'PASS': True,
        'file': VIDEO.name,
        'width': meta['w'],
        'height': meta['h'],
        'duration_seconds': round(meta['d'],2),
        'size_mb': round(VIDEO.stat().st_size/1024/1024,1),
        'metadata_load_seconds': round(metadata_load_seconds,2),
        'range_seconds': round(item['end']-item['start'],2),
        'ctrl_cursor': 'crosshair',
        'position_reset_delta': round(abs(after-before),3),
        'escape': True,
        'space': True,
        'stress_ctrl_cycles': 200,
        'stress_seconds': round(stress_seconds,2),
    }, indent=2))
finally:
    try:
        if ws: ws.close()
    except Exception:
        pass
    chrome.terminate()
