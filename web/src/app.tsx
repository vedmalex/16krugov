import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  type Category,
  type Exercise,
  type Program,
  exercises,
  exerciseById,
  exercisesIn,
  programById,
  programPlaylist,
  programs,
} from "./catalog";
import {
  cancel,
  createPlayer,
  beatMs,
  elementMs,
  exercisePlanMs,
  pause,
  previewWordIndex,
  skipStep,
  remainingExerciseMs,
  start,
  tick,
  type PlayerState,
} from "./machine";
import { displayRows } from "./syllables";
import { clearSessions, listSessions, saveSession, type SessionRecord } from "./store";
import { loadPrefs, savePrefs, type Prefs } from "./prefs";
import { loadCollections, saveCollections, type Collections, type CustomBlock } from "./collections";
import { ShlokaBankPage } from "./shlokas";
import { JapaPage } from "./japa";
import { loadJapaHistory } from "./japa-catalog";
import { formatRounds, japaTime, type JapaSession } from "./japa-model";

function isTextExercise(exercise: { id: string; category: string }): boolean {
  return exercise.id.endsWith("-phrase") || exercise.category === "tongue_twisters";
}

function exerciseDuration(item: Exercise, prefs: Prefs): number {
  return exercisePlanMs(item.elements.length, item.wordStarts, isTextExercise(item) ? prefs.textBpm : prefs.bpm, prefs.rounds, prefs.portion, prefs.countdownBeats, prefs.restBeats, item.elements, isTextExercise(item) && prefs.punctuationPauses);
}

function durationLabel(items: Exercise[], prefs: Prefs, addRandom: boolean): string {
  if (prefs.manual) return "Время зависит от ручного режима";
  const total = items.reduce((sum, item) => sum + exerciseDuration(item, prefs), 0) + Math.max(0, items.length - 1) * 600;
  if (!addRandom || !twisters.length) return `Около ${formatLeft(total)}`;
  const durations = twisters.map((item) => exerciseDuration(item, prefs));
  return `Около ${formatLeft(total + (items.length ? 600 : 0) + Math.min(...durations))}–${formatLeft(total + (items.length ? 600 : 0) + Math.max(...durations))}`;
}

const twisters = exercises.filter((item) => item.category === "tongue_twisters");
const SESSION_BLOCK_KEY = "articulation-session-block";

function beginProgram(program: Program, includeRandom = loadPrefs().randomTwister): void {
  const steps = program.steps.map((step) => ({ ...step, exerciseIds: [...step.exerciseIds] }));
  if (includeRandom && twisters.length) {
    const random = twisters[Math.floor(Math.random() * twisters.length)];
    steps.push({ title: "Случайная скороговорка", minutes: 0, exerciseIds: [random.id] });
  }
  const snapshot: Program = { ...program, steps };
  const first = programPlaylist(snapshot)[0];
  if (!first) return;
  sessionStorage.setItem(SESSION_BLOCK_KEY, JSON.stringify(snapshot));
  sessionStorage.removeItem(RUN_KEY);
  location.hash = `#/train/${encodeURIComponent(first.exercise.id)}?queue=${encodeURIComponent(snapshot.id)}&at=0`;
}

type Route =
  | { name: "home" }
  | { name: "list"; category: Category }
  | { name: "train"; id: string; queue?: string; at?: number; returnTo?: string }
  | { name: "history" }
  | { name: "collections" }
  | { name: "shlokas" }
  | { name: "japa"; target: number };

function readRoute(): Route {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, query] = hash.split("?");
  const params = new URLSearchParams(query ?? "");
  const bits = path.split("/").filter(Boolean);
  if (bits[0] === "train" && bits[1]) {
    const rawReturn = params.get("returnTo");
    const returnTo = rawReturn && /^japa\/\d+$/.test(rawReturn) ? rawReturn : undefined;
    return {
      name: "train",
      id: decodeURIComponent(bits[1]),
      queue: params.get("queue") ?? undefined,
      at: params.get("at") ? Number(params.get("at")) : undefined,
      returnTo,
    };
  }
  if (bits[0] === "japa") {
    return { name: "japa", target: Number(bits[1]) || 16 };
  }
  if (bits[0] === "list" && bits[1]) return { name: "list", category: bits[1] as Category };
  if (bits[0] === "history") return { name: "history" };
  if (bits[0] === "collections") return { name: "collections" };
  if (bits[0] === "shlokas") return { name: "shlokas" };
  return { name: "home" };
}

function toggleFullscreen() {
  if (!document.fullscreenElement) return document.documentElement.requestFullscreen();
  return document.exitFullscreen();
}

