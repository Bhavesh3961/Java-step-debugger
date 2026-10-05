// ==========================================================================
// Java Step Debugger - Frontend Application
// ==========================================================================

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

class DebuggerApp {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
    this.sourceCode = '';
    this.isPlaying = false;
    this.playInterval = null;
    this.examples = {};

    this.initDOMElements();
    this.bindEvents();
    this.loadInitialData();
  }

  initDOMElements() {
    this.codeLinesEl = document.getElementById('codeLines');
    this.codeContainerEl = document.getElementById('codeContainer');
    this.currentFrameTagEl = document.getElementById('currentFrameTag');
    this.variablesBodyEl = document.getElementById('variablesBody');
    this.callStackContainerEl = document.getElementById('callStackContainer');
    this.callStackChipsEl = document.getElementById('callStackChips');
    this.terminalOutputEl = document.getElementById('terminalOutput');
    this.stepSliderEl = document.getElementById('stepSlider');
    this.stepCounterEl = document.getElementById('stepCounter');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.autoPlayBtn = document.getElementById('autoPlayBtn');
    this.playIconEl = document.getElementById('playIcon');
    this.toggleEditBtn = document.getElementById('toggleEditBtn');
    this.runCodeBtn = document.getElementById('runCodeBtn');
    this.editorSectionEl = document.getElementById('editorSection');
    this.codeEditorEl = document.getElementById('codeEditor');
    this.closeEditorBtn = document.getElementById('closeEditorBtn');
    this.runFromEditorBtn = document.getElementById('runFromEditorBtn');
    this.exampleSelectEl = document.getElementById('exampleSelect');
    this.errorBannerEl = document.getElementById('errorBanner');
    this.errorMessageEl = document.getElementById('errorMessage');
    this.errorDetailsEl = document.getElementById('errorDetails');
    this.stdinInputEl = document.getElementById('stdinInput');
  }

  bindEvents() {
    this.prevBtn.addEventListener('click', () => this.stepPrev());
    this.nextBtn.addEventListener('click', () => this.stepNext());

    this.stepSliderEl.addEventListener('input', (e) => {
      const stepIdx = parseInt(e.target.value, 10) - 1;
      this.goToStep(stepIdx);
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
      if (this.examples[key]) {
        this.codeEditorEl.value = this.examples[key].code;
        this.executeCode(this.examples[key].code);
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing in textarea or inputs
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

  async loadInitialData() {
    try {
      const resp = await fetch('/api/examples');
      if (resp.ok) {
        this.examples = await resp.json();
      }
    } catch (e) {
      console.warn('Could not fetch examples list from server:', e);
    }

    // Default screenshot code
    const initialCode = (this.examples['while_loop'] && this.examples['while_loop'].code) ||
`public class Example {
    public static void main(String[] args) {
        int number = 1;

        while (number < 6) {
            System.out.println(number);
            number++;
        }
    }
}`;

    this.codeEditorEl.value = initialCode;
    this.executeCode(initialCode);
  }

  async executeCode(code) {
    this.pauseAutoPlay();
    this.clearError();
    this.setLoadingState(true);

    try {
      const stdin = (this.stdinInputEl && this.stdinInputEl.value) ? this.stdinInputEl.value : '';
      const resp = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, stdin })
      });

      const data = await resp.json();
      this.setLoadingState(false);

      if (!data.success) {
        this.showError(data.message || 'Execution Error', data.error || 'Failed to trace code.');
        return;
      }

      this.sourceCode = code;
      this.steps = data.steps || [];
      this.renderCodeLines();

      if (this.steps.length === 0) {
        this.showError('No Steps Recorded', 'Program terminated without hitting traceable execution lines.');
        return;
      }

      this.stepSliderEl.min = '1';
      this.stepSliderEl.max = String(this.steps.length);

      // Start at step 2 if available (like the screenshot), or step 1
      const startStep = this.steps.length > 1 ? 1 : 0;
      this.goToStep(startStep);

    } catch (err) {
      this.setLoadingState(false);
      this.showError('Connection Error', err.message);
    }
  }

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

  renderCodeLines() {
    this.codeLinesEl.innerHTML = '';
    const lines = this.sourceCode.split('\n');

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const lineRow = document.createElement('div');
      lineRow.className = 'code-line';
      lineRow.id = `code-line-${lineNum}`;

      // Gutter with ▶ arrow and line number
      const gutter = document.createElement('div');
      gutter.className = 'line-gutter';
      gutter.innerHTML = `
        <span class="line-indicator">▶</span>
        <span class="line-number">${lineNum}</span>
      `;

      // Highlighted Code Content
      const content = document.createElement('div');
      content.className = 'code-content';
      content.innerHTML = this.highlightJava(lineText);

      lineRow.appendChild(gutter);
      lineRow.appendChild(content);
      this.codeLinesEl.appendChild(lineRow);
    });
  }

  highlightJava(line) {
    if (!line) return '&nbsp;';

    // Simple robust tokenizer for Java
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

  goToStep(index) {
    if (index < 0 || index >= this.steps.length) return;

    this.currentStep = index;
    const step = this.steps[index];

    // 1. Highlight active line
    document.querySelectorAll('.code-line.active').forEach(el => el.classList.remove('active'));
    const activeLineEl = document.getElementById(`code-line-${step.line}`);
    if (activeLineEl && this.codeContainerEl) {
      activeLineEl.classList.add('active');
      // Scroll internally within code container only, keeping entire window steady
      const container = this.codeContainerEl;
      const cTop = container.scrollTop;
      const cHeight = container.clientHeight;
      const lTop = activeLineEl.offsetTop;
      const lHeight = activeLineEl.offsetHeight;

      // Keep active line within middle-comfort zone of the code container
      if (lTop < cTop + 40) {
        container.scrollTo({ top: Math.max(0, lTop - 40), behavior: 'smooth' });
      } else if (lTop + lHeight > cTop + cHeight - 40) {
        container.scrollTo({ top: lTop + lHeight - cHeight + 40, behavior: 'smooth' });
      }
    }

    // 2. Update frame tag: e.g. "main:5"
    this.currentFrameTagEl.textContent = step.frame || `line ${step.line}`;

    // 3. Render Variables
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

    // 4. Update Call Stack if multiple frames
    if (step.callStack && step.callStack.length > 1) {
      this.callStackContainerEl.classList.remove('hidden');
      this.callStackChipsEl.innerHTML = '';
      step.callStack.forEach((frame, idx) => {
        const chip = document.createElement('span');
        chip.className = 'call-chip';
        chip.textContent = `${frame.method}:${frame.line}`;
        this.callStackChipsEl.appendChild(chip);
      });
    } else {
      this.callStackContainerEl.classList.add('hidden');
    }

    // 5. Update Output
    this.terminalOutputEl.textContent = step.output || '';
    this.terminalOutputEl.scrollTop = this.terminalOutputEl.scrollHeight;

    // 6. Update Slider
    this.stepSliderEl.value = String(index + 1);

    // 7. Update Step Counter: "2 / 24"
    this.stepCounterEl.textContent = `${index + 1} / ${this.steps.length}`;

    // 8. Update Navigation Buttons state
    this.prevBtn.disabled = (index === 0);
    this.nextBtn.disabled = (index === this.steps.length - 1);
  }

  stepPrev() {
    if (this.currentStep > 0) {
      this.goToStep(this.currentStep - 1);
    }
  }

  stepNext() {
    if (this.currentStep < this.steps.length - 1) {
      this.goToStep(this.currentStep + 1);
    } else if (this.isPlaying) {
      this.pauseAutoPlay();
    }
  }

  toggleAutoPlay() {
    if (this.isPlaying) {
      this.pauseAutoPlay();
    } else {
      this.startAutoPlay();
    }
  }

  startAutoPlay() {
    if (this.currentStep >= this.steps.length - 1) {
      this.goToStep(0);
    }
    this.isPlaying = true;
    this.playIconEl.textContent = '⏸';
    this.playInterval = setInterval(() => {
      this.stepNext();
    }, 700);
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DebuggerApp();
});
