import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import TerminalWindowApp from "./components/TerminalWindowApp";
import { applyCachedTheme } from "./theme";
import { initTerminalStoreSync } from "./utils/terminalStoreSync";
import "./index.css";

applyCachedTheme();

function isTerminalWindow(): boolean {
  try {
    if (getCurrentWindow().label === "ssh-terminal") return true;
  } catch {
    /* not in Tauri */
  }
  return new URLSearchParams(window.location.search).get("view") === "terminal";
}

const Root = isTerminalWindow() ? TerminalWindowApp : App;

initTerminalStoreSync();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
