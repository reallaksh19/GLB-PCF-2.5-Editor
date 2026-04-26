import re
with open('index.html', 'r') as f:
    c = f.read()

themes_dropdown = """<select id="viewer-theme" data-cap="theme" title="Rendering theme">
          <option value="NavisDark">Dark Theme (Navis Inspired)</option>
          <option value="DraftLight">Draft Light</option>
          <option value="DraftDark">Draft Dark</option>
          <option value="Blueprint">Blueprint</option>
          <option value="MonochromeTechnical">Monochrome Technical</option>
          <option value="HighContrastReview">High Contrast Review</option>
        </select>"""

c = re.sub(r'<select id="viewer-theme"[^>]*>.*?</select>', themes_dropdown, c, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(c)
