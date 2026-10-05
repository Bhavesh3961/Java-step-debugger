# ☕ Java Step Debugger & Execution Visualizer

[![Java 21](https://img.shields.io/badge/Java-21%20LTS-orange.svg)](https://www.oracle.com/java/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Deployment%20Ready-black.svg)](https://vercel.com/)
[![Built with JDI](https://img.shields.io/badge/Engine-JDK%20JDI-blueviolet.svg)](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.jdi/module-summary.html)

An interactive, browser-based Java execution visualizer that allows you to paste or write Java code, step through its execution line-by-line, inspect variable values, trace call stack frames, and view real-time standard output.

---

## 📸 Overview & Features

- **Exact Visualizer UI**:
  - **Code Panel**: Dark slate editor with grey dashed container outline, line numbers, and the active execution indicator (`▶`).
  - **Variables Card**: Blue header bar (`main:5`), displaying variable `Name` and `Value` with real runtime values.
  - **Dynamic Output Console**: Live standard output terminal updated in real time.
  - **Scrubber & Playback**: Timeline slider, `Prev` / `Next` buttons, and step counter (`x / total`).
- **All Standard Java Libraries Included**:
  - Automatic support for `java.util.*`, `java.io.*`, `java.math.*`, `java.time.*`.
  - Works with `ArrayList`, `HashMap`, `Scanner`, `Arrays`, `Math`, recursion, and custom object classes without missing import errors.
- **Dedicated Standard Input (`stdin`) Bar**:
  - Supports `Scanner(System.in)` and `BufferedReader` with custom or default inputs.
- **Single-Screen Focused Layout**:
  - Code box scrolls internally to keep the active line centered, keeping the entire interface visible on one screen without page jumping.
- **Dedicated About Page**:
  - Architecture breakdown, feature matrix, and keyboard shortcuts table.

---

## 🚀 Quick Start (Local)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Bhavesh3961/java-step-debugger.git
   cd java-step-debugger
   ```

2. **Run with one command**:
   ```bash
   ./run.sh
   ```

3. **Open in your browser**:
   👉 `http://localhost:3000`

---

## 🌐 Deploy to Vercel

### Option 1: One-Click via GitHub (Recommended)
1. Push this repository to your GitHub account (`Bhavesh3961/java-step-debugger`).
2. Go to [vercel.com](https://vercel.com) and log in.
3. Click **"Add New Project"** → Select `java-step-debugger`.
4. Click **Deploy**. Vercel will automatically detect `vercel.json` and deploy the frontend!

### Option 2: Deploy via Vercel CLI
```bash
npx vercel
```
Follow the terminal prompts to log in and select your scope.

---

## 📤 Push to GitHub

To push this project to your GitHub account:

```bash
# 1. Create a new repository on GitHub named "java-step-debugger" (https://github.com/new)
# 2. Add your GitHub remote:
git remote add origin https://github.com/Bhavesh3961/java-step-debugger.git

# 3. Push to main:
git push -u origin main
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| <kbd>→</kbd> (Right Arrow) | Step forward (`Next`) |
| <kbd>←</kbd> (Left Arrow) | Step backward (`Prev`) |
| <kbd>Space</kbd> | Toggle auto-play / pause |

---

## 👨‍💻 Author

Created by [Bhavesh3961](https://github.com/Bhavesh3961).
Licensed under the [MIT License](LICENSE).
