#!/usr/bin/env python3
"""
generate_shloka_bank.py

Compiles a unified shloka bank (shloka_bank.json) from:
1. content/prayers/morning-service (verses, interlinear, word-by-word)
2. content/prayers/krtik-month (verses, interlinear, word-by-word)
3. content/prayers/bhajana (verses, interlinear, word-by-word)
4. web/data/bhakti_rasayana.json
5. web/data/luchshie_krugi.json
"""

import os
import re
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DATA_DIR = os.path.join(BASE_DIR, "web", "data")
PRAYERS_DIR = os.path.join(BASE_DIR, "content", "prayers")

def clean_translation(text: str) -> str:
    lines = [l.rstrip() for l in text.split("\n")]
    while lines and (not lines[-1] or lines[-1] == "---" or lines[-1].startswith("***")):
        lines.pop()
    while lines and not lines[0]:
        lines.pop(0)
    return "\n".join(lines).strip()

def clean_sanskrit(raw: str) -> str:
    if not raw:
        return ""
    # 1. Look for ```...```
    m_code = re.search(r"```(?:sanskrit)?\n?(.*?)\n?```", raw, re.DOTALL)
    if m_code:
        return "\n".join(l.strip() for l in m_code.group(1).split("\n") if l.strip())
    
    # 2. Look for <center>...</center>
    m_center = re.search(r"<center>\s*(.*?)\s*</center>", raw, re.DOTALL)
    if m_center:
        text = m_center.group(1).replace("<br/>", "\n").replace("<br>", "\n")
        return "\n".join(l.strip() for l in text.split("\n") if l.strip() and not l.strip().startswith("---"))
    
    # 3. Look for > **...**
    quotes = re.findall(r"^>\s*\*\*(.*?)\*\*", raw, re.MULTILINE)
    if quotes:
        return "\n".join(q.strip() for q in quotes)
        
    # Fallback: remove markdown block markers
    text = re.sub(r"```[a-zA-Z]*", "", raw)
    text = text.replace("<center>", "").replace("</center>", "")
    text = text.replace("<br/>", "\n").replace("<br>", "\n")
    lines = [l.strip() for l in text.split("\n")]
    lines = [l for l in lines if l and not l.startswith("---") and not l.startswith(">")]
    return "\n".join(lines).strip()

def parse_verses_markdown(text: str):
    """Splits section content by ### into list of (title, raw_body)."""
    parts = re.split(r"\n###\s+([^\n]+)\n", "\n" + text)
    preamble = parts[0].strip()
    verses = []
    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        body = parts[i+1].strip()
        # Skip empty divider headings
        if body or title.startswith("Стих"):
            verses.append((title, body))
    return preamble, verses

def extract_meta(preamble: str):
    author = ""
    source = ""
    for line in preamble.split("\n"):
        line = line.strip()
        m_auth = re.search(r"\*\*(?:Автор|Автор / Источник):\*\*\s*(.*)", line)
        if m_auth:
            author = m_auth.group(1).strip().strip("*")
        m_src = re.search(r"\*\*Источник:\*\*\s*(.*)", line)
        if m_src:
            source = m_src.group(1).strip().strip("*")
    return author, source

def parse_block_verses(raw: str):
    m = re.search(r"\*\*Перевод:\*\*\s*(.*)", raw, re.DOTALL)
    if m:
        translation = clean_translation(m.group(1))
        sanskrit_raw = raw[:m.start()].strip()
    else:
        translation = clean_translation(raw)
        sanskrit_raw = ""
    return clean_sanskrit(sanskrit_raw), translation

def parse_block_interlinear(raw: str):
    m_lit = re.search(r"\*\*(?:Литературный перевод|Перевод):\*\*\s*(.*)", raw, re.DOTALL)
    m_sub = re.search(r"\*\*Связный пословный перевод:\*\*\s*(.*?)(?=\*\*(?:Литературный перевод|Перевод):\*\*|$)", raw, re.DOTALL)
    lit = clean_translation(m_lit.group(1)) if m_lit else ""
    sub = clean_translation(m_sub.group(1)) if m_sub else ""
    split_pos = min([x.start() for x in [m_sub, m_lit] if x] or [len(raw)])
    sanskrit_raw = raw[:split_pos].strip()
    return clean_sanskrit(sanskrit_raw), sub, lit

