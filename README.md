# ☕ Java Step Debugger & Execution Visualizer

A step-by-step Java code visualizer matching the exact UI from your screenshots. It allows you to paste or write any Java code, step through its execution line-by-line, inspect variable values, trace call frames, and view real-time standard output.

---

## 🚀 Getting Started

The debugger server is currently running at:
👉 **[http://localhost:3000](http://localhost:3000)**

To run or restart the server in the future:
```bash
cd /Users/bhavesh390/.gemini/antigravity/scratch/java-step-debugger
./run.sh
```

---

## 🎨 Features & Capabilities

1. **Exact UI & Stepping Experience (from screenshots)**:
   - **Code Container**: Monospace code view with grey dashed border, syntax coloring, line numbers, and the active execution indicator (`▶`).
   - **Variables Card**: Blue header bar with the active method and line (`main:5`), cleanly listing local variable names and their runtime values.
   - **Output Terminal**: Blue header `Output` console that updates standard output dynamically as each line executes.
   - **Scrubber & Step Navigation**: Interactive blue slider bar and `Prev` / `Next` buttons with step counter (`x / total`).

2. **Full Java Standard Library Support**:
   - Compiles and runs directly on JDK 21.
   - Includes standard libraries out-of-the-box (`java.util.*`, `java.io.*`, `java.math.*`, `java.time.*`).
   - Works with `ArrayList`, `HashMap`, `Scanner`, `Arrays`, `Math`, recursion, and custom object classes without missing import errors.

3. **Code Editor & Preloaded Examples**:
   - Click **"Edit Code"** or the top dropdown to switch examples or write your own code.
   - Preloaded with:
     - *While Loop (Screenshot Example)*
     - *For Loop & Array Sum*
     - *ArrayList & Collections*
     - *Factorial (Recursion with Call Stack)*
     - *Bubble Sort*
     - *Custom Class & Objects*

4. **Keyboard Shortcuts**:
   - <kbd>←</kbd> (Left Arrow): Step backward (`Prev`)
   - <kbd>→</kbd> (Right Arrow): Step forward (`Next`)
   - <kbd>Space</kbd>: Auto-play / Pause stepping
