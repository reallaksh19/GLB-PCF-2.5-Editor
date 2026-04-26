import re

with open('index.html', 'r') as f:
    c = f.read()

# Update viewer-toolbar-group spacing and contrast
c = re.sub(
    r'\.viewer-toolbar-group\s*\{[^}]*\}',
    '''.viewer-toolbar-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border: 1px solid var(--steel-light, #4a5570);
      border-radius: 6px;
      background: var(--bg-1, #141720);
    }''',
    c
)

with open('index.html', 'w') as f:
    f.write(c)