def parse_block_wbw(raw: str):
    m_lit = re.search(r"\*\*(?:Литературный перевод|Перевод):\*\*\s*(.*)", raw, re.DOTALL)
    m_wbw = re.search(r"\*\*Пословный разбор(?:[^\*:]*):\*\*\s*(.*?)(?=\*\*(?:Литературный перевод|Перевод):\*\*|$)", raw, re.DOTALL)
    lit = clean_translation(m_lit.group(1)) if m_lit else ""
    wbw = clean_translation(m_wbw.group(1)) if m_wbw else ""
    split_pos = min([x.start() for x in [m_wbw, m_lit] if x] or [len(raw)])
    sanskrit_raw = raw[:split_pos].strip()
    return clean_sanskrit(sanskrit_raw), wbw, lit

def parse_collection(verses_path, inter_path, wbw_path, category, id_prefix_map):
    with open(verses_path, "r", encoding="utf-8") as f:
        v_text = f.read()
    with open(inter_path, "r", encoding="utf-8") as f:
        i_text = f.read()
    with open(wbw_path, "r", encoding="utf-8") as f:
        w_text = f.read()

    v_secs = re.split(r"\n##\s+(\d+\.\s+[^\n]+)\n", v_text)
    i_secs = re.split(r"\n##\s+(\d+\.\s+[^\n]+)\n", i_text)
    w_secs = re.split(r"\n##\s+(\d+\.\s+[^\n]+)\n", w_text)

    # Map by section title
    v_map = {v_secs[i].strip(): v_secs[i+1] for i in range(1, len(v_secs), 2)}
    i_map = {i_secs[i].strip(): i_secs[i+1] for i in range(1, len(i_secs), 2)}
    w_map = {w_secs[i].strip(): w_secs[i+1] for i in range(1, len(w_secs), 2)}

    works = []

    for sec_header, v_body in v_map.items():
        m_num = re.match(r"^(\d+)\.\s+(.*)", sec_header)
        num_str = m_num.group(1) if m_num else "1"
        sec_title = m_num.group(2) if m_num else sec_header
        
        work_id = id_prefix_map.get(sec_title, id_prefix_map.get(num_str, f"work-{num_str}"))

        v_pre, v_list = parse_verses_markdown(v_body)
        i_body = i_map.get(sec_header, "")
        w_body = w_map.get(sec_header, "")
        _, i_list = parse_verses_markdown(i_body)
        _, w_list = parse_verses_markdown(w_body)

        # Filter out empty divider headings like 'Стихи из «Падма-пураны»'
        v_list = [(t, b) for t, b in v_list if b.strip()]
        i_list = [(t, b) for t, b in i_list if b.strip()]
        w_list = [(t, b) for t, b in w_list if b.strip()]

        author, source = extract_meta(v_pre)

        work_verses = []
        max_len = max(len(v_list), len(i_list), len(w_list))

        for idx in range(max_len):
            v_title, v_raw = v_list[idx] if idx < len(v_list) else (f"Стих {idx+1}", "")
            _, i_raw = i_list[idx] if idx < len(i_list) else ("", "")
            _, w_raw = w_list[idx] if idx < len(w_list) else ("", "")

            sanskrit_v, trans_v = parse_block_verses(v_raw) if v_raw else ("", "")
            sanskrit_i, sub_i, lit_i = parse_block_interlinear(i_raw) if i_raw else ("", "", "")
            sanskrit_w, wbw_w, lit_w = parse_block_wbw(w_raw) if w_raw else ("", "", "")

            sanskrit = sanskrit_v or sanskrit_i or sanskrit_w
            translation = trans_v or lit_i or lit_w

            # If translation is still empty and v_raw has text (e.g. prose list)
            if not translation and v_raw:
                translation = clean_translation(v_raw)

            verse_num = idx + 1
            shloka_id = f"{work_id}-{verse_num}"

            formats = {
                "verses": {
                    "sanskrit": sanskrit,
                    "translation": translation
                }
            }
            if sub_i:
                formats["interlinear"] = {
                    "sanskrit": sanskrit_i or sanskrit,
                    "interlinear_text": sub_i,
                    "translation": lit_i or translation
                }
            if wbw_w:
                formats["word_by_word"] = {
                    "sanskrit": sanskrit_w or sanskrit,
                    "word_by_word_text": wbw_w,
                    "translation": lit_w or translation
                }

            work_verses.append({
                "id": shloka_id,
                "work_id": work_id,
                "work_title": sec_title,
                "work_category": category,
                "verse_number": verse_num,
                "title": v_title,
                "canonical_ref": None,
                "sanskrit": sanskrit,
                "translation": translation,
                "formats": formats,
                "commentary": None,
                "description": None,
                "tags": [category, sec_title],
                "link": f"#/shlokas?work={work_id}&verse={verse_num}"
            })

        available_formats = ["verses"]
        if any("interlinear" in v["formats"] for v in work_verses):
            available_formats.append("interlinear")
        if any("word_by_word" in v["formats"] for v in work_verses):
            available_formats.append("word_by_word")

        works.append({
            "id": work_id,
            "title": sec_title,
            "subtitle": f"{category} • {sec_title}",
            "author": author,
            "source": source,
            "category": category,
            "description": v_pre.strip(),
            "verse_count": len(work_verses),
            "available_formats": available_formats,
            "verses": work_verses
        })

    return works

