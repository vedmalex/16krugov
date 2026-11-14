import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  JAPA_CATALOG_UNITS,
  JAPA_COMPLETION_PRAYERS,
  JAPA_LAYOUT_LABELS,
  JAPA_PRELIMINARY_CONDITIONS,
  JAPA_RASAYANA_RAW,
  JAPA_ROUNDS_RAW,
  clearActiveJapaSession,
  loadJapaCollections,
  loadJapaDisplay,
  loadJapaSession,
  saveJapaCollections,
  saveJapaDisplay,
  saveJapaSession,
} from "./japa-catalog";
import {
  JAPA_TARGETS,
  advanceRound,
  buildJapaSequence,
  canTriggerNextRound,
  computeAverageRoundMs,
  computeRoundElapsedMs,
  computeTotalElapsedMs,
  formatRounds,
  hasVisibleDisplayLayer,
  japaTime,
  toggleSessionPause,
  undoRoundCompletion,
  type JapaCollections,
  type JapaDisplayPrefs,
  type JapaLayoutId,
  type JapaSession,
  type JapaUndoSnapshot,
} from "./japa-model";
import { loadActiveTuneIn, saveActiveTuneIn, type ActiveTuneIn } from "./shlokas";

type DrawerKind = null | "fulltext" | "settings" | "history" | "layouts";

function renderSvgIcon(kind: "play" | "pause" | "settings" | "history" | "back" | "close") {
  const paths: Record<typeof kind, string> = {
    play: "M7 5v14l12-7z",
    pause: "M7 5h3.5v14H7zm6.5 0H17v14h-3.5z",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5a7.7 7.7 0 0 0 0-1l2-1.5-2-3.4-2.4 1a7.3 7.3 0 0 0-.9-.5l-.4-2.6h-4l-.4 2.6-.9.5-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 1l-2 1.5 2 3.4 2.4-1 .9.5.4 2.6h4l.4-2.6.9-.5 2.4 1 2-3.4-2-1.5Z",
    history: "M4 6v5h5M4.5 11a8 8 0 1 1 2 6M12 7v5l3 2",
    back: "M15 5l-7 7 7 7",
    close: "M6 6l12 12M18 6 6 18",
  };
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  );
}

