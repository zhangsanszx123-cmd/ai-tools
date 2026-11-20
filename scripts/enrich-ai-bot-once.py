"""Fetch product images and factual detail fields for an existing import manifest."""
import concurrent.futures, hashlib, json, re, sys, threading, time
import urllib.request, urllib.parse, urllib.robotparser
from pathlib import Path
from html import unescape

ROOT = Path(sys.argv[1])
AGENT = 'AI-Tools-OneOff-Importer/1.0'
BASE = 'https://ai-bot.cn/'
STOP = threading.Event()
LOCK = threading.Lock()
last_request = 0.0
RULES = urllib.robotparser.RobotFileParser()
RULES.parse((ROOT / 'robots.txt').read_text(encoding='utf-8').splitlines())
for name in ['details', 'assets', 'enriched']:
    (ROOT / name).mkdir(exist_ok=True)

def attrs(tag):
    return {k.lower(): unescape(v) for k, _, v in re.findall(r'([\w-]+)\s*=\s*([\"\x27])(.*?)\2', tag, re.S)}

def plain(html):
    html = re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1>', '', html, flags=re.I)
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', '', html))).strip()

def request(url, limit=8_000_000):
    global last_request
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('ai-bot.cn', 'www.ai-bot.cn'):
        raise ValueError('outside-source-host')
    if not RULES.can_fetch(AGENT, url): raise ValueError('robots-disallowed')
    if STOP.is_set(): raise ValueError('source-paused')
    with LOCK:
        delay = .15 - (time.monotonic() - last_request)
        if delay > 0: time.sleep(delay)
        last_request = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': AGENT}), timeout=18) as r:
            if urllib.parse.urlsplit(r.url).hostname not in ('ai-bot.cn', 'www.ai-bot.cn'): raise ValueError('external-redirect')
            body = r.read(limit + 1)
            if len(body) > limit: raise ValueError('oversize-response')
            return body
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429): STOP.set()
        raise

def image(url):
    # Source image endpoints return a browser verification script instead of image bytes.
    # Keep URLs as provenance; official-site public images are downloaded separately.
    return None

def labels(section):
    result = []
    for li in re.findall(r'<li\b[^>]*>([\s\S]*?)</li>', section, re.I):
        strong = re.search(r'<(?:strong|b)\b[^>]*>([\s\S]*?)</(?:strong|b)>', li, re.I)
        label = plain(strong[1]) if strong else re.split(r'[：:。；;]', plain(li))[0]
        label = re.sub(r'^\d+[.、]\s*', '', label).strip(' ：:、-')
        if 2 <= len(label) <= 42 and not re.search(r'https?://|官网|注册|登录', label) and label not in result:
            result.append(label)
    return result[:8]

def parse(html):
    h1 = re.search(r'<h1\b[^>]*class=[\"\x27][^\"\x27]*site-name[^\"\x27]*[\"\x27][^>]*>([\s\S]*?)</h1>', html)
    if not h1 and re.search(r'<meta[^>]+property=[\"\x27]og:type[\"\x27][^>]+content=[\"\x27]article[\"\x27]', html):
        h1 = re.search(r'<h1\b[^>]*class=[\"\x27]h3 mb-3[\"\x27][^>]*>([\s\S]*?)</h1>', html)
    if not h1: raise ValueError('missing-product-heading')
    meta = {}
    for tag in re.findall(r'<meta\b[^>]*>', html):
        a = attrs(tag)
        meta[a.get('property', a.get('name', ''))] = a.get('content', '')
    match = re.search(r'<div\b[^>]*class=[\"\x27][^\"\x27]*panel-body single[^\"\x27]*[\"\x27][^>]*>', html)
    body = html[match.end():] if match else ''
    # Stop before site recommendation cards/comments so other products never contaminate facts.
    body = re.split(r'<h2\b[^>]*class=|<div[^>]*id=[\"\x27]comments|<!--\s*相关文章', body, maxsplit=1)[0]
    features, scenarios, topics = [], [], []
    parts = re.split(r'<h[23]\b[^>]*>([\s\S]*?)</h[23]>', body)
    for i in range(1, len(parts) - 1, 2):
        heading = plain(parts[i])
        if len(heading) < 60: topics.append(heading)
        if re.search(r'功能|特点|特性|能力|feature', heading, re.I) and not features: features = labels(parts[i + 1])
        if re.search(r'场景|适合|适用|人群|用户群', heading) and not scenarios: scenarios = labels(parts[i + 1])
    images = [attrs(tag) for tag in re.findall(r'<img\b[^>]*>', body)]
    covers = [a.get('data-src') or a.get('src') for a in images]
    header = re.search(r'<div class=[\"\x27]siteico[\"\x27]>([\s\S]*?)</div>', html)
    if header:
        tag = re.search(r'<img\b[^>]*>', header[1])
        if tag:
            a = attrs(tag[0]); covers.append(a.get('data-src') or a.get('src'))
    covers = list(dict.fromkeys(u for u in covers if u and '/wp-content/uploads/' in u))[:3]
    return {'heading': plain(h1[1]), 'description': meta.get('description', ''),
            'features': features, 'scenarios': scenarios, 'topics': topics[:12],
            'logoUrl': meta.get('og:image'), 'coverUrls': covers}

def worker(record):
    sid = re.search(r'/sites/(\d+)\.html', record['source'])[1]
    target = ROOT / 'enriched' / (sid + '.json')
    if target.exists():
        cached = json.loads(target.read_text(encoding='utf-8'))
        cached['logo'] = None
        cached['covers'] = []
        return cached
    result = {'id': record['id'], 'slug': record['slug'], 'source': record['source'], 'errors': []}
    try:
        cache = ROOT / 'details' / (sid + '.html')
        if not cache.exists(): cache.write_bytes(request(record['source']))
        data = parse(cache.read_text(encoding='utf-8'))
        result.update(data)
        try: result['logo'] = image(data['logoUrl'])
        except Exception as e: result['errors'].append({'kind': 'logo', 'code': getattr(e, 'code', type(e).__name__)})
        result['covers'] = []
        for url in data['coverUrls']:
            try:
                asset = image(url)
                if asset:
                    result['covers'].append(asset)
                    break
            except Exception as e: result['errors'].append({'kind': 'cover', 'code': getattr(e, 'code', type(e).__name__)})
        result['ok'] = True
    except Exception as e:
        result['ok'] = False
        result['errors'].append({'kind': 'detail', 'code': getattr(e, 'code', type(e).__name__)})
    # Failed pages are retryable on the next run; successful metadata is cached.
    if result.get('ok'): target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result

if __name__ == '__main__':
    manifest = json.loads((ROOT / 'inserted-manifest.json').read_text(encoding='utf-8'))
    records = manifest['inserted']
    if '--retry-failed' in sys.argv:
        records = [r for r in records if not (ROOT / 'enriched' / (re.search(r'/sites/(\d+)\.html', r['source'])[1] + '.json')).exists()]
    if '--sample' in sys.argv: records = records[:8]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(worker, r): r for r in records}
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())
            if len(results) % 25 == 0 or len(results) == len(records):
                print(json.dumps({'done': len(results), 'total': len(records), 'details': sum(r.get('ok', False) for r in results), 'logos': sum(bool(r.get('logo')) for r in results), 'covers': sum(bool(r.get('covers')) for r in results), 'paused': STOP.is_set()}), flush=True)
            if STOP.is_set():
                for pending in futures: pending.cancel()
                break
    (ROOT / ('enriched-sample.json' if '--sample' in sys.argv else 'enriched.json')).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
