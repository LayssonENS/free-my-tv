"""Crops each logo's viewBox to what it draws (measured by headless Chrome) and gives it a width and height.
python3 -I crop_logos.py <dir>"""
import json, os, re, subprocess, sys, tempfile

d = sys.argv[1]
names = sorted(f for f in os.listdir(d) if f.endswith('.svg'))
page = '<html><body>' + ''.join('<div data-n="%s">%s</div>' % (n, open(os.path.join(d, n), encoding='utf-8').read()) for n in names)
page += '''<script>var r = {}; [].forEach.call(document.querySelectorAll('div[data-n]'), function (div) {
  var b = div.querySelector('svg').getBBox(); r[div.getAttribute('data-n')] = [b.x, b.y, b.width, b.height]; });
document.body.innerHTML = '<pre id=out>' + JSON.stringify(r) + '</pre>';</script></body></html>'''
tmp = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8')
tmp.write(page); tmp.close()
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
dom = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--user-data-dir=' + tempfile.mkdtemp(),
                      '--dump-dom', 'file://' + tmp.name], capture_output=True, text=True).stdout
os.unlink(tmp.name)
boxes = json.loads(re.search(r'<pre id="?out"?>(.*?)</pre>', dom, re.S).group(1).replace('&quot;', '"'))
for n in names:
    x, y, w, h = boxes[n]
    pad = max(w, h) * 0.01
    x, y, w, h = x - pad, y - pad, w + 2 * pad, h + 2 * pad
    path = os.path.join(d, n)
    svg = open(path, encoding='utf-8').read()
    head = re.match(r'<svg[^>]*>', svg).group(0)
    new = re.sub(r'\s(viewBox|width|height)="[^"]*"', '', head)
    # old WebKit sizes an <img> SVG by its width and height: 500 wide, or 500 tall for a tall one
    scale = 500 / max(w, h)
    new = new[:-1] + ' viewBox="%.3f %.3f %.3f %.3f" width="%d" height="%d">' % (x, y, w, h, round(w * scale), round(h * scale))
    open(path, 'w', encoding='utf-8').write(svg.replace(head, new, 1))
    print('%-16s viewBox %.1f %.1f %.1f %.1f  -> %dx%d' % (n, x, y, w, h, round(w * scale), round(h * scale)))
