// ==========================================================================
// Java Step Debugger - Client-Side Java Execution Simulator Engine
// Enables execution visualization on static hosts (Vercel, GitHub Pages)
// with zero backend server required!
// ==========================================================================

// Prototype polyfills to make Java standard library methods work natively in JS
if (!String.prototype.equals) {
  String.prototype.equals = function(other) {
    return this.toString() === (other !== null && other !== undefined ? other.toString() : null);
  };
}

class JavaSimulator {
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || 1000;
  }

  simulate(sourceCode, stdin = '') {
    const steps = [];
    let currentOutput = '';
    const varsRegistry = {};
    const callStack = [{ method: 'main', line: 1 }];

    // Tokenized stdin for Scanner
    const rawTokens = (stdin || '').trim().split(/\s+/).filter(Boolean);
    let tokenIdx = 0;

    const scanner = {
      nextInt: () => parseInt(rawTokens[tokenIdx++] || '0', 10),
      nextDouble: () => parseFloat(rawTokens[tokenIdx++] || '0.0'),
      nextFloat: () => parseFloat(rawTokens[tokenIdx++] || '0.0'),
      nextLong: () => parseInt(rawTokens[tokenIdx++] || '0', 10),
      next: () => rawTokens[tokenIdx++] || '',
      nextLine: () => rawTokens[tokenIdx++] || '',
      hasNext: () => tokenIdx < rawTokens.length,
      hasNextInt: () => tokenIdx < rawTokens.length && !isNaN(parseInt(rawTokens[tokenIdx], 10)),
      __isScanner: true
    };

    function formatVal(val) {
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'object' && val.__isScanner) return '<Scanner>';
      if (Array.isArray(val)) {
        return '[' + val.map(formatVal).join(', ') + ']';
      }
      if (typeof val === 'object' && val.__isArrayList) {
        return '[' + val.items.map(formatVal).join(', ') + ']';
      }
      if (typeof val === 'object' && val.__className) {
        let f = Object.keys(val).filter(k => !k.startsWith('__')).map(k => `${k}=${formatVal(val[k])}`).join(', ');
        return `${val.__className}{${f}}`;
      }
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      return String(val);
    }

    function recordStep(line, method) {
      if (steps.length >= 1000) {
        throw new Error('Maximum execution steps (1000) reached. Loop limit exceeded to prevent browser freeze.');
      }
      const top = callStack[callStack.length - 1];
      if (top) top.line = line;
      const activeMethod = top ? top.method : (method || 'main');

      const currentVars = [];
      for (const [name, info] of Object.entries(varsRegistry)) {
        try {
          const val = info.get();
          currentVars.push({
            name,
            type: info.type,
            value: formatVal(val)
          });
        } catch (e) {}
      }

      steps.push({
        line,
        frame: `${activeMethod}:${line}`,
        callStack: callStack.map(f => ({ ...f })),
        variables: currentVars,
        output: currentOutput
      });
      return true;
    }

    function regVar(name, type, getter) {
      varsRegistry[name] = { type, get: getter };
    }

    function print(s) {
      currentOutput += (s !== undefined && s !== null) ? String(s) : '';
    }

    function println(s) {
      currentOutput += ((s !== undefined && s !== null) ? String(s) : '') + '\n';
    }

    // Java collections and utilities
    class JavaArrayList {
      constructor() {
        this.items = [];
        this.__isArrayList = true;
      }
      add(x) { this.items.push(x); return true; }
      get(i) { return this.items[i]; }
      set(i, x) { this.items[i] = x; }
      remove(i) { return this.items.splice(i, 1)[0]; }
      size() { return this.items.length; }
      isEmpty() { return this.items.length === 0; }
      contains(x) { return this.items.includes(x); }
      clear() { this.items = []; }
      indexOf(x) { return this.items.indexOf(x); }
      get length() { return this.items.length; }
    }

    const JavaArrays = {
      toString: (arr) => '[' + (arr || []).join(', ') + ']',
      sort: (arr) => { if (Array.isArray(arr)) arr.sort((a, b) => a - b); }
    };

    // Pre-processing source code lines
    const lines = sourceCode.split('\n');
    const transformed = [];

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      let line = lines[i];
      const trimmed = line.trim();

      // Comment or empty line
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        transformed.push(`/* L${lineNum} */`);
        continue;
      }

      // Ignore imports / package
      if (/^(import|package)\s+/.test(trimmed)) {
        transformed.push(`/* L${lineNum} ${trimmed} */`);
        continue;
      }

      // Class declaration
      if (/^(public\s+|private\s+|protected\s+)?(static\s+)?(final\s+)?class\s+(\w+)/.test(trimmed)) {
        transformed.push(`/* L${lineNum} class */`);
        continue;
      }

      // Method main
      if (/public\s+static\s+void\s+main\s*\(/.test(trimmed)) {
        transformed.push(`/* L${lineNum} main */`);
        continue;
      }

      // Closing braces at top levels
      if (trimmed === '}' && (i >= lines.length - 2 || i === lines.length - 1)) {
        transformed.push(`/* L${lineNum} } */`);
        continue;
      }

      // Method declarations: public static int fact(int n) {
      const methodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?static\s+(?:void|int|double|boolean|String|long)\s+(\w+)\s*\((.*?)\)\s*\{/);
      if (methodMatch && methodMatch[1] !== 'main') {
        const mName = methodMatch[1];
        const mArgs = methodMatch[2].split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean);
        const argsStr = mArgs.join(', ');
        let argRegs = mArgs.map(a => `regVar('${a}', 'arg', () => ${a});`).join(' ');
        transformed.push(`function ${mName}(${argsStr}) { callStack.push({method: '${mName}', line: ${lineNum}}); ${argRegs}`);
        continue;
      }

      // Return statements: return x;
      if (/^return\b/.test(trimmed)) {
        const retExpr = trimmed.replace(/^return\s*/, '').replace(/;$/, '');
        line = `recordStep(${lineNum}); { const __retVal = (${retExpr || 'undefined'}); if (callStack.length > 1) callStack.pop(); return __retVal; }`;
        transformed.push(line);
        continue;
      }

      // String .length() -> .length
      line = line.replace(/(\w+)\.length\(\)/g, '$1.length');

      // System.out.println / print / printf
      line = line.replace(/System\.out\.println\s*\((.*?)\);/g, (m, arg) => `recordStep(${lineNum}); println(${arg || "''"});`);
      line = line.replace(/System\.out\.print\s*\((.*?)\);/g, (m, arg) => `recordStep(${lineNum}); print(${arg || "''"});`);
      line = line.replace(/System\.out\.printf\s*\((.*?)\);/g, (m, arg) => `recordStep(${lineNum}); print(${arg || "''"});`);

      // Scanner sc = new Scanner(System.in)
      line = line.replace(/Scanner\s+(\w+)\s*=\s*new\s+Scanner\s*\(.*?\);/g, (m, v) => {
        return `let ${v} = scanner; regVar('${v}', 'Scanner', () => '<Scanner>'); recordStep(${lineNum});`;
      });

      // Array literals: int[] scores = {10, 25, 40, 55};
      line = line.replace(/\b([a-zA-Z0-9_]+)\[\]\s+(\w+)\s*=\s*\{([^}]+)\};/g, (m, type, v, elems) => {
        return `let ${v} = [${elems}]; regVar('${v}', '${type}[]', () => ${v}); recordStep(${lineNum});`;
      });

      // Array instantiation: int[] arr = new int[5];
      line = line.replace(/\b([a-zA-Z0-9_]+)\[\]\s+(\w+)\s*=\s*new\s+\w+\[([^\]]+)\];/g, (m, type, v, sz) => {
        return `let ${v} = new Array(${sz}).fill(0); regVar('${v}', '${type}[]', () => ${v}); recordStep(${lineNum});`;
      });

      // ArrayList: ArrayList<String> fruits = new ArrayList<>();
      line = line.replace(/ArrayList\s*<.*?>\s*(\w+)\s*=\s*new\s+ArrayList\s*<.*?>\s*\(\);/g, (m, v) => {
        return `let ${v} = new JavaArrayList(); regVar('${v}', 'ArrayList', () => ${v}); recordStep(${lineNum});`;
      });

      // Enhanced for loop: for (int x : arr)
      line = line.replace(/for\s*\(\s*(?:int|double|long|float|String)\s+(\w+)\s*:\s*([^)]+)\)\s*\{/g, (m, v, iter) => {
        return `for (let ${v} of ${iter}) { regVar('${v}', 'item', () => ${v}); recordStep(${lineNum});`;
      });

      // Standard for loop: for (int i = 0; i < N; i++)
      line = line.replace(/for\s*\(\s*(?:int|double|long|float)\s+(\w+)\s*=\s*([^;]+);\s*([^;]+);\s*([^)]+)\)\s*\{/g, (m, v, init, cond, inc) => {
        return `for (let ${v} = ${init}; recordStep(${lineNum}) && (${cond}); ${inc}) { regVar('${v}', 'int', () => ${v});`;
      });

      // While loop: while (cond) {
      line = line.replace(/while\s*\((.*?)\)\s*\{/g, (m, cond) => {
        return `while (recordStep(${lineNum}) && (${cond})) {`;
      });

      // Do-while: do { ... } while (cond);
      line = line.replace(/\}\s*while\s*\((.*?)\);/g, (m, cond) => {
        return `} while (recordStep(${lineNum}) && (${cond}));`;
      });

      // If / else if / else
      line = line.replace(/else\s+if\s*\((.*?)\)\s*\{/g, (m, cond) => {
        return `} else if (recordStep(${lineNum}) && (${cond})) {`;
      });
      line = line.replace(/if\s*\((.*?)\)\s*\{/g, (m, cond) => {
        return `recordStep(${lineNum}); if (${cond}) {`;
      });

      // Variable declaration with assignment: int number = 1;
      line = line.replace(/\b(int|double|float|long|boolean|char|String)\s+(\w+)\s*=\s*([^;]+);/g, (m, type, v, val) => {
        return `let ${v} = ${val}; regVar('${v}', '${type}', () => ${v}); recordStep(${lineNum});`;
      });

      // Variable declaration without assignment: int x;
      line = line.replace(/\b(int|double|float|long)\s+(\w+);/g, (m, type, v) => {
        return `let ${v} = 0; regVar('${v}', '${type}', () => ${v}); recordStep(${lineNum});`;
      });
      line = line.replace(/\bboolean\s+(\w+);/g, (m, v) => {
        return `let ${v} = false; regVar('${v}', 'boolean', () => ${v}); recordStep(${lineNum});`;
      });
      line = line.replace(/\bString\s+(\w+);/g, (m, v) => {
        return `let ${v} = null; regVar('${v}', 'String', () => ${v}); recordStep(${lineNum});`;
      });

      // Standalone assignments / increments: number++; or total += scores[i];
      if (/^\s*[a-zA-Z0-9_.]+(\+\+|--|\s*[+\-*/%]?=)/.test(line)) {
        line = `recordStep(${lineNum}); ` + line;
      }

      transformed.push(line);
    }

    const script = `
      try {
        ${transformed.join('\n')}
      } catch (err) {
        if (!err.message.includes('1000')) throw err;
      }
    `;

    try {
      const runner = new Function(
        'recordStep',
        'regVar',
        'print',
        'println',
        'scanner',
        'JavaArrayList',
        'JavaArrays',
        'callStack',
        script
      );
      runner(recordStep, regVar, print, println, scanner, JavaArrayList, JavaArrays, callStack);

      // Append terminal step to reflect completed state and final output
      if (steps.length > 0) {
        const lastLine = lines.length;
        const currentVars = [];
        for (const [name, info] of Object.entries(varsRegistry)) {
          try {
            currentVars.push({ name, type: info.type, value: formatVal(info.get()) });
          } catch (e) {}
        }
        steps.push({
          line: lastLine,
          frame: `main:${lastLine}`,
          callStack: [{ method: 'main', line: lastLine }],
          variables: currentVars,
          output: currentOutput
        });
      }

      return { success: true, steps, totalSteps: steps.length };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        steps,
        totalSteps: steps.length
      };
    }
  }
}

// Export for browser and node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JavaSimulator;
} else if (typeof window !== 'undefined') {
  window.JavaSimulator = JavaSimulator;
}
