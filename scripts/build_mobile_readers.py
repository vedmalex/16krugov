#!/usr/bin/env python3
"""
build_mobile_readers.py

Generates mobile-optimized standalone HTML files for prayers using telegraph-publisher CLI,
injects edition-switchers (verses / interlinear / word-by-word), and builds a unified portal.
Outputs to:
  content/prayers/
  web/public/reader/
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PRAYERS_DIR = BASE_DIR / "content" / "prayers"
PUBLIC_READER_DIR = BASE_DIR / "web" / "public" / "reader"

def find_telegraph_publisher() -> str:
    bin_path = shutil.which("telegraph-publisher")
    if bin_path:
        return bin_path
    # check standard bun paths
    candidates = [
        Path("/Users/vedmalex/.bun/bin/telegraph-publisher"),
        Path.home() / ".bun" / "bin" / "telegraph-publisher",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    raise FileNotFoundError("telegraph-publisher not found")

EDITION_GROUPS = [
    {
        "folder": PRAYERS_DIR / "bhajana",
        "title": "Шри Кевалаштакам",
        "category": "Бхаджаны",
        "editions": [
            ("kevalastakam-ru-verses", "RU Шлоки", "kevalastakam-ru-verses.md"),
            ("kevalastakam-ru-interlinear", "RU Связный", "kevalastakam-ru-interlinear.md"),
            ("kevalastakam-ru-word-by-word", "RU Пословный", "kevalastakam-ru-word-by-word.md"),
        ]
    },
    {
        "folder": PRAYERS_DIR / "morning-service",
        "title": "Утренняя служба ISKCON",
        "category": "Утренняя служба",
        "editions": [
            ("morning-service-ru-verses", "RU Шлоки", "morning-service-ru-verses.md"),
            ("morning-service-ru-interlinear", "RU Связный", "morning-service-ru-interlinear.md"),
            ("morning-service-ru-word-by-word", "RU Пословный", "morning-service-ru-word-by-word.md"),
        ]
    },
    {
        "folder": PRAYERS_DIR / "krtik-month",
        "title": "Молитвы месяца Карттика",
        "category": "Молитвы Карттики",
        "editions": [
            ("kartika-prayers-ru-verses", "RU Шлоки", "kartika-prayers-ru-verses.md"),
            ("kartika-prayers-ru-interlinear", "RU Связный", "kartika-prayers-ru-interlinear.md"),
            ("kartika-prayers-ru-word-by-word", "RU Пословный", "kartika-prayers-ru-word-by-word.md"),
        ]
    }
]

EXTRA_CSS = """
body, pre, center, .align-center, .container, input, button {
  font-family: 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}
