import { render } from "preact";
import "@fontsource/noto-sans/cyrillic-500.css";
import "@fontsource/noto-sans/latin-500.css";
import "@fontsource/noto-sans/cyrillic-700.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-serif/cyrillic-600.css";
import "@fontsource/noto-serif/latin-600.css";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
