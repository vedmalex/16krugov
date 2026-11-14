import { useEffect, useMemo, useState } from "preact/hooks";
import shlokaBankJson from "../data/shloka_bank.json";

export interface ShlokaFormatVerses {
  sanskrit: string;
  translation: string;
}

export interface ShlokaFormatInterlinear {
  sanskrit?: string;
  interlinear_text: string;
  translation: string;
}

export interface ShlokaFormatWbw {
  sanskrit?: string;
  word_by_word_text: string;
  translation: string;
}

export interface ShlokaFormats {
  verses: ShlokaFormatVerses;
  interlinear?: ShlokaFormatInterlinear;
  word_by_word?: ShlokaFormatWbw;
}

export interface ShlokaItem {
  id: string;
  work_id: string;
  work_title: string;
  work_category: string;
  verse_number: number;
  title: string;
  canonical_ref?: string | null;
  sanskrit: string;
  translation: string;
  formats: ShlokaFormats;
  commentary?: string | null;
  description?: string | null;
  tags?: string[];
  link: string;
}

export interface WorkItem {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  source?: string;
  category: string;
  description?: string;
  verse_count: number;
  available_formats: ("verses" | "interlinear" | "word_by_word")[];
  verses: ShlokaItem[];
}

export interface ShlokaCategory {
  id: string;
  title: string;
  works_count: number;
}

export interface ShlokaBankData {
  version: string;
  updated_at: string;
  total_works: number;
  total_shlokas: number;
  categories: ShlokaCategory[];
  works: WorkItem[];
}

const bank = shlokaBankJson as unknown as ShlokaBankData;

export const JAPA_TUNE_IN_KEY = "16krugov_active_tune_in";

export interface ActiveTuneIn {
  title: string;
  workTitle: string;
  canonicalRef?: string | null;
  sanskrit: string;
  translation: string;
  instruction?: string | null;
  link: string;
}

