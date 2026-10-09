// ==========================================================================
// Java Step Debugger - Frontend Application
// Direct in-block compiler & editor with VS Code-style auto-indentation,
// real-time syntax highlighting, and step-by-step execution visualization.
// ==========================================================================

const IS_LOCAL = (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === ''
);

const BACKEND_URL = (typeof window.BACKEND_URL !== 'undefined' && window.BACKEND_URL)
  ? window.BACKEND_URL
  : (IS_LOCAL ? '' : null);

// ---------------------------------------------------------------------------
// Java Syntax Sets
// ---------------------------------------------------------------------------
const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'record', 'var'
]);

const JAVA_BUILTIN_TYPES = new Set([
  'String', 'Integer', 'Double', 'Boolean', 'Character', 'Long', 'Float',
  'Byte', 'Short', 'Object', 'System', 'Math', 'Arrays', 'Collections',
  'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'Set', 'HashSet',
  'Scanner', 'PrintStream', 'StringBuilder', 'StringBuffer', 'Exception'
]);

// ---------------------------------------------------------------------------
// Main App Class
// ---------------------------------------------------------------------------
class DebuggerApp {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
    this.sourceCode = '';
    this.isPlaying = false;
    this.playInterval = null;
    this.examples = {};
    this.embeddedTraces = {};
    this.lineCount = 0;