export function JapaPage({ target }: { target: number }) {
  const [savedAny] = useState<JapaSession | null>(() => loadJapaSession());
  const [session, setSession] = useState<JapaSession | null>(() => {
    const saved = loadJapaSession();
    return saved && saved.target === target ? saved : null;
  });
  const [recoveryCandidate, setRecoveryCandidate] = useState<JapaSession | null>(() => {
    const saved = loadJapaSession();
    if (!saved || saved.completed) return null;
    // Show explicit recovery banner when reloading mid-session or opening a different target
    return saved;
  });

  const [now, setNow] = useState(() => Date.now());
  const [storageError, setStorageError] = useState("");
  const [textIndex, setTextIndex] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [customTuneIn, setCustomTuneIn] = useState<ActiveTuneIn | null>(loadActiveTuneIn);
  const [display, setDisplay] = useState<JapaDisplayPrefs>(loadJapaDisplay);
  const [collections, setCollections] = useState<JapaCollections>(loadJapaCollections);
  const [prepConditionIdx, setPrepConditionIdx] = useState(0);
  const [undoSnapshot, setUndoSnapshot] = useState<JapaUndoSnapshot | null>(null);
  const [layoutSearch, setLayoutSearch] = useState("");

  const lastNextClickAtRef = useRef(0);
  const undoTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const started = session !== null;
  const completed = session?.completed ?? false;
  const isPaused = session ? session.roundStartedAt === null : false;
  const round = (session?.durations.length ?? 0) + 1;
  const activeLayoutId: JapaLayoutId = session?.layoutId ?? display.layoutId;

  const sequence = useMemo(
    () =>
      buildJapaSequence(
        target,
        activeLayoutId,
        JAPA_ROUNDS_RAW,
        JAPA_RASAYANA_RAW,
        collections.customRoundIds,
        customTuneIn,
      ),
    [target, activeLayoutId, collections.customRoundIds, customTuneIn],
  );

  const autoIndex = Math.min(Math.max(0, round - 1), Math.max(0, sequence.length - 1));
  const shownIndex = textIndex !== null ? Math.min(Math.max(0, textIndex), Math.max(0, sequence.length - 1)) : autoIndex;
  const textLocked = textIndex !== null && shownIndex !== autoIndex;
  const currentUnit = sequence[shownIndex] ?? JAPA_CATALOG_UNITS[0];

  const roundElapsed = computeRoundElapsedMs(session, now);
  const totalElapsed = computeTotalElapsedMs(session, now);

  // Apply dimmed stand mode + independent reading scale to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (display.standMode) {
      root.dataset.stand = "dim";
    } else {
      delete root.dataset.stand;
    }
    root.style.setProperty("--reading-scale", String(display.readingScale));
    return () => {
      delete root.dataset.stand;
    };
  }, [display.standMode, display.readingScale]);

  // Reload route-scoped session when target changes
  useEffect(() => {
    setCustomTuneIn(loadActiveTuneIn());
    const saved = loadJapaSession();
    if (saved && saved.target === target) {
      setSession(saved);
      setRecoveryCandidate(!saved.completed ? saved : null);
    } else {
      setSession(null);
      setRecoveryCandidate(saved && !saved.completed ? saved : null);
    }
    setTextIndex(null);
    setDrawer(null);
    setUndoSnapshot(null);
  }, [target]);

  // 1-second monotonic timer tick while actively chanting
  useEffect(() => {
    if (!session || session.roundStartedAt === null || session.completed) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.roundStartedAt, session?.completed]);

  // Screen Wake Lock during active reading
  useEffect(() => {
    const shouldKeepAwake = Boolean(started && !completed && !isPaused);
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!shouldKeepAwake) {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }
    let cancelled = false;
    if (nav.wakeLock?.request) {
      nav.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (cancelled) {
            void sentinel.release().catch(() => {});
          } else {
            wakeLockRef.current = sentinel;
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [started, completed, isPaused]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  function persistSession(next: JapaSession) {
    setSession(next);
    if (saveJapaSession(next)) {
      setStorageError("");
    } else {
      setStorageError("Не удалось сохранить статистику в браузере. Сессия продолжается в памяти.");
    }
  }

  function updateDisplay(patch: Partial<JapaDisplayPrefs>) {
    const next = { ...display, ...patch };
    setDisplay(next);
    if (saveJapaDisplay(next)) {
      setStorageError("");
    } else {
      setStorageError("Не удалось сохранить настройки отображения.");
    }
  }

  function updateCollections(next: JapaCollections) {
    setCollections(next);
    if (!saveJapaCollections(next)) {
      setStorageError("Не удалось сохранить пользовательскую подборку.");
    }
  }

  function handleStartSession() {
    const time = Date.now();
    setNow(time);
    setRecoveryCandidate(null);
    setTextIndex(null);
    persistSession({
      id: crypto.randomUUID(),
      target,
      startedAt: time,
      roundStartedAt: time,
      elapsedMs: 0,
      durations: [],
      completed: false,
      layoutId: display.layoutId,
    });
  }

  function handleTogglePause() {
    if (!session || session.completed) return;
    const time = Date.now();
    setNow(time);
    persistSession(toggleSessionPause(session, time));
  }

  function handleStepText(delta: number) {
    const nextIdx = Math.min(sequence.length - 1, Math.max(0, shownIndex + delta));
    if (nextIdx === shownIndex) return;
    setTextIndex(nextIdx === autoIndex ? null : nextIdx);
  }

  function handleNextRound() {
    if (!session || session.completed) return;
    const time = Date.now();
    if (!canTriggerNextRound(lastNextClickAtRef.current, time, 800)) return;
    lastNextClickAtRef.current = time;

    // Gentle haptic feedback on supported mobile devices
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(45);
      } catch {
        // ignore unsupported vibrate restrictions
      }
    }

    const { nextSession, undoSnapshot: snap } = advanceRound(session, time);
    setNow(time);
    setRecoveryCandidate(null);
    persistSession(nextSession);

    if (!nextSession.completed) {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      setUndoSnapshot(snap);
      undoTimerRef.current = window.setTimeout(() => {
        setUndoSnapshot(null);
      }, 3000);
    } else {
      setUndoSnapshot(null);
    }
  }

  function handleUndoRound() {
    if (!undoSnapshot) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    const time = Date.now();
    setNow(time);
    const restored = undoRoundCompletion(undoSnapshot, time, isPaused);
    setUndoSnapshot(null);
    persistSession(restored);
  }

  function handleLaunchWarmup(exerciseHash = "train/v13?queue=daily-18&at=0") {
    if (session && !session.completed && session.roundStartedAt !== null) {
      const time = Date.now();
      setNow(time);
      persistSession(toggleSessionPause(session, time));
    }
    const sep = exerciseHash.includes("?") ? "&" : "?";
    location.hash = `#/${exerciseHash}${sep}returnTo=${encodeURIComponent(`japa/${target}`)}`;
  }

  function handleToggleFavoriteUnit(unitId: string) {
    const exists = collections.favorites.includes(unitId);
    updateCollections({
      ...collections,
      favorites: exists
        ? collections.favorites.filter((id) => id !== unitId)
        : [...collections.favorites, unitId],
    });
  }

  // Keyboard shortcuts during active reading
  useEffect(() => {
    if (!started || completed) return;
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(el.tagName)) {
        if (event.key === "Escape" && drawer) {
          event.preventDefault();
          setDrawer(null);
        }
        return;
      }
      if (event.key === "Escape") {
        if (drawer) {
          event.preventDefault();
          setDrawer(null);
        } else {
          event.preventDefault();
          handleTogglePause();
        }
      } else if (drawer) {
        return;
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleStepText(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleStepText(1);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        handleNextRound();
      } else if (event.key === "p" || event.key === "P" || event.key === "з" || event.key === "З") {
        event.preventDefault();
        handleTogglePause();
      } else if (event.key === "r" || event.key === "R" || event.key === "к" || event.key === "К") {
        event.preventDefault();
        setTextIndex(null);
      } else if (event.key === "f" || event.key === "F" || event.key === "а" || event.key === "А") {
        event.preventDefault();
        setDrawer("fulltext");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function renderDrawer() {
    if (!drawer) return null;

    if (drawer === "fulltext" && currentUnit) {
      return (
        <div class="japa-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside class="japa-drawer" role="dialog" aria-modal="true" aria-label="Полный текст" onClick={(e) => e.stopPropagation()}>
            <div class="japa-drawer-header">
              <div>
                <span class="japa-reading-index">{currentUnit.workTitle}</span>
                <h3>{currentUnit.title}</h3>
              </div>
              <button class="ghost icon-button" type="button" aria-label="Закрыть" onClick={() => setDrawer(null)}>
                {renderSvgIcon("close")}
              </button>
            </div>
            <p class="meta">Таймер круга и сессии продолжает идти в фоне.</p>
            {currentUnit.canonicalRef && <span class="ref-badge">{currentUnit.canonicalRef}</span>}
            {currentUnit.sanskrit && <pre class="sanskrit-text">{currentUnit.sanskrit}</pre>}
            {currentUnit.translation && <p class="translation-text">{currentUnit.translation}</p>}
            {currentUnit.instruction && <p class="japa-instruction-text">{currentUnit.instruction}</p>}
            {currentUnit.commentary && <p class="meta">{currentUnit.commentary}</p>}
            <div class="japa-drawer-actions">
              <button class="ghost" type="button" disabled={shownIndex <= 0} onClick={() => handleStepText(-1)}>
                ‹ Предыдущий
              </button>
              <button class="ghost" type="button" disabled={shownIndex >= sequence.length - 1} onClick={() => handleStepText(1)}>
                Следующий ›
              </button>
              {currentUnit.link && (
                <a class="ghost" href={currentUnit.link}>
                  Открыть в банке шлок
                </a>
              )}
            </div>
          </aside>
        </div>
      );
    }

    if (drawer === "settings") {
      return (
        <div class="japa-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside class="japa-drawer" role="dialog" aria-modal="true" aria-label="Настройки чтения" onClick={(e) => e.stopPropagation()}>
            <div class="japa-drawer-header">
              <h3>Настройки чтения</h3>
              <button class="ghost" type="button" onClick={() => setDrawer(null)}>Готово</button>
            </div>

            <div class="japa-drawer-section">
              <strong>Показывать и курсив</strong>
              <div class="japa-settings-grid">
                <label class="japa-check"><input type="checkbox" checked={display.sanskrit} onChange={(e) => updateDisplay({ sanskrit: e.currentTarget.checked })} />Санскрит</label>
                <label class="japa-check"><input type="checkbox" checked={display.italicSanskrit} onChange={(e) => updateDisplay({ italicSanskrit: e.currentTarget.checked })} />Курсив санскр.</label>
                <label class="japa-check"><input type="checkbox" checked={display.translation} onChange={(e) => updateDisplay({ translation: e.currentTarget.checked })} />Перевод</label>
                <label class="japa-check"><input type="checkbox" checked={display.italicTranslation} onChange={(e) => updateDisplay({ italicTranslation: e.currentTarget.checked })} />Курсив перев.</label>
                <label class="japa-check"><input type="checkbox" checked={display.instruction} onChange={(e) => updateDisplay({ instruction: e.currentTarget.checked })} />Настройка</label>
                <label class="japa-check"><input type="checkbox" checked={display.italicInstruction} onChange={(e) => updateDisplay({ italicInstruction: e.currentTarget.checked })} />Курсив настр.</label>
              </div>
            </div>

            <label class="japa-slider-field">
              <span>Размер текста чтения: <strong>{Math.round(display.readingScale * 100)}%</strong></span>
              <input
                type="range"
                min={85}
                max={160}
                step={5}
                value={Math.round(display.readingScale * 100)}
                onInput={(e) => updateDisplay({ readingScale: Number(e.currentTarget.value) / 100 })}
              />
            </label>

            <div class="japa-drawer-section">
              <label class="japa-check">
                <input type="checkbox" checked={display.standMode} onChange={(e) => updateDisplay({ standMode: e.currentTarget.checked })} />
                Режим на подставке (приглушённый тёмный)
              </label>
              <label class="japa-check">
                <input type="checkbox" checked={display.leftHanded} onChange={(e) => updateDisplay({ leftHanded: e.currentTarget.checked })} />
                Панель круга слева (в горизонтальном режиме)
              </label>
            </div>

            <div class="japa-drawer-section">
              <label class="field">
                Раскладка погружения
                <select
                  value={display.layoutId}
                  onChange={(e) => {
                    const nextLayout = e.currentTarget.value as JapaLayoutId;
                    updateDisplay({ layoutId: nextLayout });
                    if (session) persistSession({ ...session, layoutId: nextLayout });
                  }}
                >
                  {(Object.keys(JAPA_LAYOUT_LABELS) as JapaLayoutId[]).map((id) => (
                    <option key={id} value={id}>{JAPA_LAYOUT_LABELS[id]}</option>
                  ))}
                </select>
              </label>
              <button class="ghost" type="button" onClick={() => setDrawer("layouts")}>
                Наполнить круги своей подборкой
              </button>
            </div>

            {started && !completed && (
              <div class="japa-drawer-section">
                <strong>Артикуляция</strong>
                <button class="ghost" type="button" onClick={() => handleLaunchWarmup()}>
                  Размять речь (таймер джапы на паузе)
                </button>
              </div>
            )}
          </aside>
        </div>
      );
    }

    if (drawer === "layouts") {
      const needle = layoutSearch.trim().toLowerCase();
      const filteredOptions = JAPA_CATALOG_UNITS.filter((unit) => {
        if (!needle) return true;
        return (
          unit.title.toLowerCase().includes(needle) ||
          unit.workTitle.toLowerCase().includes(needle) ||
          (unit.canonicalRef ?? "").toLowerCase().includes(needle)
        );
      });

      return (
        <div class="japa-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside class="japa-drawer" role="dialog" aria-modal="true" aria-label="Наполнение кругов" onClick={(e) => e.stopPropagation()}>
            <div class="japa-drawer-header">
              <h3>Наполнение кругов ({target})</h3>
              <button class="ghost" type="button" onClick={() => setDrawer("settings")}>← Назад</button>
            </div>
            <p class="meta">Назначьте тексты на отдельные круги по принципу пользовательских блоков. Пустые слоты берут каноническую раскладку.</p>
            <input
              type="search"
              placeholder="Фильтр текстов (название, стих)..."
              value={layoutSearch}
              onInput={(e) => setLayoutSearch(e.currentTarget.value)}
            />
            <div class="japa-custom-rounds-list">
              {Array.from({ length: target }, (_, idx) => {
                const roundNum = idx + 1;
                const currentAssigned = collections.customRoundIds[roundNum] ?? "";
                return (
                  <label key={roundNum} class="japa-round-assign-row">
                    <span>Круг {roundNum}</span>
                    <select
                      value={currentAssigned}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        const nextMap = { ...collections.customRoundIds };
                        if (!val) delete nextMap[roundNum];
                        else nextMap[roundNum] = val;
                        updateCollections({ ...collections, customRoundIds: nextMap });
                      }}
                    >
                      <option value="">По умолчанию ({sequence[idx]?.title.slice(0, 28)}…)</option>
                      {filteredOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {collections.favorites.includes(opt.id) ? "★ " : ""}
                          {opt.workId === "luchshie-krugi" ? "ЛК" : "БР"} · {opt.title}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <div class="japa-drawer-actions">
              <button
                class="solid"
                type="button"
                onClick={() => {
                  updateDisplay({ layoutId: "custom" });
                  if (session) persistSession({ ...session, layoutId: "custom" });
                  setDrawer(null);
                }}
              >
                Применить мою подборку
              </button>
              <button
                class="ghost"
                type="button"
                onClick={() => updateCollections({ ...collections, customRoundIds: {} })}
              >
                Сбросить слоты
              </button>
            </div>
          </aside>
        </div>
      );
    }

    if (drawer === "history") {
      const completedDurations = session?.durations ?? [];
      const avgMs = computeAverageRoundMs(completedDurations);
      return (
        <div class="japa-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside class="japa-drawer" role="dialog" aria-modal="true" aria-label="История кругов" onClick={(e) => e.stopPropagation()}>
            <div class="japa-drawer-header">
              <h3>История кругов ({completedDurations.length} из {target})</h3>
              <button class="ghost icon-button" type="button" aria-label="Закрыть" onClick={() => setDrawer(null)}>
                {renderSvgIcon("close")}
              </button>
            </div>
            <p class="tabular-nums">
              Всего: <strong>{japaTime(totalElapsed)}</strong> · Средний круг: <strong>{japaTime(avgMs)}</strong>
            </p>
            {completedDurations.length === 0 ? (
              <p class="meta">Завершённых кругов в этой сессии пока нет.</p>
            ) : (
              <ol class="japa-round-durations tabular-nums">
                {completedDurations.map((dur, idx) => (
                  <li key={idx}>
                    Круг {idx + 1}: <strong>{japaTime(dur)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      );
    }

    return null;
  }

  // 1. Completion state
  if (completed && session) {
    const totalCompletedMs = session.durations.reduce((sum, d) => sum + d, 0);
    const avgMs = computeAverageRoundMs(session.durations);
    return (
      <main class="japa-page">
        <div class="japa-top-bar">
          <a class="ghost" href="#/">← Главная</a>
          <strong>Практика завершена</strong>
          <button class="ghost icon-button" type="button" aria-label="Настройки отображения" onClick={() => setDrawer("settings")}>
            {renderSvgIcon("settings")}
          </button>
        </div>
        {storageError && <p class="notice" role="alert">{storageError}</p>}
        <article class="japa-card completion-card">
          <h2>Завершено: {formatRounds(target)}</h2>
          <p class="tabular-nums">
            Общее время: <strong>{japaTime(totalCompletedMs)}</strong> · Средний круг: <strong>{japaTime(avgMs)}</strong>
          </p>
          <ol class="japa-round-durations tabular-nums">
            {session.durations.map((duration, index) => (
              <li key={index}>Круг {index + 1}: {japaTime(duration)}</li>
            ))}
          </ol>

          <p class="lede">Молитвы по окончании джапы:</p>
          <div class="completion-prayers-list">
            {JAPA_COMPLETION_PRAYERS.map((p) => (
              <div key={p.id} class="completion-prayer-item">
                <h3>{p.title}</h3>
                {display.sanskrit && p.sanskrit && (
                  <pre class="sanskrit-text" style={{ fontStyle: display.italicSanskrit ? "italic" : "normal" }}>{p.sanskrit}</pre>
                )}
                {display.translation && (
                  <p class="translation-text" style={{ fontStyle: display.italicTranslation ? "italic" : "normal" }}>{p.translation}</p>
                )}
                {display.instruction && p.source && (
                  <p class="meta" style={{ fontStyle: display.italicInstruction ? "italic" : "normal" }}>{p.source}</p>
                )}
              </div>
            ))}
          </div>

          <div class="japa-drawer-actions">
            <a class="solid" href="#/">← На главную</a>
            <button
              class="ghost"
              type="button"
              onClick={() => {
                setSession(null);
                setRecoveryCandidate(null);
                clearActiveJapaSession();
              }}
            >
              Повторить джапу
            </button>
            <a class="ghost" href="#/shlokas">Банк шлок</a>
          </div>
        </article>
        {renderDrawer()}
      </main>
    );
  }

  // 2. Preparation state
  if (!started) {
    const activeCondition = JAPA_PRELIMINARY_CONDITIONS[prepConditionIdx] ?? JAPA_PRELIMINARY_CONDITIONS[0];
    const hasForeignRecovery = recoveryCandidate && recoveryCandidate.target !== target;
    return (
      <main class="japa-page">
        <div class="japa-top-bar">
          <a class="ghost" href="#/">← Главная</a>
          <strong>Подготовка к джапе</strong>
          <button class="ghost icon-button" type="button" aria-label="Настройки отображения" onClick={() => setDrawer("settings")}>
            {renderSvgIcon("settings")}
          </button>
        </div>

        {storageError && <p class="notice" role="alert">{storageError}</p>}

        {hasForeignRecovery && recoveryCandidate && (
          <div class="japa-recovery-banner" role="region" aria-label="Восстановление сессии">
            <div>
              <strong>Найдена незавершённая сессия:</strong> круг {recoveryCandidate.durations.length + 1} из {recoveryCandidate.target} ({recoveryCandidate.roundStartedAt === null ? "на паузе" : "активна"}).
            </div>
            <div class="japa-recovery-actions">
              <a class="solid" href={`#/japa/${recoveryCandidate.target}`}>Продолжить ({recoveryCandidate.target})</a>
              <button
                class="ghost"
                type="button"
                onClick={() => {
                  clearActiveJapaSession();
                  setRecoveryCandidate(null);
                }}
              >
                Сбросить
              </button>
            </div>
          </div>
        )}

        <div class="japa-prep-grid">
          <section class="japa-card">
            <h2>1. Подготовка артикуляции</h2>
            <p class="meta">Разомните речевой аппарат перед повторением святых имён, затем вернитесь прямо к старту.</p>
            <div class="japa-drawer-actions">
              <button class="ghost" type="button" onClick={() => handleLaunchWarmup("train/v13?queue=daily-18&at=0")}>
                Экспресс-разминка
              </button>
              <button class="ghost" type="button" onClick={() => handleLaunchWarmup("train/tt-01")}>
                Скороговорка
              </button>
              <a class="ghost" href="#/list/vowels">Каталог упражнений</a>
            </div>
          </section>

          <section class="japa-card">
            <h2>2. Цель и раскладка погружения</h2>
            <div class="target-grid" aria-label="Выбор цели кругов">
              {JAPA_TARGETS.map((n) => (
                <a
                  key={n}
                  class={`chip ${n === target ? "is-selected" : ""}`}
                  href={`#/japa/${n}`}
                  aria-current={n === target ? "true" : undefined}
                >
                  {formatRounds(n)}
                </a>
              ))}
            </div>
            <p class="meta">Раскладка: <strong>{JAPA_LAYOUT_LABELS[display.layoutId]}</strong></p>
            <button class="ghost" type="button" onClick={() => setDrawer("layouts")}>
              Наполнить круги своей подборкой
            </button>
          </section>
        </div>

        <article class="japa-card">
          <h2>{customTuneIn ? `Настрой: ${customTuneIn.workTitle} — ${customTuneIn.title}` : "Настрой перед 1-м кругом"}</h2>
          {customTuneIn ? (
            <div class="custom-tune-in-box">
              {customTuneIn.canonicalRef && <p class="ref-badge">{customTuneIn.canonicalRef}</p>}
              {display.sanskrit && customTuneIn.sanskrit && (
                <pre class="sanskrit-text" style={{ fontStyle: display.italicSanskrit ? "italic" : "normal" }}>{customTuneIn.sanskrit}</pre>
              )}
              {display.translation && (
                <p class="translation-text" style={{ fontStyle: display.italicTranslation ? "italic" : "normal" }}>{customTuneIn.translation}</p>
              )}
              {display.instruction && customTuneIn.instruction && (
                <p class="meta" style={{ fontStyle: display.italicInstruction ? "italic" : "normal" }}>{customTuneIn.instruction}</p>
              )}
              <div class="japa-drawer-actions">
                <a class="ghost" href="#/shlokas">Сменить шлоку</a>
                <button class="ghost" type="button" onClick={() => { saveActiveTuneIn(null); setCustomTuneIn(null); }}>
                  Сбросить настрой
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeCondition && (
                <div class="japa-condition-box">
                  <div class="japa-condition-tabs">
                    {JAPA_PRELIMINARY_CONDITIONS.map((cond, idx) => (
                      <button
                        key={cond.id}
                        type="button"
                        class={`chip ${idx === prepConditionIdx ? "is-selected" : ""}`}
                        onClick={() => setPrepConditionIdx(idx)}
                      >
                        {cond.step}
                      </button>
                    ))}
                  </div>
                  <h3>{activeCondition.title}</h3>
                  {display.instruction && (
                    <p class="japa-instruction-text" style={{ fontStyle: display.italicInstruction ? "italic" : "normal" }}>
                      {activeCondition.text.split("\n\n")[0]}
                    </p>
                  )}
                </div>
              )}
              <div class="japa-drawer-actions">
                <a class="ghost" href="#/shlokas">★ Выбрать настрой из банка шлок</a>
              </div>
            </>
          )}
        </article>

        <div class="japa-bottom-bar">
          <button class="solid next-round" type="button" onClick={handleStartSession}>
            Начать джапу ({formatRounds(target)}) →
          </button>
        </div>

        {renderDrawer()}
      </main>
    );
  }

  // 3. Active reading / paused state (Desktop, Portrait, Landscape Split, Stand-dim)
  const nothingVisible = !hasVisibleDisplayLayer(display);
  const progressRatio = Math.min(1, Math.max(0, (round - 1) / target));
  const isFav = currentUnit ? collections.favorites.includes(currentUnit.id) : false;

  return (
    <main
      class={`japa-session-grid ${isPaused ? "is-paused" : ""}`}
      data-left-handed={display.leftHanded ? "true" : "false"}
      aria-label="Экран чтения джапы"
    >
      {storageError && (
        <div class="japa-banner-slot">
          <p class="notice" role="alert">
            {storageError}{" "}
            <button class="ghost" type="button" onClick={() => session && persistSession(session)}>
              Повторить
            </button>
          </p>
        </div>
      )}

      {recoveryCandidate && savedAny?.id === session?.id && (
        <div class="japa-banner-slot">
          <div class="japa-recovery-banner">
            <span>
              Сессия восстановлена: <strong>круг {round} из {target}</strong> ({isPaused ? "на паузе" : "идёт"}).
            </span>
            <div class="japa-recovery-actions">
              <button class="ghost" type="button" onClick={() => setRecoveryCandidate(null)}>Понятно</button>
              <button
                class="ghost"
                type="button"
                onClick={() => {
                  setSession(null);
                  setRecoveryCandidate(null);
                  clearActiveJapaSession();
                }}
              >
                Начать заново
              </button>
            </div>
          </div>
        </div>
      )}

      <section class="japa-status-pane" aria-label="Прогресс и таймеры">
        <div class="japa-status-head">
          <a class="ghost icon-button" href="#/" aria-label="На главную" title="На главную">
            {renderSvgIcon("back")}
          </a>
          <div class="japa-round-meta">
            <strong class="tabular-nums" aria-live="polite">
              Круг {round} из {target}
            </strong>
            {isPaused && <span class="japa-pause-pill">⏸ Пауза</span>}
          </div>
        </div>

        <div class="japa-progress-wrap">
          <progress value={round - 1} max={target} aria-label={`Прогресс: ${Math.round(progressRatio * 100)}%`} />
        </div>

        <div class="japa-timers-pair tabular-nums">
          <div class="japa-timer-item">
            <span class="meta">Круг</span>
            <strong aria-label="Время текущего круга">{japaTime(roundElapsed)}</strong>
          </div>
          <div class="japa-timer-item">
            <span class="meta">Всего</span>
            <span aria-label="Общее время джапы">{japaTime(totalElapsed)}</span>
          </div>
        </div>

        <div class="japa-status-icons">
          <button
            class={`ghost icon-button ${isPaused ? "is-pause-active" : ""}`}
            type="button"
            aria-label={isPaused ? "Продолжить таймер" : "Пауза"}
            title={isPaused ? "Продолжить (P)" : "Пауза (P)"}
            onClick={handleTogglePause}
          >
            {renderSvgIcon(isPaused ? "play" : "pause")}
          </button>
          <button
            class="ghost icon-button"
            type="button"
            aria-label="Настройки отображения"
            title="Настройки"
            onClick={() => setDrawer("settings")}
          >
            {renderSvgIcon("settings")}
          </button>
          <button
            class="ghost icon-button"
            type="button"
            aria-label="История кругов"
            title="История кругов"
            onClick={() => setDrawer("history")}
          >
            {renderSvgIcon("history")}
          </button>
        </div>
      </section>

      <section class="japa-text-pane" aria-label="Область чтения">
        <button
          class="japa-side-btn japa-side-prev"
          type="button"
          aria-label="Предыдущий текст"
          title="Предыдущий текст (←)"
          disabled={shownIndex <= 0}
          onClick={() => handleStepText(-1)}
        >
          ‹
        </button>

        <article class="japa-card japa-reading-card">
          <header class="japa-reading-header">
            <div class="japa-reading-nav-inline">
              <button
                class="ghost japa-inline-step"
                type="button"
                aria-label="Предыдущий текст"
                disabled={shownIndex <= 0}
                onClick={() => handleStepText(-1)}
              >
                ‹
              </button>
              <span class="japa-reading-index tabular-nums">
                Текст {shownIndex + 1} / {sequence.length}
              </span>
              <button
                class="ghost japa-inline-step"
                type="button"
                aria-label="Следующий текст"
                disabled={shownIndex >= sequence.length - 1}
                onClick={() => handleStepText(1)}
              >
                ›
              </button>
              {textLocked && (
                <button class="chip japa-return-chip" type="button" onClick={() => setTextIndex(null)}>
                  ↺ К тексту круга {round}
                </button>
              )}
            </div>

            <div class="japa-reading-header-actions">
              {currentUnit && !display.standMode && (
                <button
                  class="ghost japa-fav-mini"
                  type="button"
                  aria-label={isFav ? "Убрать из избранного" : "В избранное"}
                  aria-pressed={isFav}
                  onClick={() => handleToggleFavoriteUnit(currentUnit.id)}
                >
                  {isFav ? "★" : "☆"}
                </button>
              )}
              {!display.standMode && (
                <button class="ghost japa-fulltext-btn" type="button" onClick={() => setDrawer("fulltext")}>
                  Полный текст
                </button>
              )}
            </div>
          </header>

          <div class="japa-reading-scroll">
            {currentUnit && (
              <>
                {!display.standMode && currentUnit.canonicalRef && (
                  <p class="meta japa-source-line">{currentUnit.workTitle} · {currentUnit.canonicalRef}</p>
                )}
                <h2>{currentUnit.title}</h2>
                {nothingVisible ? (
                  <div class="japa-empty-box">
                    <strong>Все части текста скрыты</strong>
                    <p class="meta">Включите хотя бы один слой отображения, чтобы видеть текст настройки.</p>
                    <button
                      class="solid"
                      type="button"
                      onClick={() => updateDisplay({ translation: true, instruction: true })}
                    >
                      Показать перевод и настройку
                    </button>
                  </div>
                ) : (
                  <>
                    {display.sanskrit && currentUnit.sanskrit && (
                      <pre
                        class="sanskrit-text"
                        style={{ fontStyle: display.italicSanskrit ? "italic" : "normal" }}
                      >
                        {currentUnit.sanskrit}
                      </pre>
                    )}
                    {display.translation && currentUnit.translation && (
                      <p
                        class="translation-text"
                        style={{ fontStyle: display.italicTranslation ? "italic" : "normal" }}
                      >
                        {currentUnit.translation}
                      </p>
                    )}
                    {display.instruction && currentUnit.instruction && (
                      <p
                        class="japa-instruction-text"
                        style={{ fontStyle: display.italicInstruction ? "italic" : "normal" }}
                      >
                        {currentUnit.instruction}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </article>

        <button
          class="japa-side-btn japa-side-next"
          type="button"
          aria-label="Следующий текст"
          title="Следующий текст (→)"
          disabled={shownIndex >= sequence.length - 1}
          onClick={() => handleStepText(1)}
        >
          ›
        </button>
      </section>

      <footer class="japa-action-pane">
        <button class="solid next-round" type="button" onClick={handleNextRound}>
          {round < target ? `Круг ${round} завершён → Следующий (${round + 1})` : "Завершить чтение"}
        </button>
      </footer>

      {undoSnapshot && (
        <div class="japa-undo-toast" role="status" aria-live="polite">
          <span>
            Круг {undoSnapshot.roundNumber} записан ({japaTime(undoSnapshot.recordedDurationMs)})
          </span>
          <button type="button" onClick={handleUndoRound}>
            Отменить
          </button>
        </div>
      )}

      {renderDrawer()}
    </main>
  );
}
