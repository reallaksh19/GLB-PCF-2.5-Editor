import re

with open('js/ui/toolbar.js', 'r') as f:
    content = f.read()

# 1. Update bindClick for new btn-fit-all-float
# We just need to ensure btn-fit-all-float is bound.
content = content.replace("unsubs.push(bindClick('btn-fit-all', () => actions.fitAll?.()));",
"unsubs.push(bindClick('btn-fit-all', () => actions.fitAll?.()));\n  unsubs.push(bindClick('btn-fit-all-float', () => actions.fitAll?.()));")


# The default behavior for grouping in toolbar is still ok, we just moved the presets out of the toolbar.

with open('js/ui/toolbar.js', 'w') as f:
    f.write(content)