.edition-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 24px 0;
  padding: 8px 12px;
  background: var(--header-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
}
.edition-switch a {
  font-size: 0.85rem;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--card-border);
  font-weight: 500;
  transition: all 0.2s ease;
}
.edition-switch a:hover {
  background: var(--verse-bg);
  border-color: var(--accent);
}
.edition-switch a.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-weight: 700;
}
.edition-switch a.home-btn {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
}
sub {
  font-size: 0.75em;
  color: var(--term-color, #b45309);
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(180, 83, 9, 0.08);
}
"""

def render_edition(tp_bin: str, folder: Path, stem: str, md_name: str, all_editions: list):
    md_path = folder / md_name
    html_path = folder / f"{stem}.html"
    
    cmd = [tp_bin, "html", "-f", str(md_path), "-o", str(html_path)]
    subprocess.run(cmd, check=True)
    
    content = html_path.read_text(encoding="utf-8")
    
    # Build switch bar
    switch_links = ['<a href="./index.html" class="home-btn">← Библиотека</a>']
    for e_stem, e_label, _ in all_editions:
        active = ' class="active"' if e_stem == stem else ''
        switch_links.append(f'<a href="./{e_stem}.html"{active}>{e_label}</a>')
    switch_links.append('<a href="../../index.html#/shlokas" class="home-btn">★ Интерактивный банк</a>')

    switch_html = f'    <div class="edition-switch">\n      ' + '\n      '.join(switch_links) + '\n    </div>\n'

    if '</style>' in content:
        content = content.replace('</style>', EXTRA_CSS + '</style>', 1)
    if '<main class="container">' in content:
        content = content.replace('<main class="container">', '<main class="container">\n' + switch_html, 1)

    html_path.write_text(content, encoding="utf-8")
    print(f"Generated: {html_path}")

    # Copy to public reader dir
    rel_folder = folder.name
    dest_folder = PUBLIC_READER_DIR / rel_folder
    dest_folder.mkdir(parents=True, exist_ok=True)
    shutil.copy2(html_path, dest_folder / f"{stem}.html")

def generate_portal_index():
    PUBLIC_READER_DIR.mkdir(parents=True, exist_ok=True)
    
    html = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>Банк Шлок — Мобильные издания</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Noto+Sans+Bengali:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
:root {
  --bg: #faf8f5;
  --text: #2d2a26;
  --header-bg: #f3ece2;
  --card-bg: #ffffff;
  --card-border: #e6ded4;
  --accent: #b45309;
  --accent-light: #fef3c7;
  --verse-bg: #fffbf2;
  --verse-border: #fcd34d;
  --muted: #6b7280;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #18181b;
    --text: #f4f4f5;
    --header-bg: #27272a;
    --card-bg: #202023;
    --card-border: #3f3f46;
    --accent: #f59e0b;
    --accent-light: #451a03;
    --verse-bg: #1f1d17;
    --verse-border: #b45309;
    --muted: #a1a1aa;
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', -apple-system, sans-serif;
  line-height: 1.6;
  padding: 20px 16px 40px;
  max-width: 840px;
  margin: 0 auto;
}
header {
  text-align: center;
  padding: 24px 0 20px;
  border-bottom: 1px solid var(--card-border);
  margin-bottom: 24px;
}
.badge {
  display: inline-block;
  background: var(--accent-light);
  color: var(--accent);
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 10px;
}
h1 { font-size: 1.8rem; margin-bottom: 8px; color: var(--accent); }
p.lede { color: var(--muted); font-size: 1rem; }
.nav-back {
  display: inline-block;
  margin-top: 12px;
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  margin: 20px 0;
}
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
}
.card h2 { font-size: 1.25rem; margin-bottom: 6px; color: var(--accent); }
.card p { color: var(--muted); font-size: 0.9rem; margin-bottom: 14px; }
.formats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.formats a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--verse-bg);
  border: 1px solid var(--verse-border);
  color: var(--text);
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  transition: all 0.2s;
}
.formats a:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.spa-banner {
  background: var(--header-bg);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 16px 20px;
  margin-top: 30px;
  text-align: center;
}
.spa-banner h3 { color: var(--accent); margin-bottom: 6px; font-size: 1.15rem; }
.spa-banner p { font-size: 0.92rem; color: var(--muted); margin-bottom: 12px; }
.spa-btn {
  display: inline-block;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
}
</style>
</head>
<body>
<header>
  <span class="badge">16 КРУГОВ · БАНК ШЛОК</span>
  <h1>Священные молитвы и шлоки</h1>
  <p class="lede">Канонические тексты, подстрочные переводы и пословные разборы для внимательной джапы и киртана</p>
  <a class="nav-back" href="../../#/shlokas">← Перейти в интерактивный тренажёр шлок</a>
</header>

<main class="grid">
  <article class="card">
    <h2>1. Утренняя служба ISKCON</h2>
    <p>Мангала-арати, Шри Гурваштака, Вибхавари-шеша, Нрисимха-пранама, Туласи-пуджа, 10 оскорблений, Шикшаштака, Према-дхвани (50 стихов).</p>
    <div class="formats">
      <a href="./morning-service/morning-service-ru-verses.html">📖 Шлоки и перевод</a>
      <a href="./morning-service/morning-service-ru-interlinear.html">🔍 Связный подстрочник</a>
      <a href="./morning-service/morning-service-ru-word-by-word.html">📝 Пословный разбор</a>
    </div>
  </article>

  <article class="card">
    <h2>2. Молитвы месяца Карттика</h2>
    <p>Гаура-арати, Прабхупада-падма Ставаках, Шад-Госвами-аштакам, Шачи-таная, Радха-крипа-катакша, Нанда-нандана, Дамодараштакам, Дипа-дана (67 стихов).</p>
    <div class="formats">
      <a href="./krtik-month/kartika-prayers-ru-verses.html">📖 Шлоки и перевод</a>
      <a href="./krtik-month/kartika-prayers-ru-interlinear.html">🔍 Связный подстрочник</a>
      <a href="./krtik-month/kartika-prayers-ru-word-by-word.html">📝 Пословный разбор</a>
    </div>
  </article>

  <article class="card">
    <h2>3. Шри Кевалаштакам</h2>
    <p>«Мадхурам мадхуребхйо ’пи» — высшая слава Святого Имени (Шрила Нилакантха Госвами, 8 стихов).</p>
    <div class="formats">
      <a href="./bhajana/kevalastakam-ru-verses.html">📖 Шлоки и перевод</a>
      <a href="./bhajana/kevalastakam-ru-interlinear.html">🔍 Связный подстрочник</a>
      <a href="./bhajana/kevalastakam-ru-word-by-word.html">📝 Пословный разбор</a>
    </div>
  </article>
</main>

<div class="spa-banner">
  <h3>Интерактивный Банк Шлок в приложении</h3>
  <p>Выбирайте отдельные шлоки, настраивайте круг джапы, копируйте ссылки и ищите по словам.</p>
  <a class="spa-btn" href="../../#/shlokas">Открыть интерактивный банк шлок</a>
</div>

</body>
</html>
"""
    (PUBLIC_READER_DIR / "index.html").write_text(html, encoding="utf-8")
    (PRAYERS_DIR / "index.html").write_text(html, encoding="utf-8")
    print("Portal generated:", PUBLIC_READER_DIR / "index.html")

def main():
    print("Finding telegraph-publisher...")
    tp_bin = find_telegraph_publisher()
    print("Found:", tp_bin)

    PUBLIC_READER_DIR.mkdir(parents=True, exist_ok=True)

    for group in EDITION_GROUPS:
        print(f"\nProcessing {group['title']}...")
        folder = group["folder"]
        for stem, _, md_name in group["editions"]:
            render_edition(tp_bin, folder, stem, md_name, group["editions"])

    generate_portal_index()
    print("\n✅ All mobile reader editions successfully generated!")

if __name__ == "__main__":
    main()
