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


## 👨‍💻 Author

Created by [Bhavesh3961](https://github.com/Bhavesh3961).
Licensed under the [MIT License](LICENSE).