export function loadActiveTuneIn(): ActiveTuneIn | null {
  try {
    const raw = localStorage.getItem(JAPA_TUNE_IN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveTuneIn(tuneIn: ActiveTuneIn | null) {
  try {
    if (tuneIn) {
      localStorage.setItem(JAPA_TUNE_IN_KEY, JSON.stringify(tuneIn));
    } else {
      localStorage.removeItem(JAPA_TUNE_IN_KEY);
    }
  } catch {
    // ignore
  }
}

export function ShlokaBankPage() {
  // Parse hash query params: #/shlokas?work=damodarastakam&verse=1&format=interlinear&mode=single
  const hash = location.hash;
  const queryPart = hash.includes("?") ? hash.split("?")[1] : "";
  const params = new URLSearchParams(queryPart);

  const initialWorkId = params.get("work") || bank.works[0]?.id || "kevalastakam";
  const initialVerse = Number(params.get("verse")) || 1;
  const initialFormat = (params.get("format") as "verses" | "interlinear" | "word_by_word") || "verses";
  const initialMode = (params.get("mode") as "all" | "single") || "single";

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedWorkId, setSelectedWorkId] = useState<string>(initialWorkId);
  const [activeFormat, setActiveFormat] = useState<"verses" | "interlinear" | "word_by_word">(initialFormat);
  const [viewMode, setViewMode] = useState<"all" | "single">(initialMode);
  const [currentVerseNum, setCurrentVerseNum] = useState<number>(initialVerse);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync state to URL hash
  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (selectedWorkId) nextParams.set("work", selectedWorkId);
    if (currentVerseNum > 1 || viewMode === "single") nextParams.set("verse", String(currentVerseNum));
    if (activeFormat !== "verses") nextParams.set("format", activeFormat);
    if (viewMode !== "single") nextParams.set("mode", viewMode);

    const newHash = `#/shlokas?${nextParams.toString()}`;
    if (location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }, [selectedWorkId, currentVerseNum, activeFormat, viewMode]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const selectedWork = useMemo(() => {
    return bank.works.find((w) => w.id === selectedWorkId) || bank.works[0];
  }, [selectedWorkId]);

  // Adjust format if current work does not support activeFormat
  useEffect(() => {
    if (selectedWork && !selectedWork.available_formats.includes(activeFormat)) {
      setActiveFormat("verses");
    }
  }, [selectedWork, activeFormat]);

  // Ensure currentVerseNum is in range
  useEffect(() => {
    if (selectedWork && (currentVerseNum < 1 || currentVerseNum > selectedWork.verse_count)) {
      setCurrentVerseNum(1);
    }
  }, [selectedWork, currentVerseNum]);

  // Keyboard navigation for single verse mode
  useEffect(() => {
    if (viewMode !== "single" || !selectedWork) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentVerseNum((prev) => Math.max(1, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentVerseNum((prev) => Math.min(selectedWork.verse_count, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, selectedWork]);

  // Filtered works by category
  const categoryWorks = useMemo(() => {
    if (activeCategory === "all") return bank.works;
    const catTitleMap: Record<string, string> = {
      morning: "Утренняя служба",
      kartika: "Молитвы Карттики",
      bhajana: "Бхаджаны",
      books: "Священные книги",
    };
    const title = catTitleMap[activeCategory];
    return bank.works.filter((w) => w.category === title);
  }, [activeCategory]);

  // Search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matches: ShlokaItem[] = [];
    for (const work of bank.works) {
      for (const v of work.verses) {
        if (
          v.sanskrit.toLowerCase().includes(q) ||
          v.translation.toLowerCase().includes(q) ||
          v.title.toLowerCase().includes(q) ||
          (v.canonical_ref && v.canonical_ref.toLowerCase().includes(q)) ||
          (v.description && v.description.toLowerCase().includes(q))
        ) {
          matches.push(v);
        }
      }
    }
    return matches;
  }, [searchQuery]);

  const handleTuneInSelect = (v: ShlokaItem) => {
    saveActiveTuneIn({
      title: v.title,
      workTitle: v.work_title,
      canonicalRef: v.canonical_ref,
      sanskrit: v.sanskrit,
      translation: v.translation,
      instruction: v.commentary || v.description,
      link: v.link,
    });
    showToast(`«${v.title}» сохранена как настрой на джапу!`);
  };

  const handleCopyLink = (v: ShlokaItem) => {
    const fullUrl = `${window.location.origin}${window.location.pathname}#/shlokas?work=${v.work_id}&verse=${v.verse_number}&format=${activeFormat}&mode=single`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      showToast("Ссылка на шлоку скопирована в буфер!");
    });
  };

  const handleCopyText = (v: ShlokaItem) => {
    let text = `${v.work_title} — ${v.title}\n\n${v.sanskrit}\n\n`;
    if (activeFormat === "interlinear" && v.formats.interlinear) {
      // Strip HTML tags from interlinear for plain text copy
      const plainInter = v.formats.interlinear.interlinear_text.replace(/<[^>]+>/g, "");
      text += `Подстрочник:\n${plainInter}\n\nПеревод:\n${v.formats.interlinear.translation}`;
    } else if (activeFormat === "word_by_word" && v.formats.word_by_word) {
      text += `Пословный разбор:\n${v.formats.word_by_word.word_by_word_text}\n\nПеревод:\n${v.formats.word_by_word.translation}`;
    } else {
      text += `Перевод:\n${v.translation}`;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast("Текст шлоки скопирован!");
    });
  };

  return (
    <main class="shloka-bank-page">
      {/* Toast alert */}
      {toastMessage && (
        <div class="toast-notice" role="alert">
          <span>{toastMessage}</span>
          <a href="#/japa/16" class="toast-link">
            К джапе →
          </a>
        </div>
      )}

      <div class="shloka-bank-header">
        <a href="#/" class="back-link">
          ← На главную
        </a>
        <div class="header-content">
          <h1>Банк шлок и молитв</h1>
          <p class="lede">
            {bank.total_works} произведений · {bank.total_shlokas} шлок с переводами и пословными разборами
          </p>
        </div>
        <div class="header-actions-row">
          <a href="/reader/index.html" target="_blank" class="reader-link" title="Открыть классические страницы для чтения">
            📖 Мобильные издания (offline) ↗
          </a>
        </div>
      </div>

      {/* Search Input */}
      <div class="search-bar">
        <input
          type="search"
          placeholder="Поиск по санскриту, переводу, цитате или теме (например: мадхурам, прабхупада, BS 5.37)..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          aria-label="Поиск шлок"
        />
        {searchQuery && (
          <button class="ghost clear-btn" onClick={() => setSearchQuery("")} title="Очистить поиск">
            ✕
          </button>
        )}
      </div>

      {/* If Search Active */}
      {searchResults !== null ? (
        <section class="search-results-section">
          <h2>
            Результаты поиска: {searchResults.length}{" "}
            {searchResults.length === 1 ? "совпадение" : searchResults.length < 5 ? "совпадения" : "совпадений"}
          </h2>
          {searchResults.length === 0 ? (
            <p class="empty-state">Ничего не найдено по запросу «{searchQuery}». Попробуйте изменить ключевое слово.</p>
          ) : (
            <div class="shloka-cards-list">
              {searchResults.map((v) => (
                <ShlokaCard
                  key={v.id}
                  shloka={v}
                  format={activeFormat}
                  onTuneIn={() => handleTuneInSelect(v)}
                  onCopyLink={() => handleCopyLink(v)}
                  onCopyText={() => handleCopyText(v)}
                  onSelectWork={() => {
                    setSelectedWorkId(v.work_id);
                    setCurrentVerseNum(v.verse_number);
                    setSearchQuery("");
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Normal Browsing Mode */
        <>
          {/* Category Tabs */}
          <nav class="category-tabs" aria-label="Категории произведений">
            {bank.categories.map((cat) => (
              <button
                key={cat.id}
                class={`category-tab ${activeCategory === cat.id ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  const firstInCat =
                    cat.id === "all"
                      ? bank.works[0]
                      : bank.works.find((w) => {
                          const catTitleMap: Record<string, string> = {
                            morning: "Утренняя служба",
                            kartika: "Молитвы Карттики",
                            bhajana: "Бхаджаны",
                            books: "Священные книги",
                          };
                          return w.category === catTitleMap[cat.id];
                        });
                  if (firstInCat) {
                    setSelectedWorkId(firstInCat.id);
                    setCurrentVerseNum(1);
                  }
                }}
              >
                {cat.title} <span class="badge-count">{cat.works_count}</span>
              </button>
            ))}
          </nav>

          {/* Work Selector */}
          <div class="work-picker">
            <label for="work-select" class="picker-label">
              Произведение:
            </label>
            <select
              id="work-select"
              class="work-select"
              value={selectedWorkId}
              onChange={(e) => {
                setSelectedWorkId((e.target as HTMLSelectElement).value);
                setCurrentVerseNum(1);
              }}
            >
              {categoryWorks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} ({w.verse_count} {w.verse_count === 1 ? "стих" : w.verse_count < 5 ? "стиха" : "стихов"})
                </option>
              ))}
            </select>
          </div>

          {/* Work Info Banner */}
          {selectedWork && (
            <div class="work-hero-card">
              <div class="work-hero-meta">
                <span class="category-pill">{selectedWork.category}</span>
                {selectedWork.author && <span class="author-label">Автор: {selectedWork.author}</span>}
                {selectedWork.source && <span class="source-label">Источник: {selectedWork.source}</span>}
              </div>
              <h2 class="work-hero-title">{selectedWork.title}</h2>
              {selectedWork.subtitle && <p class="work-hero-subtitle">{selectedWork.subtitle}</p>}
              {selectedWork.description && <p class="work-hero-desc">{selectedWork.description}</p>}

              {/* Controls bar: Formats + Mode */}
              <div class="view-controls-bar">
                {/* Format Pills */}
                <div class="control-group">
                  <span class="control-label">Формат текста:</span>
                  <div class="format-pills">
                    <button
                      class={`format-pill ${activeFormat === "verses" ? "active" : ""}`}
                      onClick={() => setActiveFormat("verses")}
                    >
                      📖 Шлока и перевод
                    </button>
                    {selectedWork.available_formats.includes("interlinear") && (
                      <button
                        class={`format-pill ${activeFormat === "interlinear" ? "active" : ""}`}
                        onClick={() => setActiveFormat("interlinear")}
                      >
                        🔍 Связный подстрочник
                      </button>
                    )}
                    {selectedWork.available_formats.includes("word_by_word") && (
                      <button
                        class={`format-pill ${activeFormat === "word_by_word" ? "active" : ""}`}
                        onClick={() => setActiveFormat("word_by_word")}
                      >
                        📝 Пословный разбор
                      </button>
                    )}
                  </div>
                </div>

                {/* Mode Switcher */}
                <div class="control-group">
                  <span class="control-label">Режим просмотра:</span>
                  <div class="mode-pills">
                    <button
                      class={`mode-pill ${viewMode === "single" ? "active" : ""}`}
                      onClick={() => setViewMode("single")}
                    >
                      По одной шлоке
                    </button>
                    <button
                      class={`mode-pill ${viewMode === "all" ? "active" : ""}`}
                      onClick={() => setViewMode("all")}
                    >
                      Всё произведение ({selectedWork.verse_count})
                    </button>
                  </div>
                </div>
              </div>

              {/* Single Verse Pagination Selector */}
              {viewMode === "single" && (
                <div class="single-nav-panel">
                  <div class="nav-buttons-row">
                    <button
                      class="ghost nav-btn"
                      disabled={currentVerseNum <= 1}
                      onClick={() => setCurrentVerseNum((prev) => Math.max(1, prev - 1))}
                    >
                      ← Предыдущая
                    </button>
                    <span class="nav-counter">
                      Шлока {currentVerseNum} из {selectedWork.verse_count}
                    </span>
                    <button
                      class="ghost nav-btn"
                      disabled={currentVerseNum >= selectedWork.verse_count}
                      onClick={() => setCurrentVerseNum((prev) => Math.min(selectedWork.verse_count, prev + 1))}
                    >
                      Следующая →
                    </button>
                  </div>
                  {/* Quick Jump Pills */}
                  {selectedWork.verse_count > 1 && (
                    <div class="verse-pills-row">
                      {selectedWork.verses.map((v) => (
                        <button
                          key={v.id}
                          class={`verse-pill ${currentVerseNum === v.verse_number ? "active" : ""}`}
                          onClick={() => setCurrentVerseNum(v.verse_number)}
                          title={v.title}
                        >
                          {v.verse_number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Verses Display */}
          {selectedWork && (
            <div class="verses-container">
              {viewMode === "single" ? (
                (() => {
                  const currentVerse =
                    selectedWork.verses.find((v) => v.verse_number === currentVerseNum) || selectedWork.verses[0];
                  return currentVerse ? (
                    <ShlokaCard
                      key={currentVerse.id}
                      shloka={currentVerse}
                      format={activeFormat}
                      onTuneIn={() => handleTuneInSelect(currentVerse)}
                      onCopyLink={() => handleCopyLink(currentVerse)}
                      onCopyText={() => handleCopyText(currentVerse)}
                    />
                  ) : null;
                })()
              ) : (
                <div class="shloka-cards-list">
                  {selectedWork.verses.map((v) => (
                    <ShlokaCard
                      key={v.id}
                      shloka={v}
                      format={activeFormat}
                      onTuneIn={() => handleTuneInSelect(v)}
                      onCopyLink={() => handleCopyLink(v)}
                      onCopyText={() => handleCopyText(v)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function ShlokaCard({
  shloka,
  format,
  onTuneIn,
  onCopyLink,
  onCopyText,
  onSelectWork,
}: {
  shloka: ShlokaItem;
  format: "verses" | "interlinear" | "word_by_word";
  onTuneIn: () => void;
  onCopyLink: () => void;
  onCopyText: () => void;
  onSelectWork?: () => void;
}) {
  const isInterlinear = format === "interlinear" && shloka.formats.interlinear;
  const isWbw = format === "word_by_word" && shloka.formats.word_by_word;

  return (
    <article class="shloka-card">
      <header class="shloka-card-header">
        <div class="header-titles">
          <span class="shloka-badge">
            {shloka.work_title} · {shloka.title}
          </span>
          {shloka.canonical_ref && <span class="ref-badge">{shloka.canonical_ref}</span>}
        </div>
        <div class="card-quick-actions">
          <button class="ghost icon-btn" onClick={onCopyLink} title="Скопировать постоянную ссылку">
            🔗
          </button>
          <button class="ghost icon-btn" onClick={onCopyText} title="Скопировать текст шлоки">
            📋
          </button>
          <button class="solid tune-in-btn" onClick={onTuneIn} title="Использовать как настрой на джапу">
            ★ Настрой на джапу
          </button>
        </div>
      </header>

      {/* Sanskrit block */}
      {shloka.sanskrit && (
        <div class="sanskrit-box">
          <pre class="sanskrit-text">{shloka.sanskrit}</pre>
        </div>
      )}

      {/* Body depending on format */}
      <div class="translation-body">
        {isInterlinear ? (
          <div class="interlinear-block">
            <h4 class="format-title">Связный пословный перевод:</h4>
            <div
              class="interlinear-html"
              dangerouslySetInnerHTML={{
                __html: shloka.formats.interlinear!.interlinear_text,
              }}
            />
            {shloka.formats.interlinear!.translation && (
              <div class="literary-subblock">
                <h5 class="subblock-title">Литературный перевод:</h5>
                <p class="translation-text">{shloka.formats.interlinear!.translation}</p>
              </div>
            )}
          </div>
        ) : isWbw ? (
          <div class="wbw-block">
            <h4 class="format-title">Пословный разбор:</h4>
            <div class="wbw-content">
              {shloka.formats.word_by_word!.word_by_word_text.split("\n").map((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed) return null;
                return (
                  <p key={idx} class="wbw-line">
                    {trimmed.startsWith("*") ? trimmed.slice(1).trim() : trimmed}
                  </p>
                );
              })}
            </div>
            {shloka.formats.word_by_word!.translation && (
              <div class="literary-subblock">
                <h5 class="subblock-title">Перевод:</h5>
                <p class="translation-text">{shloka.formats.word_by_word!.translation}</p>
              </div>
            )}
          </div>
        ) : (
          <div class="verses-block">
            <p class="translation-text">{shloka.translation}</p>
          </div>
        )}

        {/* Commentary / Instructions if present */}
        {shloka.commentary && (
          <div class="commentary-box">
            <strong class="commentary-title">Пояснение / Наставление:</strong>
            <p class="commentary-text">{shloka.commentary}</p>
          </div>
        )}
      </div>

      {onSelectWork && (
        <footer class="shloka-card-footer">
          <button class="ghost jump-work-btn" onClick={onSelectWork}>
            Перейти к произведению «{shloka.work_title}» →
          </button>
        </footer>
      )}
    </article>
  );
}
