"""Cleans downloaded logo SVGs for the tiles: drops metadata and comments, keeps only drawing, recolors.
python3 -I clean_logos.py <raw dir> <out dir>"""
import os, re, sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
DRAW = {'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'defs', 'linearGradient',
        'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'style'}

# out name: (raw file, color for every fill or None to keep, drop the first <rect>?, source note)
LOGOS = {
    'netflix.svg': ('netflix.svg', None, False, 'Wikimedia Commons, Netflix_2015_logo.svg'),
    'youtube.svg': ('youtube.svg', None, False, 'Wikimedia Commons, YouTube_2024_(white_text).svg'),
    'primevideo.svg': ('prime.svg', '#FFFFFF', True, 'Wikimedia Commons, Amazon_Prime_Video_logo_(2024).svg, without its square'),
    'disneyplus.svg': ('disney.svg', '#FFFFFF', False, 'Wikimedia Commons, Disney+_logo.svg, in white'),
    'hbomax.svg': ('hbomax.svg', '#FFFFFF', False, 'Wikimedia Commons, HBO_Max_(2025).svg, in white'),
    'globoplay.svg': ('globoplay.svg', '#FFFFFF', False, 'Wikimedia Commons, Globoplay_logo.svg, in white'),
    'spotify.svg': ('spotify.svg', '#000000', False, 'Wikimedia Commons, Spotify_logo_with_text.svg, in black as on green'),
    'appletv.svg': ('si-appletv.svg', '#FFFFFF', False, 'Simple Icons (CC0 1.0), in white'),
    'crunchyroll.svg': ('si-crunchyroll.svg', '#FFFFFF', False, 'Simple Icons (CC0 1.0), in white'),
    'plex.svg': ('si-plex.svg', '#FFFFFF', False, 'Simple Icons (CC0 1.0), in white'),
    'twitch.svg': ('si-twitch.svg', '#FFFFFF', False, 'Simple Icons (CC0 1.0), in white'),
    'playstation.svg': ('si-playstation.svg', '#FFFFFF', False, 'Simple Icons (CC0 1.0), in white'),
}
COLOR = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)')


def local(tag):
    return tag.split('}')[-1]


def clean(path, color, drop_rect):
    root = ET.parse(path).getroot()
    for parent in list(root.iter()):
        for child in list(parent):
            if not isinstance(child.tag, str) or local(child.tag) not in DRAW:
                parent.remove(child)
    if drop_rect:
        for parent in root.iter():
            rects = [c for c in parent if local(c.tag) == 'rect']
            if rects:
                parent.remove(rects[0])
                break
    for e in root.iter():
        for k in list(e.attrib):
            if k.startswith('on') or 'href' in k and not e.attrib[k].startswith('#'):
                del e.attrib[k]
        if color:
            for k in ('fill', 'stop-color', 'stroke'):
                if k in e.attrib and e.attrib[k] not in ('none', 'transparent'):
                    e.attrib[k] = color
            if 'style' in e.attrib:
                e.attrib['style'] = COLOR.sub(color, e.attrib['style'])
            if local(e.tag) == 'style' and e.text:
                e.text = COLOR.sub(color, e.text)
    if color:
        root.set('fill', color)   # paths with no fill of their own are black by default
    for k in ('id', 'data-name', 'class', 'x', 'y', 'enable-background', 'version', 'style'):
        root.attrib.pop(k, None)
    root.attrib.pop('{http://www.w3.org/XML/1998/namespace}space', None)
    return root


raw, out = sys.argv[1], sys.argv[2]
for name, (src, color, drop, note) in LOGOS.items():
    root = clean(os.path.join(raw, src), color, drop)
    body = ET.tostring(root, encoding='unicode')
    body = body.replace('>', '><!-- %s logo, from %s -->' % (name[:-4], note), 1)
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        f.write(body)
    print('%-16s %6d bytes' % (name, len(body)))
