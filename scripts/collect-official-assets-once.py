"""Collect public icon/share images from each product's own website, respecting robots."""
import concurrent.futures, hashlib, ipaddress, json, re, socket, sys, threading
import urllib.request, urllib.parse, urllib.robotparser, urllib.error
from PIL import Image
from io import BytesIO
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(sys.argv[1])
AGENT = 'AI-Tools-OneOff-Importer/1.0'
OUT = ROOT / 'official'
OUT.mkdir(exist_ok=True)
(ROOT / 'official-assets').mkdir(exist_ok=True)
(ROOT / 'official-html').mkdir(exist_ok=True)
rules_cache = {}
rules_lock = threading.Lock()
host_limits = {}
BLOCKS = [ipaddress.ip_network(n) for n in ['0.0.0.0/8','10.0.0.0/8','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.168.0.0/16','::1/128','fc00::/7','fe80::/10']]

def validate(url):
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.port not in (None,80,443): raise ValueError('unsafe-url')
    for addr in socket.getaddrinfo(u.hostname, u.port or 443, type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(addr[4][0])
        if any(ip in block for block in BLOCKS if ip.version == block.version): raise ValueError('private-address')

class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def raw(url, limit=5_000_000):
    validate(url)
    opener = urllib.request.build_opener(Redirect())
    host=urllib.parse.urlsplit(url).hostname
    with rules_lock: gate=host_limits.setdefault(host,threading.Semaphore(2))
    with gate:
        with opener.open(urllib.request.Request(url, headers={'User-Agent':AGENT}), timeout=7) as r:
            data = r.read(limit+1)
            if len(data)>limit: raise ValueError('oversize')
            return data, r.url, r.headers.get('Content-Type','')

def allowed(url):
    u = urllib.parse.urlsplit(url)
    origin = f'{u.scheme}://{u.netloc}'
    with rules_lock: rules = rules_cache.get(origin)
    if rules is None:
        rules = urllib.robotparser.RobotFileParser()
        try:
            body, _, content_type = raw(origin+'/robots.txt', 500_000)
            rules.parse(body.decode('utf-8','replace').splitlines() if 'html' not in content_type else [])
        except urllib.error.HTTPError as e:
            if e.code not in (404,410): raise
            rules.parse([])
        with rules_lock: rules_cache[origin] = rules
    return rules.can_fetch(AGENT,url)

class Metadata(HTMLParser):
    def __init__(self): super().__init__(); self.meta={}; self.icons=[]; self.heroes=[]
    def handle_starttag(self,tag,attributes):
        a=dict(attributes)
        if tag=='meta': self.meta[a.get('property',a.get('name',''))]=a.get('content','')
        if tag=='link' and 'icon' in a.get('rel','').lower():
            if a.get('href'): self.icons.append(a['href'])
        if tag=='img':
            src=a.get('data-src') or a.get('src','')
            hint=src+' '+a.get('alt','')+' '+a.get('class','')
            if re.search(r'hero|banner|screenshot|preview|landing|cover|homepage|screen-shot|产品界面|网站截图',hint,re.I) and not re.search(r'logo|icon|avatar|tracking',hint,re.I):self.heroes.append(src)

def image(url, base):
    url=urllib.parse.urljoin(base,url)
    if not allowed(url): raise ValueError('robots-disallowed')
    path=ROOT/'official-assets'/(hashlib.sha256(url.encode()).hexdigest()+'.raw')
    if not path.exists():
        body, _, kind=raw(url)
        head=body[:200].lower().lstrip()
        if 'text/html' in kind or head.startswith((b'<!doctype html',b'<html',b'<script')): raise ValueError('non-image-response')
        if not (kind.startswith('image/') or head.startswith((b'\x89PNG',b'\xff\xd8',b'RIFF',b'GIF8',b'\x00\x00\x01\x00',b'<svg',b'<?xml'))): raise ValueError('non-image-response')
        if body.startswith(b'\x00\x00\x01\x00'):
            # Browser favicons often use ICO; normalize safely before sharp processes them.
            with Image.open(BytesIO(body)) as icon:
                buffer=BytesIO();icon.convert('RGBA').save(buffer,format='PNG');body=buffer.getvalue()
        path.write_bytes(body)
    elif path.read_bytes().startswith(b'\x00\x00\x01\x00'):
        with Image.open(path) as icon:
            buffer=BytesIO();icon.convert('RGBA').save(buffer,format='PNG')
        path.write_bytes(buffer.getvalue())
    return {'file':str(path),'url':url}

def worker(row):
    target=OUT/(row['id']+'.json')
    prior=json.loads(target.read_text(encoding='utf-8')) if target.exists() else None
    if prior and ('--retry-missing' not in sys.argv or (prior.get('logo') and prior.get('covers'))):return prior
    result={'id':row['id'],'website':row['website'],'errors':[],'covers':[]}
    try:
        url=row['website']
        if not allowed(url): raise ValueError('robots-disallowed')
        parser=Metadata();final=url
        try:
            cached=ROOT/'official-html'/(row['id']+'.html')
            if cached.exists():body=cached.read_bytes()
            else:
                body, final, kind=raw(url,2_000_000)
                cached.write_bytes(body)
            parser.feed(body.decode('utf-8','replace'))
        except Exception as e:
            result['errors'].append({'kind':'page','code':str(getattr(e,'code',type(e).__name__))})
        for candidate in dict.fromkeys(parser.icons+[urllib.parse.urljoin(final,'/favicon.ico')]):
            try:
                result['logo']=image(candidate,final)
                break
            except Exception as e: result['errors'].append({'kind':'logo','code':str(getattr(e,'code',type(e).__name__))})
        for candidate in list(dict.fromkeys([parser.meta.get('og:image',''),parser.meta.get('twitter:image','')]+parser.heroes))[:4]:
            if not candidate:continue
            try:
                asset=image(candidate,final)
                with Image.open(asset['file']) as cover:
                    if cover.width<300 or cover.height<130 or cover.width/cover.height<1.15:continue
                result['covers'].append(asset)
                break
            except Exception as e:result['errors'].append({'kind':'cover','code':str(getattr(e,'code',type(e).__name__))})
        result['ok']=True
    except Exception as e:
        result['ok']=False;result['errors'].append({'kind':'website','code':str(getattr(e,'code',type(e).__name__))})
    if prior:
        if not result.get('logo') and prior.get('logo'):result['logo']=prior['logo']
        if not result.get('covers') and prior.get('covers'):result['covers']=prior['covers']
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result

if __name__=='__main__':
    rows=json.loads((ROOT/'official-targets.json').read_text(encoding='utf-8'))
    if '--sample' in sys.argv:rows=rows[:8]
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for r in pool.map(worker,rows):
            results.append(r)
            if len(results)%25==0 or len(results)==len(rows):print(json.dumps({'officialChecked':len(results),'total':len(rows),'logos':sum(bool(r.get('logo'))for r in results),'covers':sum(bool(r.get('covers'))for r in results)}),flush=True)
    (ROOT/'official-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
