"""One-off public directory metadata collection; no admin UI or scheduled job."""
import json, re, sys, time, urllib.request, urllib.parse, urllib.robotparser
from pathlib import Path
from html import unescape

BASE = 'https://ai-bot.cn/'
AGENT = 'AI-Tools-OneOff-Importer/1.0'
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
ROOTS = {
    'ai-writing-tools': 'writing', 'ai-image-tools': 'image', 'ai-video-tools': 'video',
    'ai-office-tools': 'office', 'ai-chatbots': 'chat', 'ai-agent': 'agents', 'ai-agents': 'agents',
    'ai-programming-tools': 'code', 'ai-frameworks': 'platforms', 'ai-design-tools': 'design',
    'ai-audio-tools': 'audio', 'ai-search-engines': 'search', 'websites-to-learn-ai': 'learning',
    'ai-models': 'training', 'ai-model-evaluation': 'evaluation',
    'ai-content-detection-and-optimization-tools': 'detection', 'ai-prompt-tools': 'prompts',
    'ai-side-business-tools': 'side-hustle',
}
HEADINGS = dict(zip(['AI写作工具','AI图像工具','AI视频工具','AI办公工具','AI聊天助手','AI智能体','AI编程工具','AI开发平台','AI设计工具','AI音频工具','AI搜索引擎','AI学习网站','AI训练模型','AI模型评测','AI内容检测','AI提示指令','AI副业工具'], ['writing','image','video','office','chat','agents','code','platforms','design','audio','search','learning','training','evaluation','detection','prompts','side-hustle']))
def clean(s):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', '', s))).strip()
def attrs(s):
    return {k.lower(): unescape(v) for k, _, v in re.findall(r'([\w-]+)\s*=\s*([\"\x27])(.*?)\2', s, re.S)}
def request(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': AGENT}), timeout=25) as r:
        if r.status != 200: raise RuntimeError('HTTP_' + str(r.status))
        return r.read().decode('utf-8')
robots_text = request(BASE + 'robots.txt')
(OUT / 'robots.txt').write_text(robots_text, encoding='utf-8')
rules = urllib.robotparser.RobotFileParser()
rules.parse(robots_text.splitlines())
queue = [(BASE, None)]
seen, items, failures = set(), {}, []
while queue and len(seen) < 110:
    url, category = queue.pop(0)
    if url in seen: continue
    seen.add(url)
    if not rules.can_fetch(AGENT, url):
        failures.append({'url': url, 'reason': 'robots-disallowed'})
        continue
    try:
        html = request(url)
    except Exception as e:
        failures.append({'url': url, 'reason': type(e).__name__})
        if getattr(e, 'code', 0) in (401, 403, 429): break
        continue
    (OUT / ('page-' + str(len(seen)) + '.html')).write_text(html, encoding='utf-8')
    if url == BASE:
        for href in re.findall(r'href=[\"\x27](https://ai-bot.cn/favorites/[^\"\x27]+)', html):
            slug = href.rstrip('/').split('/')[-1]
            if slug in ROOTS: queue.append((href, ROOTS[slug]))
    else:
        # Follow category pagination only, not sidebar cross-category links or editorial articles.
        for href in re.findall(r'href=[\"\x27](https://ai-bot.cn/favorites/[^\"\x27]+/page/\d+/?)', html):
            if href.split('/page/')[0].rstrip('/') == url.split('/page/')[0].rstrip('/'):
                queue.append((href, category))
    pattern = r'<h4\b[^>]*>[\s\S]*?</h4>|<a\b[^>]*href=[\"\x27]https://ai-bot.cn/sites/\d+\.html[\"\x27][^>]*>[\s\S]*?</a>'
    current = category
    for m in re.finditer(pattern, html):
        block = m.group()
        if block.startswith('<h4'):
            if url == BASE: current = HEADINGS.get(clean(block).replace(' ', ''), current)
            continue
        a = attrs(block.split('>', 1)[0])
        if 'data-url' not in a: continue
        name_match = re.search(r'<strong\b[^>]*>([\s\S]*?)</strong>', block)
        summary_match = re.search(r'<p\b[^>]*>([\s\S]*?)</p>', block)
        name = clean(name_match[1]) if name_match else ''
        website = a['data-url']
        parsed = urllib.parse.urlsplit(website)
        if not current or not name or parsed.scheme not in ('http', 'https') or not parsed.hostname: continue
        if parsed.hostname.lower() in ('ai-bot.cn', 'www.ai-bot.cn'): continue
        source = a['href']
        record = {'source': source, 'sourcePage': url, 'name': name, 'website': website,
                  'summary': clean(summary_match[1]) if summary_match else clean(a.get('title','')), 'category': current}
        if source not in items or url != BASE: items[source] = record
    print(json.dumps({'pages': len(seen), 'tools': len(items), 'queued': len(queue), 'category': category}), flush=True)
    time.sleep(1)
(OUT / 'collected.json').write_text(json.dumps({'source': BASE, 'agent': AGENT, 'items': list(items.values()), 'failures': failures}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'done': True, 'pages': len(seen), 'tools': len(items), 'failures': len(failures)}), flush=True)
