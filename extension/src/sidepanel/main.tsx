import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { SidePanel } from "./SidePanel";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
