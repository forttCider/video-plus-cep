import React from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "./components/ui/tooltip"
import "./styles/globals.css"
import App from "./components/App"

const root = createRoot(document.getElementById("root"))
root.render(
  <TooltipProvider>
    <App />
  </TooltipProvider>
)
