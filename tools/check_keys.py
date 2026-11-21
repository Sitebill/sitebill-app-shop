# Все ключи host.t('…') из web/*.mjs должны быть в локалях (check SDK этого не видит).
import json, re, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
keys = set(json.load(open(os.path.join(root, 'locales', 'ru.json'), encoding='utf-8')))
used = set()
for f in ['site.mjs', 'admin.mjs']:
    s = open(os.path.join(root, 'web', f), encoding='utf-8').read()
    used |= set(re.findall(r"host\.t\('([a-z_]+)'\)", s))
    used |= set(re.findall(r"page\('\w+', '([a-z_]+)'", s))
    for pre in re.findall(r"t\(`([a-z_]+)\$\{", s):
        used |= {k for k in keys if k.startswith(pre)}
print('missing:', sorted(k for k in used if k not in keys))
print('unused:', sorted(keys - used))