    this.initDOMElements();
    this.bindEvents();
    this.loadInitialData();
  }

  // -------------------------------------------------------------------------
  initDOMElements() {
    this.codeEditorEl         = document.getElementById('codeEditor');
    this.editorGutterEl       = document.getElementById('editorGutter');
    this.editorHighlightEl    = document.getElementById('editorHighlight');
    this.codeContainerEl      = document.getElementById('codeContainer');
    this.currentFrameTagEl    = document.getElementById('currentFrameTag');
    this.variablesBodyEl      = document.getElementById('variablesBody');
    this.callStackContainerEl = document.getElementById('callStackContainer');
    this.callStackChipsEl     = document.getElementById('callStackChips');
    this.terminalOutputEl     = document.getElementById('terminalOutput');
    this.stepSliderEl         = document.getElementById('stepSlider');
    this.stepCounterEl        = document.getElementById('stepCounter');
    this.prevBtn              = document.getElementById('prevBtn');
    this.nextBtn              = document.getElementById('nextBtn');
    this.autoPlayBtn          = document.getElementById('autoPlayBtn');
    this.playIconEl           = document.getElementById('playIcon');
    this.runCodeBtn           = document.getElementById('runCodeBtn');
    this.exampleSelectEl      = document.getElementById('exampleSelect');
    this.errorBannerEl        = document.getElementById('errorBanner');
    this.errorMessageEl       = document.getElementById('errorMessage');
    this.errorDetailsEl       = document.getElementById('errorDetails');
    this.stdinInputEl         = document.getElementById('stdinInput');
  }

  // -------------------------------------------------------------------------
  bindEvents() {
    // Stepping and navigation
    this.prevBtn.addEventListener('click', () => this.stepPrev());
    this.nextBtn.addEventListener('click', () => this.stepNext());

    this.stepSliderEl.addEventListener('input', (e) => {
      this.goToStep(parseInt(e.target.value, 10) - 1);
    });

    this.autoPlayBtn.addEventListener('click', () => this.toggleAutoPlay());

    // Run / Visualize button
    this.runCodeBtn.addEventListener('click', () => {
      const code = this.codeEditorEl.value.trim() || this.sourceCode;
      this.executeCode(code);
    });

    // Code Editor Events: Input, Keydown (smart indentation), and Scroll sync
    this.codeEditorEl.addEventListener('input', () => this.onCodeInput());
    this.codeEditorEl.addEventListener('keydown', (e) => this.handleEditorKeyDown(e));

    this.codeEditorEl.addEventListener('scroll', () => {
      this.editorHighlightEl.scrollTop = this.codeEditorEl.scrollTop;
      this.editorHighlightEl.scrollLeft = this.codeEditorEl.scrollLeft;
      this.editorGutterEl.scrollTop = this.codeEditorEl.scrollTop;
    });

    // Clicking gutter lines focuses textarea
    this.editorGutterEl.addEventListener('click', () => {
      this.codeEditorEl.focus();
    });

    // Example Dropdown
    this.exampleSelectEl.addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;

      const ex = this.examples[key];
      if (!ex) return;

      this.codeEditorEl.value = ex.code;
      if (this.stdinInputEl) {
        this.stdinInputEl.value = ex.defaultStdin || '';
      }

      this.onCodeInput();

      if (this.embeddedTraces[key]) {
        this.applyTrace(ex.code, this.embeddedTraces[key]);
      } else {
        this.executeCode(ex.code, ex.defaultStdin || '');
      }
    });

    // Keyboard Shortcuts (Arrow Left/Right to step, Space to play/pause)
    window.addEventListener('keydown', (e) => {
      // Do not intercept arrow keys or space when typing inside the editor or inputs
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.stepPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.stepNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        this.toggleAutoPlay();
      }
    });
  }

  // -------------------------------------------------------------------------
  // VS Code-style Smart Coding & Space/Indentation Rules
  // -------------------------------------------------------------------------
  handleEditorKeyDown(e) {
    const textarea = this.codeEditorEl;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // 1. Shortcut: Ctrl+Enter or Cmd+Enter to immediately Visualize Execution
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.executeCode(textarea.value);
      return;
    }

    // 2. Tab key: Indent 4 spaces (or Shift+Tab unindent)
    if (e.key === 'Tab') {
      e.preventDefault();
      if (start === end && !e.shiftKey) {
        // Single cursor -> insert 4 spaces
        const before = text.substring(0, start);
        const after = text.substring(end);
        textarea.value = before + '    ' + after;
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      } else {
        // Multi-line selection or Shift+Tab
        const firstLineStart = text.lastIndexOf('\n', start - 1) + 1;
        let lastLineEnd = text.indexOf('\n', end);
        if (lastLineEnd === -1) lastLineEnd = text.length;

        const target = text.substring(firstLineStart, lastLineEnd);
        const lines = target.split('\n');

        if (!e.shiftKey) {
          // Indent each line by 4 spaces
          const indented = lines.map(l => '    ' + l).join('\n');
          textarea.value = text.substring(0, firstLineStart) + indented + text.substring(lastLineEnd);
          textarea.selectionStart = start + 4;
          textarea.selectionEnd = end + (lines.length * 4);
        } else {
          // Un-indent each line by up to 4 spaces
          let firstLineRem = 0;
          let totalRem = 0;
          const unindented = lines.map((l, idx) => {
            let rem = 0;
            if (l.startsWith('    ')) rem = 4;
            else if (l.startsWith('   ')) rem = 3;
            else if (l.startsWith('  ')) rem = 2;
            else if (l.startsWith(' ')) rem = 1;
            else if (l.startsWith('\t')) rem = 1;
            if (idx === 0) firstLineRem = rem;
            totalRem += rem;
            return l.substring(rem);
          }).join('\n');
          textarea.value = text.substring(0, firstLineStart) + unindented + text.substring(lastLineEnd);
          textarea.selectionStart = Math.max(firstLineStart, start - firstLineRem);
          textarea.selectionEnd = Math.max(firstLineStart, end - totalRem);
        }
      }
      this.onCodeInput();
      return;
    }

    // 3. Enter key: Smart Java Auto-Indentation (VS Code rule)
    if (e.key === 'Enter') {
      e.preventDefault();
      const beforeCursor = text.substring(0, start);
      const afterCursor = text.substring(end);

      // Extract current line before cursor
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const currentLine = beforeCursor.substring(lastNewline + 1);

      // Leading indentation of current line
      const indentMatch = currentLine.match(/^[ \t]*/);
      const currentIndent = indentMatch ? indentMatch[0] : '';

      // Check if current line ends with open brace {
      const trimmedLineBefore = currentLine.trimEnd();
      const endsWithOpenBrace = trimmedLineBefore.endsWith('{');
      const isBetweenBraces = endsWithOpenBrace && afterCursor.startsWith('}');

      if (isBetweenBraces) {
        // Between { and } -> newline + indent + 4 spaces + newline + currentIndent
        const insideIndent = currentIndent + '    ';
        const insertion = '\n' + insideIndent + '\n' + currentIndent;
        textarea.value = beforeCursor + insertion + afterCursor;
        textarea.selectionStart = textarea.selectionEnd = start + 1 + insideIndent.length;
      } else if (endsWithOpenBrace) {
        // Inside loop or block ending with { -> new line starts with 4 extra spaces
        const newIndent = currentIndent + '    ';
        const insertion = '\n' + newIndent;
        textarea.value = beforeCursor + insertion + afterCursor;
        textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
      } else {
        // Standard line -> preserve current line's leading spaces
        const insertion = '\n' + currentIndent;
        textarea.value = beforeCursor + insertion + afterCursor;
        textarea.selectionStart = textarea.selectionEnd = start + insertion.length;
      }
      this.onCodeInput();
      return;
    }

    // 4. Auto-closing pairs: { } ( ) [ ] " " ' '
    const pairs = { '{': '}', '(': ')', '[': ']', '"': '"', "'": "'" };
    const closers = ['}', ')', ']', '"', "'"];

    if (pairs[e.key]) {
      e.preventDefault();
      const closer = pairs[e.key];
      if (start !== end) {
        // Wrap selected text
        const sel = text.substring(start, end);
        textarea.value = text.substring(0, start) + e.key + sel + closer + text.substring(end);
        textarea.selectionStart = start + 1;
        textarea.selectionEnd = end + 1;
      } else {
        // Insert pair and place cursor between
        textarea.value = text.substring(0, start) + e.key + closer + text.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
      this.onCodeInput();
      return;
    }

    // 5. Skip closing character if typed right before existing one
    if (closers.includes(e.key) && start === end && text.charAt(start) === e.key) {
      e.preventDefault();
      textarea.selectionStart = textarea.selectionEnd = start + 1;
      return;
    }

    // 6. Backspace: delete matching empty pair
    if (e.key === 'Backspace' && start === end && start > 0) {
      const prevChar = text.charAt(start - 1);
      const nextChar = text.charAt(start);
      if (
        (prevChar === '{' && nextChar === '}') ||
        (prevChar === '(' && nextChar === ')') ||
        (prevChar === '[' && nextChar === ']') ||
        (prevChar === '"' && nextChar === '"') ||
        (prevChar === "'" && nextChar === "'")
      ) {
        e.preventDefault();
        textarea.value = text.substring(0, start - 1) + text.substring(start + 1);
        textarea.selectionStart = textarea.selectionEnd = start - 1;
        this.onCodeInput();
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sync Highlight and Gutter when Code changes
  // -------------------------------------------------------------------------
  onCodeInput() {
    this.sourceCode = this.codeEditorEl.value;
    const lines = this.sourceCode.split('\n');

    // 1. Update Gutter Line Numbers
    if (lines.length !== this.lineCount) {
      this.lineCount = lines.length;
      let gutterHtml = '';
      for (let i = 1; i <= lines.length; i++) {
        gutterHtml += `
          <div class="gutter-row" id="gutter-row-${i}">
            <span class="gutter-arrow">▶</span>
            <span class="gutter-num">${i}</span>
          </div>`;
      }
      this.editorGutterEl.innerHTML = gutterHtml;
    }

    // 2. Update Syntax Highlight Layer
    let highlightHtml = '';
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const highlightedTokens = this.highlightJavaLine(lineText);
      highlightHtml += `<div class="editor-line" id="code-line-${lineNum}">${highlightedTokens}</div>`;
    });
    this.editorHighlightEl.innerHTML = highlightHtml;
  }

  // -------------------------------------------------------------------------
  // Syntax Tokenizer for Java
  // -------------------------------------------------------------------------
  highlightJavaLine(line) {
    if (!line) return '&nbsp;';

    const tokenRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?(?:[fFdDlL])?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[{}()\[\].,;+\-*/%&|^!=<>?:]+|\s+)/g;

    let highlighted = '';
    let match;

    while ((match = tokenRegex.exec(line)) !== null) {
      const token = match[0];

      if (token.startsWith('//') || token.startsWith('/*')) {
        highlighted += `<span class="syn-com">${this.escapeHtml(token)}</span>`;
      } else if (token.startsWith('"') || token.startsWith("'")) {
        highlighted += `<span class="syn-str">${this.escapeHtml(token)}</span>`;
      } else if (/^\d/.test(token)) {
        highlighted += `<span class="syn-num">${this.escapeHtml(token)}</span>`;
      } else if (JAVA_KEYWORDS.has(token)) {
        highlighted += `<span class="syn-kw">${this.escapeHtml(token)}</span>`;
      } else if (JAVA_BUILTIN_TYPES.has(token) || /^[A-Z][a-zA-Z0-9_$]*$/.test(token)) {
        highlighted += `<span class="syn-type">${this.escapeHtml(token)}</span>`;
      } else {
        highlighted += this.escapeHtml(token);
      }
    }

    return highlighted || '&nbsp;';
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // -------------------------------------------------------------------------
  async loadInitialData() {
    // 1. Load pre-computed traces
    try {
      const resp = await fetch('embedded_traces.json');
      if (resp.ok) {
        this.embeddedTraces = await resp.json();
        for (const [key, tr] of Object.entries(this.embeddedTraces)) {
          this.examples[key] = {
            title: tr.title,
            code: tr.code,
            defaultStdin: tr.defaultStdin || ''
          };
        }
      }
    } catch (e) {
      console.warn('Could not load embedded_traces.json:', e);
    }

    // 2. Local dev check
    if (IS_LOCAL) {
      try {
        const resp = await fetch('/api/examples');
        if (resp.ok) {
          const liveEx = await resp.json();
          for (const [key, ex] of Object.entries(liveEx)) {
            if (!this.examples[key]) {
              this.examples[key] = { title: ex.title, code: ex.code, defaultStdin: '' };
            }
          }
        }
      } catch (e) {
        console.warn('Live /api/examples not available:', e);
      }
    }

    // 3. Populate dropdown
    this.populateExamplesDropdown();

    // 4. Default Example (While Loop)
    const defaultKey = 'while_loop';
    this.exampleSelectEl.value = defaultKey;
    const defaultEx = this.examples[defaultKey];
    const defaultCode = defaultEx
      ? defaultEx.code
      : `public class Example {\n    public static void main(String[] args) {\n        int number = 1;\n\n        while (number < 6) {\n            System.out.println(number);\n            number++;\n        }\n    }\n}`;

    this.codeEditorEl.value = defaultCode;
    this.onCodeInput();

    if (defaultEx && this.embeddedTraces[defaultKey]) {
      this.applyTrace(defaultCode, this.embeddedTraces[defaultKey]);
    } else {
      this.executeCode(defaultCode, '');
    }
  }

  // -------------------------------------------------------------------------
  populateExamplesDropdown() {
    while (this.exampleSelectEl.options.length > 1) {
      this.exampleSelectEl.remove(1);
    }

    for (const [key, ex] of Object.entries(this.examples)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = ex.title;
      this.exampleSelectEl.appendChild(opt);
    }
  }

  // -------------------------------------------------------------------------
  applyTrace(code, traceData) {
    this.pauseAutoPlay();
    this.clearError();

    this.sourceCode = code;
    this.codeEditorEl.value = code;
    this.onCodeInput();

    this.steps = traceData.steps || [];

    if (this.steps.length === 0) {
      this.showError('No Steps Recorded', 'Program terminated without hitting traceable execution lines.');
      return;
    }

    this.stepSliderEl.min = '1';
    this.stepSliderEl.max = String(this.steps.length);
    this.goToStep(this.steps.length > 1 ? 1 : 0);
  }

  // -------------------------------------------------------------------------
  async executeCode(code, stdin) {
    this.pauseAutoPlay();
    this.clearError();

    const stdinValue = stdin !== undefined ? stdin :
      (this.stdinInputEl && this.stdinInputEl.value ? this.stdinInputEl.value : '');

    // 1. Check matching embedded trace
    const cleanInputCode = code.trim().replace(/\r\n/g, '\n');
    for (const [key, tr] of Object.entries(this.embeddedTraces)) {
      const cleanTraceCode = (tr.code || '').trim().replace(/\r\n/g, '\n');
      if (cleanInputCode === cleanTraceCode) {
        this.applyTrace(code, tr);
        return;
      }
    }

    // 2. If running locally with backend, try JDI tracer
    if (IS_LOCAL) {
      this.setLoadingState(true);
      try {
        const resp = await fetch('/api/trace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, stdin: stdinValue })
        });

        if (resp.ok) {
          const data = await resp.json();
          this.setLoadingState(false);
          if (data.success && data.steps && data.steps.length > 0) {
            this.applyTrace(code, data);
            return;
          } else if (!data.success) {
            this.showError(data.message || 'Compilation Error', data.error || 'Failed to trace code.');
            return;
          }
        }
      } catch (err) {
        console.warn('Local JDI backend unavailable, using simulator:', err);
      }
      this.setLoadingState(false);
    }

    // 3. Client-side Java Simulator Engine
    if (typeof JavaSimulator !== 'undefined') {
      this.setLoadingState(true);
      try {
        const sim = new JavaSimulator();
        const result = sim.simulate(code, stdinValue);
        this.setLoadingState(false);

        if (result.success && result.steps && result.steps.length > 0) {
          this.applyTrace(code, result);
          return;
        } else if (!result.success) {
          this.showError('Compilation / Execution Error', result.error || 'Failed to execute Java code.');
          return;
        } else {
          this.showError('No Steps Recorded', 'Program terminated without hitting traceable execution lines.');
          return;
        }
      } catch (simErr) {
        this.setLoadingState(false);
        this.showError('Simulation Error', simErr.message);
        return;
      }
    }

    this.showError(
      'Execution Error',
      'Java execution engine is initializing. Please refresh and try again.'
    );
  }

  // -------------------------------------------------------------------------
  setLoadingState(loading) {
    if (loading) {
      this.runCodeBtn.disabled = true;
      this.runCodeBtn.innerHTML = '<span>⏳ Compiling...</span>';
    } else {
      this.runCodeBtn.disabled = false;
      this.runCodeBtn.innerHTML = '<span class="btn-icon">▶</span> Visualize Execution';
    }
  }

  showError(msg, details) {
    this.errorMessageEl.textContent = msg;
    this.errorDetailsEl.textContent = details;
    this.errorBannerEl.classList.remove('hidden');
  }

  clearError() {
    this.errorBannerEl.classList.add('hidden');
    this.errorMessageEl.textContent = '';
    this.errorDetailsEl.textContent = '';
  }

  // -------------------------------------------------------------------------
  goToStep(index) {
    if (index < 0 || index >= this.steps.length) return;

    this.currentStep = index;
    const step = this.steps[index];

    // 1. Clear previous active highlights in both gutter and code lines
    document.querySelectorAll('.gutter-row.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.editor-line.active').forEach(el => el.classList.remove('active'));

    // 2. Highlight active line in gutter and code highlight
    const activeGutterEl = document.getElementById(`gutter-row-${step.line}`);
    const activeCodeLineEl = document.getElementById(`code-line-${step.line}`);

    if (activeGutterEl) activeGutterEl.classList.add('active');
    if (activeCodeLineEl) activeCodeLineEl.classList.add('active');

    // 3. Smooth internal scroll inside code block to keep active line centered
    if (activeCodeLineEl && this.codeEditorEl) {
      const textarea = this.codeEditorEl;
      const cTop = textarea.scrollTop;
      const cHeight = textarea.clientHeight;
      const lTop = activeCodeLineEl.offsetTop;
      const lHeight = activeCodeLineEl.offsetHeight;

      if (lTop < cTop + 40) {
        textarea.scrollTo({ top: Math.max(0, lTop - 40), behavior: 'smooth' });
      } else if (lTop + lHeight > cTop + cHeight - 40) {
        textarea.scrollTo({ top: lTop + lHeight - cHeight + 40, behavior: 'smooth' });
      }
    }

    // 4. Update Current Frame Tag: e.g. "main:5"
    this.currentFrameTagEl.textContent = step.frame || `line ${step.line}`;

    // 5. Update Variables Table
    this.variablesBodyEl.innerHTML = '';
    if (step.variables && step.variables.length > 0) {
      step.variables.forEach(v => {
        const row = document.createElement('div');
        row.className = 'var-row';
        row.innerHTML = `
          <span class="var-name">${this.escapeHtml(v.name)}</span>
          <span class="var-value">${this.escapeHtml(v.value)}</span>
        `;
        this.variablesBodyEl.appendChild(row);
      });
    } else {
      this.variablesBodyEl.innerHTML = '<div class="no-vars">(no variables in scope)</div>';
    }

    // 6. Update Call Stack (if recursive / multiple frames)
    if (step.callStack && step.callStack.length > 1) {
      this.callStackContainerEl.classList.remove('hidden');
      this.callStackChipsEl.innerHTML = '';
      step.callStack.forEach(frame => {
        const chip = document.createElement('span');
        chip.className = 'call-chip';
        chip.textContent = `${frame.method}:${frame.line}`;
        this.callStackChipsEl.appendChild(chip);
      });
    } else {
      this.callStackContainerEl.classList.add('hidden');
    }

    // 7. Update Terminal Output
    this.terminalOutputEl.textContent = step.output || '';
    this.terminalOutputEl.scrollTop = this.terminalOutputEl.scrollHeight;

    // 8. Update Slider and Counter
    this.stepSliderEl.value = String(index + 1);
    this.stepCounterEl.textContent = `${index + 1} / ${this.steps.length}`;

    // 9. Update Navigation Buttons state
    this.prevBtn.disabled = (index === 0);
    this.nextBtn.disabled = (index === this.steps.length - 1);
  }

  // -------------------------------------------------------------------------
  stepPrev() {
    if (this.currentStep > 0) this.goToStep(this.currentStep - 1);
  }

  stepNext() {
    if (this.currentStep < this.steps.length - 1) {
      this.goToStep(this.currentStep + 1);
    } else if (this.isPlaying) {
      this.pauseAutoPlay();
    }
  }

  toggleAutoPlay() {
    this.isPlaying ? this.pauseAutoPlay() : this.startAutoPlay();
  }

  startAutoPlay() {
    if (this.currentStep >= this.steps.length - 1) this.goToStep(0);
    this.isPlaying = true;
    this.playIconEl.textContent = '⏸';
    this.playInterval = setInterval(() => this.stepNext(), 700);
  }

  pauseAutoPlay() {
    this.isPlaying = false;
    this.playIconEl.textContent = '⏵';
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DebuggerApp();
});
