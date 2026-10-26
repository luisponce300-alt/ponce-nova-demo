"""Bundle the static PR application for local review without a server or deployment."""
import base64
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'review' / 'Ponce_Nova_Forhandsvisning.html'


def data_url(relative, media_type):
    return f'data:{media_type};base64,' + base64.b64encode((ROOT / relative).read_bytes()).decode('ascii')


def build():
    inputs = ['index.html', 'styles.css', 'core.js', 'agents.js', 'app.js', 'assets/approved-design.jpg', 'assets/favicon.svg']
    digest = hashlib.sha256()
    for name in inputs:
        digest.update(name.encode())
        digest.update((ROOT / name).read_bytes())
    fingerprint = digest.hexdigest()[:12]
    html = (ROOT / 'index.html').read_text()
    css = (ROOT / 'styles.css').read_text()
    css = css.replace('url("assets/approved-design.jpg")', f'url("{data_url("assets/approved-design.jpg", "image/jpeg")}")')
    if 'assets/approved-design.jpg' in css:
        raise ValueError('Portrait URL was not inlined')
    core = re.sub(r'^export ', '', (ROOT / 'core.js').read_text(), flags=re.MULTILINE)
    app, replacements = re.subn(r'^import\s*\{[^}]+\}\s*from\s*"\./core\.js";\s*', '', (ROOT / 'app.js').read_text(), count=1)
    if replacements != 1:
        raise ValueError('Expected exactly one core import')
    app = re.sub(r'^import \{ AGENTS \} from "\./agents\.js";\s*', '', app, count=1)
    app = app.replace('const SERVER_FEATURES_ENABLED = true;', 'const SERVER_FEATURES_ENABLED = false;')
    core = re.sub(r'^export ', '', (ROOT / 'agents.js').read_text(), flags=re.MULTILINE) + '\n' + core
    if 'const KEY = "ponce-nova:v1";' not in app:
        raise ValueError('Unexpected storage key')
    app = app.replace('const KEY = "ponce-nova:v1";', 'const KEY = "ponce-nova:review:v1";')
    script = (core + '\n' + app).replace('</script', '<\\/script')
    html, replacements = re.subn(r'<script type="module" src="app\.js"></script>', lambda _: '<script type="module">\n' + script + '\n</script>', html, count=1)
    if replacements != 1:
        raise ValueError('Module script tag not found')
    html, replacements = re.subn(r'<link rel="stylesheet" href="styles\.css"\s*/?>', lambda _: '<style>\n' + css + '\n.review-banner{padding:10px 16px;background:#3b2b0c;color:#ffe3a0;border-bottom:1px solid #967523;font:12px/1.5 Arial,sans-serif;text-align:center}\n</style>', html, count=1)
    if replacements != 1:
        raise ValueError('Stylesheet link not found')
    html = html.replace('href="assets/favicon.svg"', f'href="{data_url("assets/favicon.svg", "image/svg+xml")}"')
    html = html.replace('<title>Ponce &amp; Nova — Trading HQ</title>', '<title>Ponce &amp; Nova — Förhandsvisning</title>')
    html = html.replace('<body>', f'<body>\n<aside class="review-banner" aria-label="Förhandsvisning">FÖRHANDSVISNING · PR #2 · Kodversion {fingerprint} · Separat testlagring · Ingen livehandel eller publicering</aside>', 1)
    html = html.replace('för denna webbläsare och webbplats', 'i denna testfil, separat från den publicerade webbplatsen')
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(html)
    print(f'{OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes), source fingerprint {fingerprint}')
    return OUTPUT


if __name__ == '__main__':
    build()
