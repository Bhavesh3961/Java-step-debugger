// ==========================================================================
// Java Step Debugger - Frontend Application
// Vercel-compatible: examples use embedded pre-computed traces.
// Custom code: calls backend (localhost in dev, or BACKEND_URL in prod).
// ==========================================================================

// ---------------------------------------------------------------------------
// Backend URL config
// On Vercel the frontend is static — backend must be hosted separately.
// Set window.BACKEND_URL in a <script> tag or environment to override.
// ---------------------------------------------------------------------------
const IS_LOCAL = (
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === ''
);

const BACKEND_URL = (typeof window.BACKEND_URL !== 'undefined' && window.BACKEND_URL)
  ? window.BACKEND_URL
  : (IS_LOCAL ? '' : null);   // null = no backend available on Vercel

// ---------------------------------------------------------------------------
// Java Syntax Highlighting sets
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
    this.examples = {};          // { key: {title, code, defaultStdin} }
    this.embeddedTraces = {};    // pre-computed traces loaded from JSON

    this.initDOMElements();
    this.bindEvents();
    this.loadInitialData();
  }

  // -------------------------------------------------------------------------
  initDOMElements() {
    this.codeLinesEl          = document.getElementById('codeLines');
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
    this.toggleEditBtn        = document.getElementById('toggleEditBtn');
    this.runCodeBtn           = document.getElementById('runCodeBtn');
    this.editorSectionEl      = document.getElementById('editorSection');
    this.codeEditorEl         = document.getElementById('codeEditor');
    this.closeEditorBtn       = document.getElementById('closeEditorBtn');
    this.runFromEditorBtn     = document.getElementById('runFromEditorBtn');
    this.exampleSelectEl      = document.getElementById('exampleSelect');
    this.errorBannerEl        = document.getElementById('errorBanner');
    this.errorMessageEl       = document.getElementById('errorMessage');
    this.errorDetailsEl       = document.getElementById('errorDetails');
    this.stdinInputEl         = document.getElementById('stdinInput');
  }

  // -------------------------------------------------------------------------
  bindEvents() {
    this.prevBtn.addEventListener('click', () => this.stepPrev());
    this.nextBtn.addEventListener('click', () => this.stepNext());

    this.stepSliderEl.addEventListener('input', (e) => {
      this.goToStep(parseInt(e.target.value, 10) - 1);
    });

    this.autoPlayBtn.addEventListener('click', () => this.toggleAutoPlay());

    this.toggleEditBtn.addEventListener('click', () => {
      this.editorSectionEl.classList.toggle('hidden');
      if (!this.editorSectionEl.classList.contains('hidden')) {
        this.codeEditorEl.value = this.sourceCode;
        this.codeEditorEl.focus();
      }
    });

    this.closeEditorBtn.addEventListener('click', () => {
      this.editorSectionEl.classList.add('hidden');
    });

    const triggerRun = () => {
      const code = this.codeEditorEl.value.trim() || this.sourceCode;
      this.executeCode(code);
    };

    this.runCodeBtn.addEventListener('click', triggerRun);
    this.runFromEditorBtn.addEventListener('click', triggerRun);

    this.exampleSelectEl.addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;

      const ex = this.examples[key];
      if (!ex) return;

      this.codeEditorEl.value = ex.code;
      if (this.stdinInputEl) {
        this.stdinInputEl.value = ex.defaultStdin || '';
      }

      // Use embedded trace if available (works on Vercel without backend)
      if (this.embeddedTraces[key]) {
        this.applyTrace(ex.code, this.embeddedTraces[key]);
      } else {
        this.executeCode(ex.code, ex.defaultStdin || '');
      }
    });

    // Keyboard shortcuts (don't fire inside text inputs)
    window.addEventListener('keydown', (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;

      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.stepPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.stepNext(); }
      else if (e.key === ' ')     { e.preventDefault(); this.toggleAutoPlay(); }
    });
  }

  // -------------------------------------------------------------------------
  async loadInitialData() {
    // 1. Load pre-computed embedded traces (works on Vercel — pure static file)
    try {
      const resp = await fetch('embedded_traces.json');
      if (resp.ok) {
        this.embeddedTraces = await resp.json();

        // Build examples map from embedded traces
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

    // 2. Also try live /api/examples (for local dev with server running)
    if (IS_LOCAL) {
      try {
        const resp = await fetch('/api/examples');
        if (resp.ok) {
          const liveEx = await resp.json();
          // Merge live examples (they may have fresher code)
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

    // 3. Populate the dropdown
    this.populateExamplesDropdown();

    // 4. Load default (while_loop)
    const defaultKey = 'while_loop';
    this.exampleSelectEl.value = defaultKey;
    const defaultEx  = this.examples[defaultKey];
    const defaultCode = defaultEx
      ? defaultEx.code
      : `public class Example {\n    public static void main(String[] args) {\n        int number = 1;\n\n        while (number < 6) {\n            System.out.println(number);\n            number++;\n        }\n    }\n}`;

    this.codeEditorEl.value = defaultCode;

    if (defaultEx && this.embeddedTraces[defaultKey]) {
      this.applyTrace(defaultCode, this.embeddedTraces[defaultKey]);
    } else {
      this.executeCode(defaultCode, '');
    }
  }

  // -------------------------------------------------------------------------
  populateExamplesDropdown() {
    // Clear existing options except the first placeholder
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
  // Apply a pre-computed trace result directly (no network call)
  applyTrace(code, traceData) {
    this.pauseAutoPlay();
    this.clearError();

    this.sourceCode = code;
    this.steps = traceData.steps || [];
    this.renderCodeLines();

    if (this.steps.length === 0) {
      this.showError('No Steps Recorded', 'Program terminated without traceable execution lines.');
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

    // 1. Check if the code matches one of our pre-computed embedded traces
    const cleanInputCode = code.trim().replace(/\r\n/g, '\n');
    for (const [key, tr] of Object.entries(this.embeddedTraces)) {
      const cleanTraceCode = (tr.code || '').trim().replace(/\r\n/g, '\n');
      if (cleanInputCode === cleanTraceCode) {
        this.applyTrace(code, tr);
        return;
      }
    }

    // 2. If running locally with live backend, try the JDI server first
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
        console.warn('Local JDI backend unavailable, falling back to simulator:', err);
      }
      this.setLoadingState(false);
    }

    // 3. Client-side Java Simulator Engine (Vercel & static host execution)
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
          this.showError('Execution Error', result.error || 'Failed to simulate Java execution.');
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

    // 4. Fallback if simulator not loaded
    this.showError(
      'Execution Error',
      'Java execution engine is loading. Please refresh the page and try again.'
    );
  }

  // -------------------------------------------------------------------------
  setLoadingState(loading) {
    if (loading) {
      this.runCodeBtn.disabled = true;
      this.runFromEditorBtn.disabled = true;
      this.runCodeBtn.innerHTML = '<span>⏳ Compiling...</span>';
    } else {
      this.runCodeBtn.disabled = false;
      this.runFromEditorBtn.disabled = false;
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
  renderCodeLines() {
    this.codeLinesEl.innerHTML = '';
    const lines = this.sourceCode.split('\n');

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const lineRow = document.createElement('div');
      lineRow.className = 'code-line';
      lineRow.id = `code-line-${lineNum}`;

      const gutter = document.createElement('div');
      gutter.className = 'line-gutter';
      gutter.innerHTML = `
        <span class="line-indicator">▶</span>
        <span class="line-number">${lineNum}</span>
      `;

      const content = document.createElement('div');
      content.className = 'code-content';
      content.innerHTML = this.highlightJava(lineText);

      lineRow.appendChild(gutter);
      lineRow.appendChild(content);
      this.codeLinesEl.appendChild(lineRow);
    });
  }

  // -------------------------------------------------------------------------
  highlightJava(line) {
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
  goToStep(index) {
    if (index < 0 || index >= this.steps.length) return;

    this.currentStep = index;
    const step = this.steps[index];

    // 1. Highlight active line
    document.querySelectorAll('.code-line.active').forEach(el => el.classList.remove('active'));
    const activeLineEl = document.getElementById(`code-line-${step.line}`);
    if (activeLineEl && this.codeContainerEl) {
      activeLineEl.classList.add('active');
      const container  = this.codeContainerEl;
      const cTop       = container.scrollTop;
      const cHeight    = container.clientHeight;
      const lTop       = activeLineEl.offsetTop;
      const lHeight    = activeLineEl.offsetHeight;

      if (lTop < cTop + 40) {
        container.scrollTo({ top: Math.max(0, lTop - 40), behavior: 'smooth' });
      } else if (lTop + lHeight > cTop + cHeight - 40) {
        container.scrollTo({ top: lTop + lHeight - cHeight + 40, behavior: 'smooth' });
      }
    }

    // 2. Frame tag
    this.currentFrameTagEl.textContent = step.frame || `line ${step.line}`;

    // 3. Variables
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

    // 4. Call Stack
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

    // 5. Output
    this.terminalOutputEl.textContent = step.output || '';
    this.terminalOutputEl.scrollTop = this.terminalOutputEl.scrollHeight;

    // 6. Slider + counter
    this.stepSliderEl.value = String(index + 1);
    this.stepCounterEl.textContent = `${index + 1} / ${this.steps.length}`;

    // 7. Nav buttons
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
    if (this.playInterval) { clearInterval(this.playInterval); this.playInterval = null; }
  }
}

// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DebuggerApp();
});
