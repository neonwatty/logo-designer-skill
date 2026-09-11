"""Validate tracked Markdown/site local file references, without network requests."""
import re
import subprocess
from html import unescape
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path.cwd()
files = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
errors = []
for name in files:
    path = root / name
    if not path.is_file() or not (name.endswith('.md') or (name.startswith('site/') and path.suffix in {'.html', '.css'})):
        continue
    text = path.read_text()
    # Code samples contain illustrative paths rather than links in rendered prose.
    if path.suffix == '.md':
        text = re.sub(r'(?ms)^\s*(`{3,}|~{3,}).*?^\s*\1\s*$', '', text)
        text = re.sub(r'`[^`\n]+`', '', text)
    links = re.findall(r'\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)', text)
    links += re.findall(r'(?:href|src|poster)=["\']([^"\']+)["\']', text)
    links += re.findall(r'url\(["\']?([^\s)"\']+)', text)
    for link in links:
        link = unescape(link)
        parsed = urlsplit(link)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        target = unquote(parsed.path)
        # Root-relative site URLs are rooted in the published site directory.
        resolved = (root / 'site' / target.lstrip('/')) if target.startswith('/') and name.startswith('site/') else path.parent / target
        if not resolved.exists():
            errors.append(f'{name}: missing local target {link}')
if errors:
    raise SystemExit('\n'.join(errors))
print('Markdown and site local references passed')
