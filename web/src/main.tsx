import { render } from "preact";
import "@fontsource/noto-sans/cyrillic-500.css";
import "@fontsource/noto-sans/latin-500.css";
import "@fontsource/noto-sans/cyrillic-700.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-sans/latin-ext-500.css";
import "@fontsource/noto-sans/latin-ext-700.css";
import "@fontsource/noto-sans/cyrillic-ext-500.css";
import "@fontsource/noto-sans/cyrillic-ext-700.css";
import "@fontsource/noto-sans/cyrillic-ext-500-italic.css";
import "@fontsource/noto-sans/cyrillic-500-italic.css";
import "@fontsource/noto-sans/latin-500-italic.css";
import "@fontsource/noto-sans/latin-ext-500-italic.css";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