def parse_kevalastakam():
    category = "Бхаджаны"
    work_id = "kevalastakam"
    title = "Шри Кевалаштакам"
    subtitle = "«Мадхурам мадхуребхйо ’пи» — Высшая слава Святого Имени"
    author = "Шрила Нилакантха Госвами"
    source = "«Панча-ратнам»"

    v_path = os.path.join(PRAYERS_DIR, "bhajana", "kevalastakam-ru-verses.md")
    i_path = os.path.join(PRAYERS_DIR, "bhajana", "kevalastakam-ru-interlinear.md")
    w_path = os.path.join(PRAYERS_DIR, "bhajana", "kevalastakam-ru-word-by-word.md")

    with open(v_path, "r", encoding="utf-8") as f:
        v_pre, v_all = parse_verses_markdown(f.read())
    with open(i_path, "r", encoding="utf-8") as f:
        _, i_all = parse_verses_markdown(f.read())
    with open(w_path, "r", encoding="utf-8") as f:
        _, w_all = parse_verses_markdown(f.read())

    # Only verses starting with "Стих"
    v_list = [item for item in v_all if item[0].startswith("Стих")]
    i_list = [item for item in i_all if item[0].startswith("Стих")]
    w_list = [item for item in w_all if item[0].startswith("Стих")]

    work_verses = []
    for idx in range(8):
        v_title, v_raw = v_list[idx]
        _, i_raw = i_list[idx]
        _, w_raw = w_list[idx]

        sanskrit_v, trans_v = parse_block_verses(v_raw)
        sanskrit_i, sub_i, lit_i = parse_block_interlinear(i_raw)
        sanskrit_w, wbw_w, lit_w = parse_block_wbw(w_raw)

        sanskrit = sanskrit_v
        translation = trans_v
        verse_num = idx + 1
        shloka_id = f"{work_id}-{verse_num}"

        formats = {
            "verses": {
                "sanskrit": sanskrit,
                "translation": translation
            },
            "interlinear": {
                "sanskrit": sanskrit_i or sanskrit,
                "interlinear_text": sub_i,
                "translation": lit_i or translation
            },
            "word_by_word": {
                "sanskrit": sanskrit_w or sanskrit,
                "word_by_word_text": wbw_w,
                "translation": lit_w or translation
            }
        }

        work_verses.append({
            "id": shloka_id,
            "work_id": work_id,
            "work_title": title,
            "work_category": category,
            "verse_number": verse_num,
            "title": v_title,
            "canonical_ref": f"Кевалаштакам {verse_num}",
            "sanskrit": sanskrit,
            "translation": translation,
            "formats": formats,
            "commentary": None,
            "description": None,
            "tags": [category, "Аштака", "Святое Имя"],
            "link": f"#/shlokas?work={work_id}&verse={verse_num}"
        })

    return {
        "id": work_id,
        "title": title,
        "subtitle": subtitle,
        "author": author,
        "source": source,
        "category": category,
        "description": "Восемь прекрасных молитв, раскрывающих несравненную сладость и спасительную силу Святого Имени Господа Хари.",
        "verse_count": len(work_verses),
        "available_formats": ["verses", "interlinear", "word_by_word"],
        "verses": work_verses
    }