const lists: { category: Category; title: string }[] = [
  { category: "vowels", title: "Гласные" },
  { category: "consonants", title: "Согласные" },
  { category: "tongue_twisters", title: "Скороговорки" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z",
    vowels: "M4 19 10 5l6 14M6.5 14h7M18 8h2m-1-1v2",
    consonants: "M5 5h7a4 4 0 0 1 0 8H5zm0 8h8a3 3 0 0 1 0 6H5z",
    tongue_twisters: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
    history: "M4 6v5h5M4.5 11a8 8 0 1 1 2 6M12 7v5l3 2",
    moon: "M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
    sun: "M12 4v2m0 12v2M4 12h2m12 0h2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    screen: "M4 9V4h5m6 0h5v5M20 15v5h-5M9 20H4v-5",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    back: "M15 5l-7 7 7 7",
    next: "M9 5l7 7-7 7",
    reset: "M4 10a8 8 0 1 1 2 7M4 4v6h6",
    menu: "M4 6h16M4 12h16M4 18h16",
  };
  return <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [collections, setCollections] = useState<Collections>(loadCollections);
  const [storageError, setStorageError] = useState("");
  function updateCollections(next: Collections) {
    try { saveCollections(next); setCollections(next); setStorageError(""); return true; }
    catch { setStorageError("Не удалось сохранить изменения в браузере."); return false; }
  }
  function toggleFavorite(id: string) {
    updateCollections({ ...collections, favorites: collections.favorites.includes(id) ? collections.favorites.filter((item) => item !== id) : [...collections.favorites, id] });
  }
  const [theme, setTheme] = useState(() => loadPrefs().theme);
  const [scale, setScale] = useState(() => loadPrefs().scale);
  const [manual, setManual] = useState(() => loadPrefs().manual);
  const [pulseOn, setPulseOn] = useState(() => loadPrefs().pulse);
  const [rounds, setRounds] = useState(() => loadPrefs().rounds);
  const [portion, setPortion] = useState(() => loadPrefs().portion);
  const [countdownBeats, setCountdownBeats] = useState(() => loadPrefs().countdownBeats);
  const [restBeats, setRestBeats] = useState(() => loadPrefs().restBeats);
  const [punctuationPauses, setPunctuationPauses] = useState(() => loadPrefs().punctuationPauses);
  const [randomTwister, setRandomTwister] = useState(() => loadPrefs().randomTwister);
  const [tutor, setTutor] = useState(true);
  const [exerciseBpm, setExerciseBpm] = useState(() => loadPrefs().bpm);
  const [textBpm, setTextBpm] = useState(() => loadPrefs().textBpm);
  const currentExercise = route.name === "train" ? exerciseById(route.id) : undefined;
  const textTempo = currentExercise ? isTextExercise(currentExercise) : false;
  const bpm = textTempo ? textBpm : exerciseBpm;
  const setBpm = textTempo ? setTextBpm : setExerciseBpm;
  const prefs: Prefs = { theme, scale, bpm: exerciseBpm, textBpm, rounds, manual, pulse: pulseOn, portion, countdownBeats, restBeats, punctuationPauses, randomTwister };
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePrefs({ theme: theme === "dark" ? "dark" : "light" });
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--scale", String(scale));
    savePrefs({ scale });
  }, [scale]);

  return (
    <div class={route.name === "japa" ? "shell shell--japa" : "shell"}>
      {route.name !== "japa" && <header class="top">
        <button class="ghost icon-button" type="button" onClick={() => menuRef.current?.showModal()} aria-label="Открыть меню" aria-haspopup="dialog" aria-controls="main-menu"><Icon name="menu" /></button>
        <a class="brand" href="#/">Помощник по джапе</a>
        {route.name === "train" && tutor && <label class="header-tempo"><span>Темп {textTempo ? "текста" : "упражнений"}</span><select value={bpm} onChange={(event) => {
          const value = Number((event.currentTarget as HTMLSelectElement).value);
          setBpm(value); savePrefs(textTempo ? { textBpm: value } : { bpm: value });
        }}>{[...new Set([...Array.from({ length: 22 }, (_, index) => 30 + index * 10), bpm])].sort((a, b) => a - b).map((value) => <option value={value}>{value} BPM</option>)}</select></label>}
        <div class="tools">
          <button class="ghost" type="button" onClick={() => setScale(scale >= 1.45 ? 1 : Number((scale + 0.15).toFixed(2)))} aria-label="Крупнее текст">
            А+
          </button>
          <button class="ghost" type="button" aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            <span class="tool-label">{theme === "dark" ? "Светлая" : "Тёмная"}</span>
          </button>
          <button class="ghost" type="button" aria-label="Полный экран" onClick={() => void toggleFullscreen()}>
            <Icon name="screen" />
            <span class="tool-label">Экран</span>
          </button>
        </div>
      </header>}
      {route.name !== "japa" && <div class="header-actions">
      {(route.name === "home" || route.name === "train") && <button class="tutor-switch" type="button" role="switch" aria-checked={tutor} onClick={() => { sessionStorage.removeItem(RUN_KEY); setTutor(!tutor); }}><span class="tutor-switch-track" aria-hidden="true"><span /></span><span>{tutor ? "С тьютором" : "Без тьютора"}</span></button>}
      <dialog class="main-menu" id="main-menu" ref={menuRef} aria-labelledby="menu-title">
        <div class="drawer-header"><strong id="menu-title">Навигация</strong><button class="ghost icon-button" type="button" aria-label="Закрыть меню" onClick={() => menuRef.current?.close()}>×</button></div>
        <nav class="main-menu-content" aria-label="Основное меню" onClick={(event) => {
          if ((event.target as Element).closest("a")) {
            sessionStorage.removeItem(RUN_KEY);
            menuRef.current?.close();
          }
        }}>
          <a href="#/" aria-current={route.name === "home" ? "page" : undefined}>Главная</a>
          <a href="#/japa/16">Джапа · 16 кругов</a>
          <a href="#/shlokas" aria-current={route.name === "shlokas" ? "page" : undefined}><Icon name="book" />Банк шлок и молитв</a>
          <span class="menu-heading">Подготовка артикуляции</span>
          {lists.map((item) => <a href={`#/list/${item.category}`} aria-current={route.name === "list" && route.category === item.category ? "page" : undefined}><Icon name={item.category} />{item.title}</a>)}
          <a href="#/history" aria-current={route.name === "history" ? "page" : undefined}><Icon name="history" />История</a>
          <a href="#/collections" aria-current={route.name === "collections" ? "page" : undefined}>★ Избранное и мои блоки</a>
          <span class="menu-heading">Программы артикуляции</span>
          {programs.map((program) => {
            const first = programPlaylist(program)[0];
            return first ? <a href={`#/train/${first.exercise.id}?queue=${program.id}&at=0`} onClick={(event) => { event.preventDefault(); beginProgram(program); }}>{program.title}</a> : null;
          })}
        </nav>
      </dialog>
      <details class="settings">
        <summary>Настройки</summary>
        <div class="settings-content">
          <label class="field">Режим
            <select value={manual ? "manual" : "timed"} onChange={(event) => {
              const value = (event.currentTarget as HTMLSelectElement).value === "manual";
              setManual(value);
              savePrefs({ manual: value });
            }}>
              <option value="timed">По пульсу</option>
              <option value="manual">Вручную</option>
            </select>
          </label>
          <label class="field">Рамка
            <select value={pulseOn ? "on" : "off"} onChange={(event) => {
              const value = (event.currentTarget as HTMLSelectElement).value === "on";
              setPulseOn(value);
              savePrefs({ pulse: value });
            }}>
              <option value="on">Пульс</option>
              <option value="off">Без пульса</option>
            </select>
          </label>
          <label class="field">Порция в слове: {Math.round(portion * 100)}%
            <input type="range" min={20} max={100} step={5} value={Math.round(portion * 100)} onInput={(event) => {
              const value = Number((event.currentTarget as HTMLInputElement).value) / 100;
              setPortion(value); savePrefs({ portion: value });
            }} />
          </label>
          <label class="field">Повторы в серии
            <select value={rounds} onChange={(event) => {
              const value = Number((event.currentTarget as HTMLSelectElement).value);
              setRounds(value); savePrefs({ rounds: value });
            }}>
              {Array.from({ length: 12 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          <label class="field">Подготовка (такты)
            <select value={countdownBeats} onChange={(event) => {
              const value = Number((event.currentTarget as HTMLSelectElement).value);
              setCountdownBeats(value); savePrefs({ countdownBeats: value });
            }}>
              {Array.from({ length: 5 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          <label class="field">Пауза между циклами (такты)
            <select value={restBeats} onChange={(event) => {
              const value = Number((event.currentTarget as HTMLSelectElement).value);
              setRestBeats(value); savePrefs({ restBeats: value });
            }}>
              {Array.from({ length: 3 }, (_, index) => <option value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          <label class="field">Паузы на знаках препинания
            <select value={punctuationPauses ? "on" : "off"} onChange={(event) => {
              const value = (event.currentTarget as HTMLSelectElement).value === "on";
              setPunctuationPauses(value); savePrefs({ punctuationPauses: value });
            }}><option value="on">Включены</option><option value="off">Выключены</option></select>
          </label>
          <label class="field">Случайная скороговорка в конце
            <select value={randomTwister ? "on" : "off"} onChange={(event) => { const value = event.currentTarget.value === "on"; setRandomTwister(value); savePrefs({ randomTwister: value }); }}><option value="off">Выключена</option><option value="on">Включена</option></select>
          </label>
        </div>
      </details>
      </div>}
      {storageError && <p class="notice" role="alert">{storageError}</p>}
      {route.name === "home" && <Home prefs={prefs} />}
      {route.name === "japa" && <JapaPage target={route.target} />}
      {route.name === "shlokas" && <ShlokaBankPage />}
      {route.name === "list" && <Catalog category={route.category} favorites={collections.favorites} onFavorite={toggleFavorite} prefs={prefs} />}
      {route.name === "collections" && <CollectionsPage collections={collections} onChange={updateCollections} onFavorite={toggleFavorite} prefs={prefs} />}
      {route.name === "train" && (
        <Trainer exerciseId={route.id} queue={route.queue} at={route.at ?? 0} returnTo={route.returnTo} manual={manual} pulseOn={pulseOn} rounds={rounds} portion={portion} exerciseBpm={exerciseBpm} textBpm={textBpm} countdownBeats={countdownBeats} restBeats={restBeats} punctuationPauses={punctuationPauses} collections={collections} onFavorite={toggleFavorite} tutor={tutor} />
      )}
      {route.name === "history" && <History />}
      {route.name !== "japa" && <footer class="license-note">
        © 2026 <a href="https://github.com/vedmalex">Веданта-крит дас (Алексей Ведмеденко)</a>. Тексты упражнений: <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ru">CC BY-NC-ND 4.0</a>. Коммерческое использование — с разрешения автора.
      </footer>}
    </div>
  );
}

function Home({ prefs }: { prefs: Prefs }) {
  const targets = [4, 8, 16, 24, 32, 40, 48, 56, 64];
  return (
    <main class="home-page">
      <h1>Помощник по джапе</h1>
      <p class="lede">
        Подготовьте артикуляцию, выберите настрой на повторение и погрузите ум в святое имя.
      </p>
      <section class="japa-card">
        <h2>1. Подготовка артикуляции</h2><p>Разомните гласные и согласные перед джапой.</p>
        <nav class="nav"><a class="chip" href="#/list/vowels">Гласные</a><a class="chip" href="#/list/consonants">Согласные</a><a class="chip" href="#/list/tongue_twisters">Скороговорки</a></nav>
      </section>
      <section class="japa-card"><h2>2. Повторение мантры</h2><p>Выберите цель чтения и настрой на круг.</p>
        <div class="target-grid">{targets.map((n) => <a class="chip" href={`#/japa/${n}`}>{formatRounds(n)}</a>)}</div>
        <a class="solid japa-start" href="#/japa/16">Настроиться и начать</a>
      </section>
      <section class="japa-card">
        <h2>Банк шлок и молитв</h2>
        <p>19 произведений, 206 шлок: Шри Дамодараштака, Утренняя служба, Шри Бхакти-расаяна, 16 кругов. Доступны шлоки, связный подстрочник и пословный разбор.</p>
        <div class="target-grid">
          <a class="chip" href="#/shlokas?work=damodarastakam">Дамодараштака</a>
          <a class="chip" href="#/shlokas?work=gurvastakam">Гурваштака</a>
          <a class="chip" href="#/shlokas?work=kevalastakam">Кевалаштака</a>
          <a class="chip" href="#/shlokas?work=bhakti-rasayana">Бхакти-расаяна</a>
          <a class="chip" href="#/shlokas?work=luchshie-krugi">16 кругов</a>
        </div>
        <a class="solid japa-start" href="#/shlokas">Открыть банк шлок</a>
      </section>
      <details class="japa-card"><summary>О приложении</summary><p>Помощник для подготовки и внимательного повторения мантры.</p></details>
      <h2>Программы артикуляции</h2>
      <p class="meta">Темп: упражнения {prefs.bpm} BPM · тексты {prefs.textBpm} BPM · {prefs.rounds} сер. · порция {Math.round(prefs.portion * 100)}%</p>
      <nav class="nav" aria-label="Разделы">
        <a class="chip" href="#/history"><Icon name="history" />История</a>
        <a class="chip" href="#/collections">★ Избранное и мои блоки</a>
      </nav>
      <section class="grid">
        {programs.map((program) => {
          const playlist = programPlaylist(program);
          const first = playlist[0];
          if (!first) return null;
          return (
            <a class="card" href={`#/train/${first.exercise.id}?queue=${program.id}&at=0`} onClick={(event) => { event.preventDefault(); beginProgram(program); }}>
              <span class="card-arrow"><Icon name="arrow" /></span>
              <strong>{program.title}</strong>
              <span>{durationLabel(playlist.map((item) => item.exercise), prefs, prefs.randomTwister)} · план {program.durationMinutesTarget} мин · {program.steps.length} блоков</span>
            </a>
          );
        })}
      </section>
    </main>
  );
}

function Catalog({ category, favorites, onFavorite, prefs }: { category: Category; favorites: string[]; onFavorite: (id: string) => void; prefs: Prefs }) {
  const items = exercisesIn(category);
  const title = lists.find((item) => item.category === category)?.title ?? "Упражнения";
  return (
    <main>
      <h1>{title}</h1>
      {category === "tongue_twisters" && <><p class="meta">{durationLabel(twisters, prefs, false)}</p><button class="solid" type="button" onClick={() => beginProgram({ id: "all-twisters", title: "Все скороговорки", durationMinutesTarget: 0, steps: [{ title: "Скороговорки", minutes: 0, exerciseIds: twisters.map((item) => item.id) }] }, false)}>Пройти все скороговорки</button></>}
      <div class="grid">
        {items.map((exercise) => (
          <div class="exercise-card"><a class="card" href={`#/train/${exercise.id}`}>
            <strong>{exercise.title}</strong>
            <span>{exercise.group ? `${exercise.group} · ` : ""}сложность {exercise.difficulty}</span>
          </a><button class="ghost favorite-button" type="button" onClick={() => onFavorite(exercise.id)} aria-pressed={favorites.includes(exercise.id)} aria-label={`${favorites.includes(exercise.id) ? "Убрать из избранного" : "Добавить в избранное"}: ${exercise.title}`}>{favorites.includes(exercise.id) ? "★" : "☆"}</button></div>
        ))}
      </div>
    </main>
  );
}

function sessionProgram(id: string): Program | undefined {
  try {
    const program: Program = JSON.parse(sessionStorage.getItem(SESSION_BLOCK_KEY) ?? "null");
    if (!program || program.id !== id || !Array.isArray(program.steps)) return undefined;
    return program;
  } catch { return undefined; }
}

function CollectionsPage({ collections, onChange, onFavorite, prefs }: { collections: Collections; onChange: (value: Collections) => boolean; onFavorite: (id: string) => void; prefs: Prefs }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState(exercises[0]?.id ?? "");
  const [error, setError] = useState("");
  function launch(block: CustomBlock) {
    const ids = block.exerciseIds.filter((id) => exerciseById(id));
    if (!ids.length) return;
    try {
      beginProgram({ id: block.id, title: block.title, durationMinutesTarget: 0, steps: [{ title: block.title, minutes: 0, exerciseIds: ids }] });
    } catch { setError("Не удалось открыть блок: хранилище браузера недоступно."); }
  }
  function duration(ids: string[]) {
    const items = ids.map(exerciseById).filter((item): item is Exercise => !!item);
    return durationLabel(items, prefs, prefs.randomTwister);
  }
  function saveBlock() {
    if (!title.trim() || !selected.length) { setError("Укажите название и добавьте хотя бы одно упражнение."); return; }
    const block = { id: editingId ?? `custom-${crypto.randomUUID()}`, title: title.trim(), exerciseIds: selected };
    if (!onChange({ ...collections, blocks: editingId ? collections.blocks.map((item) => item.id === editingId ? block : item) : [...collections.blocks, block] })) return;
    setEditingId(null); setTitle(""); setSelected([]); setError("");
  }
  const favorites = collections.favorites.map(exerciseById).filter((item): item is Exercise => !!item);
  return <main>
    <h1>Избранное и мои блоки</h1>
    <p class="meta">Сохраняется в этом браузере на этом устройстве.</p>
    {error && <p class="notice" role="alert">{error}</p>}
    <h2>Избранное</h2>
    {favorites.length ? <><p class="meta">{duration(favorites.map((item) => item.id))}</p><button class="solid" type="button" onClick={() => launch({ id: "favorites", title: "Избранное", exerciseIds: favorites.map((item) => item.id) })}>Начать избранное</button>
      <ul class="collection-list">{favorites.map((item) => <li><a href={`#/train/${item.id}`}>{item.title}</a><button class="ghost" type="button" onClick={() => onFavorite(item.id)} aria-label={`Убрать из избранного: ${item.title}`}>★</button></li>)}</ul></> : <p class="meta">Добавьте упражнения в избранное в каталоге или во время занятия.</p>}
    <h2>Мои блоки</h2>
    {collections.blocks.map((block) => <div class="card collection-block"><strong>{block.title}</strong><p class="meta">{block.exerciseIds.length} упр. · {duration(block.exerciseIds)}</p><div class="controls"><button class="solid" type="button" onClick={() => launch(block)}>Начать</button><button class="ghost" type="button" onClick={() => { setEditingId(block.id); setTitle(block.title); setSelected([...block.exerciseIds]); }}>Изменить</button><button class="ghost" type="button" onClick={() => { if (confirm(`Удалить блок «${block.title}»?`)) onChange({ ...collections, blocks: collections.blocks.filter((item) => item.id !== block.id) }); }}>Удалить</button></div></div>)}
    <h2>{editingId ? "Изменить блок" : "Новый блок"}</h2>
    <label class="field">Название<input value={title} onInput={(event) => setTitle(event.currentTarget.value)} /></label>
    <label class="field">Упражнение<select value={choice} onChange={(event) => setChoice(event.currentTarget.value)}>{exercises.map((item) => <option value={item.id}>{item.title}</option>)}</select></label>
    <button class="ghost" type="button" onClick={() => setSelected([...selected, choice])}>Добавить в блок</button>
    <ol class="collection-list">{selected.map((id, index) => <li><span>{exerciseById(id)?.title ?? `Недоступно: ${id}`}</span><div class="controls"><button class="ghost" type="button" disabled={index === 0} aria-label={`Поднять ${exerciseById(id)?.title ?? id}`} onClick={() => { const next = [...selected]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSelected(next); }}>↑</button><button class="ghost" type="button" disabled={index === selected.length - 1} aria-label={`Опустить ${exerciseById(id)?.title ?? id}`} onClick={() => { const next = [...selected]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setSelected(next); }}>↓</button><button class="ghost" type="button" aria-label={`Убрать ${exerciseById(id)?.title ?? id}`} onClick={() => setSelected(selected.filter((_, position) => position !== index))}>×</button></div></li>)}</ol>
    {selected.length > 0 && <p class="meta">{duration(selected)}</p>}
    <div class="controls"><button class="solid" type="button" onClick={saveBlock}>Сохранить блок</button>{editingId && <button class="ghost" type="button" onClick={() => { setEditingId(null); setTitle(""); setSelected([]); }}>Отмена</button>}</div>
  </main>;
}

function withReturnTo(href: string, returnTo?: string): string {
  if (!returnTo) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

function Trainer({ exerciseId, queue, at, returnTo, manual, pulseOn, rounds, portion, exerciseBpm, textBpm, countdownBeats, restBeats, punctuationPauses, collections, onFavorite, tutor }: { exerciseId: string; queue?: string; at: number; returnTo?: string; manual: boolean; pulseOn: boolean; rounds: number; portion: number; exerciseBpm: number; textBpm: number; countdownBeats: number; restBeats: number; punctuationPauses: boolean; collections: Collections; onFavorite: (id: string) => void; tutor: boolean }) {
  const program = useMemo(() => queue ? sessionProgram(queue) ?? programById(queue) : undefined, [queue]);
  const playlist = useMemo(() => (program ? programPlaylist(program) : []), [program]);
  const slot = playlist[at];
  const exercise = exerciseById(exerciseId) ?? slot?.exercise;
  const isText = exercise ? isTextExercise(exercise) : false;
  const bpm = isText ? textBpm : exerciseBpm;
  const [rating, setRating] = useState<number | null>(null);
  const [saved, setSaved] = useState("");
  const [beat, setBeat] = useState(false);
  const [countLeft, setCountLeft] = useState<number | null>(null);
  const [clock, setClock] = useState(() => performance.now());
  const [previewWord, setPreviewWord] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const sessionId = useRef<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const selfPointer = useRef<{ x: number; y: number } | null>(null);
  const length = exercise?.elements.length ?? 1;
  const [player, setPlayer] = useState<PlayerState>(() => createPlayer(length, rounds));
  const phaseRef = useRef(player.phase);
  const deadlineRef = useRef(player.deadline);
  const heldRef = useRef(player.held);
  const remainingRef = useRef(player.remainingMs);
  const playerRef = useRef(player);
  phaseRef.current = player.phase;
  deadlineRef.current = player.deadline;
  heldRef.current = player.held;
  remainingRef.current = player.remainingMs;
  playerRef.current = player;
  const next = playlist[at + 1];
  const manualRef = useRef(manual);
  manualRef.current = manual;
  const bpmRef = useRef(bpm);
  const portionRef = useRef(portion);
  const wordsRef = useRef<number[]>(exercise?.wordStarts ?? []);
  const elementsRef = useRef<string[]>(exercise?.elements ?? []);
  bpmRef.current = bpm;
  portionRef.current = portion;
  wordsRef.current = exercise?.wordStarts ?? [];
  elementsRef.current = exercise?.elements ?? [];
  const prevHref = useMemo(() => {
    if (!exercise) return null;
    if (queue) {
      const previous = playlist[at - 1];
      return previous ? withReturnTo(`#/train/${previous.exercise.id}?queue=${queue}&at=${at - 1}`, returnTo) : null;
    }
    const list = exercisesIn(exercise.category);
    const index = list.findIndex((item) => item.id === exercise.id);
    const previous = list[index - 1];
    return previous ? withReturnTo(`#/train/${previous.id}`, returnTo) : null;
  }, [exercise, queue, playlist, at, returnTo]);
  const series = useMemo(() => {
    if (program && queue) {
      return playlist.map((item, index) => ({
        id: item.exercise.id,
        title: item.exercise.title,
        href: withReturnTo(`#/train/${item.exercise.id}?queue=${queue}&at=${index}`, returnTo),
      }));
    }
    if (!exercise) return [];
    return exercisesIn(exercise.category).map((item) => ({
      id: item.id,
      title: item.title,
      href: withReturnTo(`#/train/${item.id}`, returnTo),
    }));
  }, [program, queue, playlist, exercise, returnTo]);
  const followHref = useMemo(() => {
    if (!exercise) return null;
    if (queue) {
      return next ? withReturnTo(`#/train/${next.exercise.id}?queue=${queue}&at=${at + 1}`, returnTo) : null;
    }
    const list = exercisesIn(exercise.category);
    const index = list.findIndex((item) => item.id === exercise.id);
    const following = list[index + 1];
    return following ? withReturnTo(`#/train/${following.id}`, returnTo) : null;
  }, [exercise, queue, next, at, returnTo]);

  useEffect(() => {
    startedAt.current = null;
    sessionId.current = null;
    setRating(null);
    setSaved("");
    setPreviewWord(null);
    const fresh = createPlayer(exercise?.elements.length ?? 1, rounds);
    if (sessionStorage.getItem(RUN_KEY) === "1") {
      startedAt.current = Date.now();
      setPlayer(start(fresh, performance.now(), manualRef.current, bpmRef.current, countdownBeats));
    } else {
      setPlayer(fresh);
    }
  }, [exercise?.id, rounds, queue, at, tutor]);


  const previousManual = useRef(manual);
  useEffect(() => {
    if (previousManual.current === manual) return;
    previousManual.current = manual;
    sessionStorage.removeItem(RUN_KEY);
    setPlayer((current) => {
      if (current.phase === "idle" || current.phase === "completed") return current;
      return {
        ...current,
        phase: "paused",
        held: "running",
        deadline: null,
        remainingMs: manual ? null : beatMs(bpm, current.index, current.length, exercise?.wordStarts ?? [], portion, exercise?.elements ?? [], isText && punctuationPauses),
      };
    });
  }, [manual]);

  useEffect(() => {
    if (!tutor) return;
    let frame = 0;
    let shownSecond = -1;
    let shownCount = -1;
    let shownPreview: number | null | undefined;
    const loop = (now: number) => {
      setPlayer((current) => {
        if (manual || current.phase === "paused" || current.phase === "idle" || current.phase === "completed") {
          return current;
        }
        return tick(current, now, (index) => beatMs(bpmRef.current, index, current.length, wordsRef.current, portionRef.current, elementsRef.current, isText && punctuationPauses), restBeats * elementMs(bpmRef.current));
      });
      const preview = previewWordIndex(
        playerRef.current,
        now,
        wordsRef.current,
        bpmRef.current,
        portionRef.current,
        elementsRef.current,
        isText && punctuationPauses,
      );
      if (preview !== shownPreview) {
        shownPreview = preview;
        setPreviewWord(preview);
      }
      const second = Math.floor(now / 1000);
      if (second !== shownSecond) {
        shownSecond = second;
        setClock(now);
      }
      const counting = phaseRef.current === "countdown"
        || phaseRef.current === "resting"
        || (phaseRef.current === "paused" && (heldRef.current === "countdown" || heldRef.current === "resting"));
      if (counting) {
        const leftMs = phaseRef.current === "paused"
          ? (remainingRef.current ?? 0)
          : (deadlineRef.current ?? now) - now;
        const count = Math.max(1, Math.ceil(leftMs / elementMs(bpmRef.current)));
        if (count !== shownCount) {
          shownCount = count;
          setCountLeft(count);
        }
      } else if (shownCount !== 0) {
        shownCount = 0;
        setCountLeft(null);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [manual, bpm, restBeats, isText, punctuationPauses, tutor]);

  useEffect(() => {
    const active = pulseOn && !manual && player.phase === "running";
    if (!active) {
      setBeat(false);
      return;
    }
    setBeat(true);
    const timer = window.setTimeout(() => setBeat(false), 160);
    return () => window.clearTimeout(timer);
  }, [pulseOn, manual, player.phase, player.index, player.round]);

  useEffect(() => {
    if (player.phase !== "completed") return;
    void remember();
  }, [player.phase, rating, bpm, rounds, exercise?.id]);

  useEffect(() => {
    if (player.phase !== "completed") return;
    if (!followHref) {
      sessionStorage.removeItem(RUN_KEY);
      return;
    }
    if (sessionStorage.getItem(RUN_KEY) !== "1") return;
    const timer = window.setTimeout(() => {
      location.hash = followHref;
    }, 600);
    return () => window.clearTimeout(timer);
  }, [player.phase, followHref]);

  useEffect(() => {
    if (!tutor) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        goBack();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        const now = performance.now();
        setPlayer((current) => skipStep(current, 1, now, (index) => beatMs(bpmRef.current, index, current.length, wordsRef.current, portionRef.current, elementsRef.current, isText && punctuationPauses), {
          manual,
          inWordPause: previewWord != null,
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!exercise) return <p>Упражнение не найдено.</p>;

  if (!tutor) return <main class="train self-training">
    {returnTo && <p class="japa-return-bar"><a class="ghost japa-return-link" href={`#/${returnTo}`}>← Вернуться к джапе</a></p>}
    <p class="meta">{program ? `${program.title} · ${slot?.stepTitle ?? ""}` : exercise.group}</p>
    {series.length > 1 && <nav class="series" aria-label="Упражнения серии">
      {series.map((item, index) => <a
        class={item.id === exercise.id && (queue ? index === at : true) ? "current" : ""}
        href={item.href}
        title={item.title}
        aria-label={item.title}
        aria-current={item.id === exercise.id && (queue ? index === at : true) ? "true" : undefined}
      />)}
    </nav>}
    <h1 class="exercise-title">{exercise.title}</h1>
    <button class="ghost favorite-training" type="button" onClick={() => onFavorite(exercise.id)} aria-pressed={collections.favorites.includes(exercise.id)}>{collections.favorites.includes(exercise.id) ? "★ В избранном" : "☆ В избранное"}</button>
    <div class="stage-navigation self-navigation">
      <button class="ghost side-navigation" type="button" disabled={!prevHref} aria-label="Предыдущее упражнение" onClick={() => { if (prevHref) location.hash = prevHref; }}><Icon name="back" /></button>
      <div class="self-content" onPointerDown={(event) => { selfPointer.current = { x: event.clientX, y: event.clientY }; }} onPointerCancel={() => { selfPointer.current = null; }} onClick={(event) => {
        const start = selfPointer.current;
        selfPointer.current = null;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10 || window.getSelection()?.toString()) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const target = event.clientX < bounds.left + bounds.width / 2 ? prevHref : followHref;
        if (target) location.hash = target;
      }}>{exercise.text ? <p>{exercise.text}</p> : displayRows(exercise.elements, exercise.wordStarts).map((row) => <p>{row.map((token) => token.text).join(" ")}</p>)}</div>
      <button class="ghost side-navigation" type="button" disabled={!followHref} aria-label="Следующее упражнение" onClick={() => { if (followHref) location.hash = followHref; }}><Icon name="next" /></button>
    </div>
    {exercise.note && <p class="meta">{exercise.note}</p>}
  </main>;

  function goBack() {
    const phase = player.phase === "paused" ? player.held : player.phase;
    const atStart = player.phase === "completed" || ((phase === "idle" || phase === "countdown" || phase === "running") && player.index === 0 && player.round === 1 && previewWord == null);
    if (atStart && prevHref) {
      location.hash = prevHref;
      return;
    }
    const now = performance.now();
    setPlayer((current) => skipStep(current, -1, now, (index) => beatMs(bpm, index, current.length, exercise?.wordStarts ?? [], portion, exercise?.elements ?? [], isText && punctuationPauses), {
      manual,
      inWordPause: previewWord != null,
    }));
  }

  function goForward() {
    setPlayer((current) => skipStep(current, 1, performance.now(), (index) => beatMs(bpm, index, current.length, exercise?.wordStarts ?? [], portion, exercise?.elements ?? [], isText && punctuationPauses), {
      manual,
      inWordPause: previewWord != null,
    }));
  }

  function resetExercise() {
    sessionStorage.removeItem(RUN_KEY);
    startedAt.current = null;
    sessionId.current = null;
    setSaved("");
    setPlayer((current) => cancel(current));
  }

  function toggle() {
    const now = performance.now();
    setPlayer((current) => {
      if (current.phase === "running" || current.phase === "countdown" || current.phase === "resting") {
        sessionStorage.removeItem(RUN_KEY);
        return pause(current, now);
      }
      sessionStorage.setItem(RUN_KEY, "1");
      if (startedAt.current == null) startedAt.current = Date.now();
      return start(current, now, manual, bpm, countdownBeats);
    });
  }

  async function remember() {
    if (!exercise || startedAt.current == null) return;
    const id = sessionId.current ?? crypto.randomUUID();
    sessionId.current = id;
    try {
      await saveSession({
        id,
        exerciseId: exercise.id,
        title: exercise.title,
        startedAt: new Date(startedAt.current).toISOString(),
        durationMs: Date.now() - startedAt.current,
        bpm,
        rounds,
        rating,
      });
      setSaved("Сохранено на этом устройстве.");
    } catch {
      setSaved("Браузер не записал историю. Занятие не сохранено.");
    }
  }

  const exerciseLeft = remainingExerciseMs(player, clock, exercise.wordStarts, bpm, portion, countdownBeats, restBeats, exercise.elements, isText && punctuationPauses);
  let blockLeft: number | null = null;
  if (slot) {
    blockLeft = exerciseLeft;
    for (let index = at + 1; index < playlist.length; index += 1) {
      if (playlist[index].stepTitle !== slot.stepTitle) break;
      const item = playlist[index].exercise;
      blockLeft += 600 + exercisePlanMs(item.elements.length, item.wordStarts, isTextExercise(item) ? textBpm : exerciseBpm, rounds, portion, countdownBeats, restBeats, item.elements, isTextExercise(item) && punctuationPauses);
    }
  }

  return (
    <main class="train">
      {returnTo && <p class="japa-return-bar"><a class="ghost japa-return-link" href={`#/${returnTo}`}>← Вернуться к джапе</a></p>}
      <p class="meta">
        {program ? `${program.title} · ${slot?.stepTitle ?? ""}` : exercise.group}
        {manual ? " · время зависит от ручного режима" : ` · упражнение ${formatLeft(exerciseLeft)}`}
        {!manual && blockLeft != null ? ` · блок ${formatLeft(blockLeft)}` : ""}
      </p>
      {series.length > 1 && (
        <nav class="series" aria-label="Упражнения серии">
          {series.map((item, index) => (
            <a
              class={item.id === exercise.id && (queue ? index === at : true) ? "current" : ""}
              href={item.href}
              title={item.title}
              aria-label={item.title}
              aria-current={item.id === exercise.id && (queue ? index === at : true) ? "true" : undefined}
              onClick={() => {
                if (item.id !== exercise.id && (player.phase === "running" || player.phase === "countdown" || player.phase === "resting")) {
                  sessionStorage.removeItem(RUN_KEY);
                }
              }}
            />
          ))}
        </nav>
      )}
      <h1 class="exercise-title">{exercise.title}</h1>
      <button class="ghost favorite-training" type="button" onClick={() => onFavorite(exercise.id)} aria-pressed={collections.favorites.includes(exercise.id)}>{collections.favorites.includes(exercise.id) ? "★ В избранном" : "☆ В избранное"}</button>
      <p class="meta">серия {player.round} из {player.rounds} · {label(player.phase)} · сложность {exercise.difficulty}</p>
      <nav class="series rounds" aria-label="Повторы серии">
        {Array.from({ length: player.rounds }, (_, index) => index + 1).map((round) => (
          <button
            class={round === player.round ? "current" : ""}
            type="button"
            title={`Повтор ${round}`}
            aria-label={`Повтор ${round}`}
            aria-current={round === player.round ? "true" : undefined}
            onClick={() => {
              setPlayer((current) => ({
                ...current,
                phase: "paused",
                round,
                deadline: null,
                held: "running",
                remainingMs: manual ? null : beatMs(bpm, current.index, current.length, exercise.wordStarts, portion, exercise.elements, isText && punctuationPauses),
              }));
              sessionStorage.removeItem(RUN_KEY);
            }}
          />
        ))}
      </nav>
      <nav class="series parts" aria-label="Части упражнения">
        {exercise.elements.map((token, index) => (
          <button
            class={index === player.index && player.phase !== "idle" && player.phase !== "countdown" ? "current" : ""}
            type="button"
            title={token}
            aria-label={token}
            aria-current={index === player.index && player.phase === "running" ? "true" : undefined}
            onClick={() => {
              setPlayer((current) => ({
                ...current,
                phase: "paused",
                index,
                deadline: null,
                held: "running",
                remainingMs: manual ? null : beatMs(bpm, index, current.length, exercise.wordStarts, portion, exercise.elements, isText && punctuationPauses),
              }));
              sessionStorage.removeItem(RUN_KEY);
            }}
          />
        ))}
      </nav>
      <div class="tempo-row"><button class="ghost icon-button" type="button" onClick={resetExercise} aria-label="Сбросить упражнение" title="Сбросить упражнение"><Icon name="reset" /></button></div>
      <div class="stage-navigation">
      <button class="ghost side-navigation" type="button" onClick={goBack} aria-label="Назад"><Icon name="back" /></button>
      <div
        class="stage-wrap"
        aria-label={player.phase === "running" || player.phase === "countdown" || player.phase === "resting" ? "Пауза" : "Старт"}
        onClick={() => { if (swiped.current) { swiped.current = false; return; } toggle(); }}
        onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; swiped.current = false; }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
          swiped.current = true;
          if (dx < 0) goForward(); else goBack();
        }}
      >
      {(player.phase === "paused" || player.phase === "idle" || (player.phase === "completed" && !followHref)) && (
        <div class="pause-veil">
          {(player.phase === "paused" || player.phase === "idle") && (
            <p class="articulation-hint">Произносите чётко, активно двигайте губами и языком. Держите челюсть свободной, без напряжения.</p>
          )}
          {player.phase === "paused" && <PauseMark />}
          {player.phase === "idle" && <PlayMark />}
          {player.phase === "completed" && !followHref && (
            <button class="veil-restart" type="button" onClick={(event) => {
              event.stopPropagation();
              sessionStorage.removeItem(RUN_KEY);
              const first = series[0];
              if (!first || first.id === exercise.id) {
                startedAt.current = null;
                sessionId.current = null;
                setPlayer((current) => cancel(current));
                return;
              }
              location.hash = first.href;
            }}>
              <ReplayMark />
              <span>Серия закончена</span>
            </button>
          )}
        </div>
      )}
      {(player.phase === "countdown" || player.phase === "resting" || (player.phase === "paused" && (player.held === "countdown" || player.held === "resting"))) && (
        <p class="count-line" aria-hidden="true">{countLeft ?? (player.phase === "resting" || player.held === "resting" ? restBeats : countdownBeats)}</p>
      )}
      <div class={`stage ${isText ? "stage-text" : ""}`} aria-live="polite">
        {displayRows(exercise.elements, exercise.wordStarts).map((line) => (
          <span class="word-line">
            {line.map((token) => {
              const syllable = previewWord == null && token.index === player.index && player.phase === "running";
              const preview = previewWord === token.word;
              const name = [
                "token",
                syllable ? "active" : "",
                syllable && beat ? "glow" : "",
                preview ? "preview" : "",
              ].filter(Boolean).join(" ");
              return <span class={name}>{token.text}</span>;
            })}
          </span>
        ))}
      </div>
      </div>
      <button class="ghost side-navigation" type="button" onClick={goForward} aria-label="Вперёд"><Icon name="next" /></button>
      </div>
      {exercise.note && <p class="meta">{exercise.note}</p>}
      {player.phase === "completed" && (
        <div class="controls" style={{ marginTop: 16 }}>
          <label class="field">Насколько было трудно
            <select value={rating ?? ""} onChange={(event) => {
              const value = Number((event.target as HTMLSelectElement).value);
              if (value >= 1 && value <= 5) setRating(value);
            }}>
              <option value="" disabled>оценка</option>
              {[1, 2, 3, 4, 5].map((value) => <option value={value}>{value}</option>)}
            </select>
          </label>
          {followHref && <p class="meta">Дальше откроется само, пока занятие не остановлено.</p>}
        </div>
      )}
      {saved && <p>{saved}</p>}
    </main>
  );
}

const RUN_KEY = "articulation-run";

function PlayMark() {
  return (
    <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" />
      <path d="M26 20v24l20-12z" />
    </svg>
  );
}

function ReplayMark() {
  return (
    <svg class="mark replay" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" />
      <path d="M44 24a14 14 0 1 0 2.2 10" />
      <path d="M44 16v10H34" />
    </svg>
  );
}

function PauseMark() {
  return (
    <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" />
      <path d="M24 20h6v24h-6zm10 0h6v24h-6z" />
    </svg>
  );
}

function formatLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function label(phase: PlayerState["phase"]): string {
  const names: Record<PlayerState["phase"], string> = {
    idle: "ожидание",
    countdown: "отсчёт",
    running: "идёт",
    resting: "пауза между сериями",
    paused: "пауза",
    completed: "готово",
  };
  return names[phase];
}

function History() {
  const [rows, setRows] = useState<SessionRecord[] | null>(null);
  const [japaRows] = useState<JapaSession[]>(loadJapaHistory);
  const [error, setError] = useState("");

  useEffect(() => {
    listSessions().then(setRows).catch(() => setError("История недоступна в этом браузере."));
  }, []);

  async function wipe() {
    try {
      await clearSessions();
      setRows([]);
    } catch {
      setError("Удалить историю не удалось.");
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(rows ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "articulation-history.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>История</h1>
      <h2>Джапа</h2>
      {japaRows.length === 0 && <p>Сессий джапы пока нет.</p>}
      {japaRows.map((session) => <details class="japa-card" key={session.id}><summary>{new Date(session.startedAt).toLocaleString()} · {session.durations.length} из {session.target} кругов · {session.completed ? "завершена" : "не завершена"}</summary><p>Время завершённых кругов: {japaTime(session.durations.reduce((sum, duration) => sum + duration, 0))}</p><ol>{session.durations.map((duration, index) => <li key={index}>Круг {index + 1}: {japaTime(duration)}</li>)}</ol></details>)}
      <h2>Тренировки артикуляции</h2>
      {error && <p class="notice">{error}</p>}
      {rows && rows.length === 0 && <p>Пока пусто.</p>}
      <ul class="history">
        {rows?.map((row) => (
          <li>
            <strong>{row.title}</strong>
            <div class="meta">{new Date(row.startedAt).toLocaleString()} · {row.bpm} BPM · {Math.round(row.durationMs / 1000)} с{row.rating ? ` · оценка ${row.rating}` : ""}</div>
          </li>
        ))}
      </ul>
      <div class="controls">
        <button class="ghost" type="button" onClick={download}>Экспорт JSON</button>
        <button class="ghost" type="button" onClick={() => void wipe()}>Удалить</button>
      </div>
    </main>
  );
}