def parse_bhakti_rasayana():
    br_path = os.path.join(WEB_DATA_DIR, "bhakti_rasayana.json")
    with open(br_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    category = "Священные книги"
    work_id = "bhakti-rasayana"
    title = data.get("title", "Шри Бхакти-расаяна (Эликсир преданности)")
    subtitle = data.get("subtitle", "Нектар преданности Святому Имени")
    author = data.get("author", "Шри Свами Б.В. Вана Махарадж")
    source = "Сборник шлок о Святом Имени"

    work_verses = []
    for idx, v in enumerate(data.get("verses", [])):
        verse_num = idx + 1
        sanskrit = v.get("sanskrit_iast") or v.get("book_translit", "")
        translation = clean_translation(v.get("translation_book_ru") or v.get("translation_canonical_ru", ""))
        wbw = clean_translation(v.get("word_for_word_ru") or v.get("word_for_word_en") or "")
        topic = v.get("topic", "")
        ref = v.get("canonical_ref") or v.get("book_ref")

        formats = {
            "verses": {
                "sanskrit": sanskrit,
                "translation": translation
            }
        }
        if wbw:
            formats["word_by_word"] = {
                "sanskrit": sanskrit,
                "word_by_word_text": wbw,
                "translation": translation
            }

        shloka_id = f"{work_id}-{verse_num}"
        work_verses.append({
            "id": shloka_id,
            "work_id": work_id,
            "work_title": title,
            "work_category": category,
            "verse_number": verse_num,
            "title": f"Стих {verse_num}" + (f" ({topic})" if topic else ""),
            "canonical_ref": ref,
            "sanskrit": sanskrit,
            "translation": translation,
            "formats": formats,
            "commentary": v.get("description"),
            "description": topic or v.get("category_title"),
            "tags": [category, v.get("category_title", "Бхакти-расаяна")],
            "link": f"#/shlokas?work={work_id}&verse={verse_num}"
        })

    return {
        "id": work_id,
        "title": title,
        "subtitle": subtitle,
        "author": author,
        "source": source,
        "category": category,
        "description": data.get("description", "Сборник 61 ключевого стиха о величии и расе воспевания Святого Имени Господа."),
        "verse_count": len(work_verses),
        "available_formats": ["verses", "word_by_word"],
        "verses": work_verses
    }

def parse_luchshie_krugi():
    lk_path = os.path.join(WEB_DATA_DIR, "luchshie_krugi.json")
    with open(lk_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    category = "Священные книги"
    work_id = "luchshie-krugi"
    title = data.get("title", "16 кругов — Лучшие круги джапы")
    subtitle = data.get("subtitle", "Настройки на каждый круг джапа-медитации")
    author = data.get("author", "Е.С. Бхакти Ананта Кришна Госвами")
    source = "Книга «16 кругов — Лучшие круги джапы»"

    work_verses = []
    # 16 rounds
    for r in data.get("rounds", []):
        round_num = r.get("round", len(work_verses) + 1)
        shloka = r.get("shloka", {})
        sanskrit = clean_sanskrit(shloka.get("sanskrit", ""))
        translation = clean_translation(shloka.get("translation", ""))
        ref = shloka.get("source", "")
        theme = r.get("theme", "")
        instruction = clean_translation(r.get("instruction", ""))

        shloka_id = f"{work_id}-round-{round_num}"
        work_verses.append({
            "id": shloka_id,
            "work_id": work_id,
            "work_title": title,
            "work_category": category,
            "verse_number": round_num,
            "title": f"Круг {round_num}: {theme}",
            "canonical_ref": ref,
            "sanskrit": sanskrit,
            "translation": translation,
            "formats": {
                "verses": {
                    "sanskrit": sanskrit,
                    "translation": translation
                }
            },
            "commentary": instruction,
            "description": f"Настройка на {round_num}-й круг джапы: {theme}",
            "tags": [category, "Джапа", f"Круг {round_num}"],
            "link": f"#/shlokas?work={work_id}&verse={round_num}"
        })

    # Completion prayers
    comp = data.get("completion_prayers", {})
    for idx, cp in enumerate(comp.get("prayers", [])):
        p_num = 16 + idx + 1
        p_title = cp.get("title", f"Молитва завершения {idx+1}")
        sanskrit = clean_sanskrit(cp.get("sanskrit", ""))
        translation = clean_translation(cp.get("translation", ""))
        ref = cp.get("source", "")

        shloka_id = f"{work_id}-prayer-{idx+1}"
        work_verses.append({
            "id": shloka_id,
            "work_id": work_id,
            "work_title": title,
            "work_category": category,
            "verse_number": p_num,
            "title": p_title,
            "canonical_ref": ref,
            "sanskrit": sanskrit,
            "translation": translation,
            "formats": {
                "verses": {
                    "sanskrit": sanskrit,
                    "translation": translation
                }
            },
            "commentary": cp.get("instruction"),
            "description": f"Молитва завершения джапы: {p_title}",
            "tags": [category, "Молитвы завершения"],
            "link": f"#/shlokas?work={work_id}&verse={p_num}"
        })

    return {
        "id": work_id,
        "title": title,
        "subtitle": subtitle,
        "author": author,
        "source": source,
        "category": category,
        "description": data.get("description", "Практическое руководство и шлоки-настройки на каждый из 16 кругов маха-мантры."),
        "verse_count": len(work_verses),
        "available_formats": ["verses"],
        "verses": work_verses
    }

def main():
    print("Generating refined shloka bank...")

    ms_id_map = {
        "Шри Гурваштака": "gurvastakam",
        "Вибхавари-шеша": "vibhavari-shesha",
        "Намасте Нрисимхайя": "namaste-nrisimhaya",
        "Туласи-пуджа": "tulasi-puja",
        "Десять оскорблений святого имени": "ten-offenses",
        "Шри Вайшнава-пранама": "vaishnava-pranama",
        "Шикшаштака": "shikshastakam",
        "Шри Према-дхвани": "prema-dhvani"
    }

    kp_id_map = {
        "Шри Гаура-арати": "gaura-arati",
        "Шри Шри Прабхупада-падма Ставаках (Прабхупада Дашакам)": "prabhupada-padma-stavakah",
        "Шри Шри Шад-Госвами-аштакам": "shad-goswami-astakam",
        "Шри Шачи-таная-аштакам": "shachi-tanaya-astakam",
        "Шри Шри Радха-крипа-катакша-стотрам": "radha-kripa-kataksha",
        "Шри Нанда-нандана-аштакам": "nanda-nandana-astakam",
        "Шри Дамодараштакам": "damodarastakam",
        "Предложение лампад (Дипа-дана) Шри Шри Радхика-Кешава Раю 🪔": "dipa-dana"
    }

    morning_works = parse_collection(
        os.path.join(PRAYERS_DIR, "morning-service", "morning-service-ru-verses.md"),
        os.path.join(PRAYERS_DIR, "morning-service", "morning-service-ru-interlinear.md"),
        os.path.join(PRAYERS_DIR, "morning-service", "morning-service-ru-word-by-word.md"),
        "Утренняя служба",
        ms_id_map
    )

    kartika_works = parse_collection(
        os.path.join(PRAYERS_DIR, "krtik-month", "kartika-prayers-ru-verses.md"),
        os.path.join(PRAYERS_DIR, "krtik-month", "kartika-prayers-ru-interlinear.md"),
        os.path.join(PRAYERS_DIR, "krtik-month", "kartika-prayers-ru-word-by-word.md"),
        "Молитвы Карттики",
        kp_id_map
    )

    kevala_work = parse_kevalastakam()
    br_work = parse_bhakti_rasayana()
    lk_work = parse_luchshie_krugi()

    all_works = [kevala_work] + morning_works + kartika_works + [br_work, lk_work]

    # Calculate categories
    cat_counts = {}
    total_shlokas = 0
    for w in all_works:
        cat = w["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        total_shlokas += w["verse_count"]

    categories = [
        {"id": "all", "title": "Все произведения", "works_count": len(all_works)},
        {"id": "morning", "title": "Утренняя служба", "works_count": cat_counts.get("Утренняя служба", 0)},
        {"id": "kartika", "title": "Молитвы Карттики", "works_count": cat_counts.get("Молитвы Карттики", 0)},
        {"id": "bhajana", "title": "Бхаджаны", "works_count": cat_counts.get("Бхаджаны", 0)},
        {"id": "books", "title": "Священные книги", "works_count": cat_counts.get("Священные книги", 0)}
    ]

    shloka_bank = {
        "version": "1.0.0",
        "updated_at": "2026-11-14T08:35:00Z",
        "total_works": len(all_works),
        "total_shlokas": total_shlokas,
        "categories": categories,
        "works": all_works
    }

    out_web = os.path.join(WEB_DATA_DIR, "shloka_bank.json")
    out_content = os.path.join(PRAYERS_DIR, "shloka_bank.json")

    with open(out_web, "w", encoding="utf-8") as f:
        json.dump(shloka_bank, f, ensure_ascii=False, indent=2)

    with open(out_content, "w", encoding="utf-8") as f:
        json.dump(shloka_bank, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {out_web} and {out_content}!")
    print(f"Total works: {len(all_works)}, Total shlokas: {total_shlokas}")

if __name__ == "__main__":
    main()
