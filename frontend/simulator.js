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
if (!String.prototype.compareTo) {
  String.prototype.compareTo = function(other) {
    return this.localeCompare(String(other));
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
    let currentRunningLine = 1;

    // Smart stdin normalization
    let cleanStdin = (stdin || '').replace(/\\n/g, '\n');
    const needsInput = Boolean(sourceCode.match(/\b(Scanner|System\.in|BufferedReader|readLine)\b/));
    if (needsInput && !cleanStdin.trim()) {
      if (sourceCode.includes('9999')) {
        cleanStdin = '72\n2\n8\n8\n11\n9999\n';
      } else if (sourceCode.includes('-1')) {
        cleanStdin = '1\n2\n3\n-1\n';
      } else if (sourceCode.match(/\b0\b/) && sourceCode.includes('while')) {
        cleanStdin = '1\n2\n3\n0\n';
      } else {
        cleanStdin = '3\n';
      }
    }

    const stdinLines = cleanStdin.split(/\r?\n/).filter(l => l.length > 0);
    const rawTokens = cleanStdin.trim().split(/\s+/).filter(Boolean);
    let tokenIdx = 0;
    let lineIdx = 0;

    const _builtinScanner = {
      _checkInputOrThrow: (type) => {
        const err = new Error(`NoSuchElementException: Scanner reached end of input (stdin) while reading ${type} on line ${currentRunningLine}. Please provide values in the Program Input box.`);
        err.__waitingForInput = true;
        err.__line = currentRunningLine;
        throw err;
      },
      nextInt: () => {
        if (tokenIdx >= rawTokens.length) {
          _builtinScanner._checkInputOrThrow('integer');
        }
        const val = parseInt(rawTokens[tokenIdx++], 10);
        if (isNaN(val)) throw new Error(`InputMismatchException: Expected integer, got "${rawTokens[tokenIdx - 1]}"`);
        return val;
      },
      nextDouble: () => {
        if (tokenIdx >= rawTokens.length) {
          _builtinScanner._checkInputOrThrow('double');
        }
        const val = parseFloat(rawTokens[tokenIdx++]);
        if (isNaN(val)) throw new Error(`InputMismatchException: Expected double, got "${rawTokens[tokenIdx - 1]}"`);
        return val;
      },
      nextFloat: () => {
        if (tokenIdx >= rawTokens.length) _builtinScanner._checkInputOrThrow('float');
        return parseFloat(rawTokens[tokenIdx++]);
      },
      nextLong: () => {
        if (tokenIdx >= rawTokens.length) _builtinScanner._checkInputOrThrow('long');
        return parseInt(rawTokens[tokenIdx++], 10);
      },
      next: () => {
        if (tokenIdx >= rawTokens.length) _builtinScanner._checkInputOrThrow('token');
        return rawTokens[tokenIdx++];
      },
      nextLine: () => {
        if (stdinLines.length > 1 && lineIdx < stdinLines.length) {
          return stdinLines[lineIdx++];
        }
        if (tokenIdx < rawTokens.length) {
          return rawTokens[tokenIdx++];
        }
        _builtinScanner._checkInputOrThrow('line');
      },
      hasNext: () => tokenIdx < rawTokens.length,
      hasNextInt: () => tokenIdx < rawTokens.length && !isNaN(parseInt(rawTokens[tokenIdx], 10)),
      hasNextLine: () => (stdinLines.length > 1 ? lineIdx < stdinLines.length : tokenIdx < rawTokens.length),
      hasNextDouble: () => tokenIdx < rawTokens.length && !isNaN(parseFloat(rawTokens[tokenIdx])),
      __isScanner: true
    };

    function formatVal(val) {
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'object' && val.__isScanner) return '<Scanner>';
      if (Array.isArray(val)) {
        return '[' + val.map(formatVal).join(', ') + ']';
      }
      if (typeof val === 'object' && val.__isArrayList) {
        return 'ArrayList [' + val.items.map(formatVal).join(', ') + ']';
      }
      if (typeof val === 'object' && val.__className) {
        let f = Object.keys(val).filter(k => !k.startsWith('__')).map(k => `${k}=${formatVal(val[k])}`).join(', ');
        return `${val.__className}{${f}}`;
      }
      if (typeof val === 'object' && val.constructor && val.constructor.name && val.constructor.name !== 'Object') {
        const clsName = val.constructor.name;
        const keys = Object.keys(val).filter(k => !k.startsWith('__'));
        const f = keys.map(k => `${k}=${formatVal(val[k])}`).join(', ');
        return `${clsName}{${f}}`;
      }
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      if (typeof val === 'string') return `"${val}"`;
      return String(val);
    }

    function setRunningLine(line) {
      currentRunningLine = line;
    }

    function recordStep(line, method) {
      currentRunningLine = line;
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

    function regVar(name, type, getter, depth = 1) {
      varsRegistry[name] = { type, get: getter, depth };
    }

    function clearVarsAtDepth(depth) {
      for (const name of Object.keys(varsRegistry)) {
        if (varsRegistry[name] && varsRegistry[name].depth > depth) {
          delete varsRegistry[name];
        }
      }
    }

    function print(s) {
      currentOutput += (s !== undefined && s !== null) ? String(s) : '';
    }

    function println(s) {
      currentOutput += ((s !== undefined && s !== null) ? String(s) : '') + '\n';
    }

    // Java Collections & Utilities
    class JavaArrayList {
      constructor(init) {
        this.items = Array.isArray(init) ? [...init] : [];
        this.__isArrayList = true;
      }
      add(arg1, arg2) {
        if (arg2 !== undefined) {
          this.items.splice(arg1, 0, arg2);
        } else {
          this.items.push(arg1);
        }
        return true;
      }
      get(i) {
        if (i < 0 || i >= this.items.length) {
          throw new Error(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${this.items.length}`);
        }
        return this.items[i];
      }
      set(i, x) {
        const old = this.items[i];
        this.items[i] = x;
        return old;
      }
      remove(i) {
        if (typeof i === 'number') {
          return this.items.splice(i, 1)[0];
        } else {
          const idx = this.items.indexOf(i);
          if (idx !== -1) {
            this.items.splice(idx, 1);
            return true;
          }
          return false;
        }
      }
      size() { return this.items.length; }
      isEmpty() { return this.items.length === 0; }
      contains(x) { return this.items.includes(x); }
      clear() { this.items = []; }
      indexOf(x) { return this.items.indexOf(x); }
      lastIndexOf(x) { return this.items.lastIndexOf(x); }
      toArray() { return [...this.items]; }
      toString() { return 'ArrayList [' + this.items.map(formatVal).join(', ') + ']'; }
      get length() { return this.items.length; }
    }

    // Java Arrays Utility Tool (java.util.Arrays)
    const Arrays = {
      toString: (arr) => {
        if (!arr) return 'null';
        if (typeof arr === 'object' && arr.__isArrayList) return '[' + arr.items.map(formatVal).join(', ') + ']';
        return '[' + (Array.isArray(arr) ? arr.map(formatVal).join(', ') : String(arr)) + ']';
      },
      deepToString: (arr) => JSON.stringify(arr),
      sort: (arr) => {
        if (Array.isArray(arr)) {
          arr.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
        }
      },
      fill: (arr, val) => {
        if (Array.isArray(arr)) arr.fill(val);
      },
      copyOf: (arr, newLen) => {
        const res = new Array(newLen).fill(0);
        for (let i = 0; i < Math.min(arr.length, newLen); i++) res[i] = arr[i];
        return res;
      },
      binarySearch: (arr, key) => {
        if (!Array.isArray(arr)) return -1;
        let l = 0, r = arr.length - 1;
        while (l <= r) {
          let m = Math.floor((l + r) / 2);
          if (arr[m] === key) return m;
          if (arr[m] < key) l = m + 1;
          else r = m - 1;
        }
        return -(l + 1);
      },
      asList: (...items) => new JavaArrayList(items),
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    };

    // Java Collections Utility Tool (java.util.Collections)
    const Collections = {
      sort: (list) => {
        if (list && list.__isArrayList) {
          list.items.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
        } else if (Array.isArray(list)) {
          list.sort((a, b) => a - b);
        }
      },
      reverse: (list) => {
        if (list && list.__isArrayList) list.items.reverse();
        else if (Array.isArray(list)) list.reverse();
      },
      max: (list) => Math.max(...(list && list.__isArrayList ? list.items : list)),
      min: (list) => Math.min(...(list && list.__isArrayList ? list.items : list)),
      swap: (list, i, j) => {
        const items = list && list.__isArrayList ? list.items : list;
        const temp = items[i]; items[i] = items[j]; items[j] = temp;
      }
    };

    // Java Wrapper Classes
    const Integer = {
      valueOf: (val) => {
        const s = String(val).trim();
        const n = parseInt(s, 10);
        if (isNaN(n)) throw new Error(`NumberFormatException: For input string: "${val}"`);
        return n;
      },
      parseInt: (val) => {
        const s = String(val).trim();
        const n = parseInt(s, 10);
        if (isNaN(n)) throw new Error(`NumberFormatException: For input string: "${val}"`);
        return n;
      },
      MAX_VALUE: 2147483647,
      MIN_VALUE: -2147483648,
      min: Math.min,
      max: Math.max,
      compare: (a, b) => (a < b ? -1 : (a > b ? 1 : 0)),
      toString: (x) => String(x)
    };

    const Double = {
      valueOf: (val) => {
        const s = String(val).trim();
        const n = parseFloat(s);
        if (isNaN(n)) throw new Error(`NumberFormatException: For input string: "${val}"`);
        return n;
      },
      parseDouble: (val) => {
        const s = String(val).trim();
        const n = parseFloat(s);
        if (isNaN(n)) throw new Error(`NumberFormatException: For input string: "${val}"`);
        return n;
      },
      MAX_VALUE: Number.MAX_VALUE,
      MIN_VALUE: Number.MIN_VALUE,
      isNaN: (x) => isNaN(x),
      isInfinite: (x) => !isFinite(x)
    };

    const Float = {
      valueOf: (val) => Double.valueOf(val),
      parseFloat: (val) => Double.parseDouble(val)
    };

    const Long = {
      valueOf: (val) => Integer.valueOf(val),
      parseLong: (val) => Integer.parseInt(val),
      MAX_VALUE: 9007199254740991,
      MIN_VALUE: -9007199254740991
    };

    const BooleanObj = {
      valueOf: (val) => Boolean(val === true || String(val).toLowerCase() === 'true'),
      parseBoolean: (val) => String(val).toLowerCase() === 'true'
    };

    const Character = {
      valueOf: (c) => String(c).charAt(0),
      isDigit: (c) => /^\d$/.test(String(c)),
      isLetter: (c) => /^[a-zA-Z]$/.test(String(c)),
      isWhitespace: (c) => /^\s$/.test(String(c)),
      toUpperCase: (c) => String(c).toUpperCase(),
      toLowerCase: (c) => String(c).toLowerCase()
    };

    // Pre-processing source code lines
    const lines = sourceCode.split('\n');
    const transformed = [];
    let scopeDepth = 1;
    let topClassStripped = false;
    let inClassScope = false;
    let classDepth = 0;

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

      // Top-level class declaration (only strip the very first top-level class)
      if (!topClassStripped && /^(public\s+|private\s+|protected\s+)?(static\s+)?(final\s+)?class\s+(\w+)/.test(trimmed)) {
        topClassStripped = true;
        transformed.push(`/* L${lineNum} top-class */`);
        continue;
      }

      // Inner static class (e.g. static class Student {) -> class Student {
      const innerClassMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?static\s+class\s+(\w+)\s*\{/);
      if (innerClassMatch) {
        const clsName = innerClassMatch[1];
        transformed.push(`class ${clsName} {`);
        scopeDepth++;
        inClassScope = true;
        classDepth = scopeDepth;
        continue;
      }

      // Fields directly inside class body: String name; int grade;
      if (inClassScope && scopeDepth === classDepth && /^(?:String|int|double|float|boolean|long)\s+(\w+);/.test(trimmed)) {
        const fName = trimmed.match(/^(?:String|int|double|float|boolean|long)\s+(\w+);/)[1];
        transformed.push(`${fName} = null;`);
        continue;
      }

      // Inner class constructor: Student(String name, int grade) { -> constructor(name, grade) {
      const constructorMatch = trimmed.match(/^(\w+)\s*\((.*?)\)\s*\{/);
      if (constructorMatch && /^[A-Z]/.test(constructorMatch[1])) {
        const rawArgs = constructorMatch[2].split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean);
        transformed.push(`constructor(${rawArgs.join(', ')}) { recordStep(${lineNum});`);
        scopeDepth++;
        continue;
      }

      // Inner class method: void promote() { -> promote() {
      const classMethodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?(?:void|int|double|boolean|String)\s+(\w+)\s*\((.*?)\)\s*\{/);
      if (classMethodMatch && !trimmed.includes('static') && classMethodMatch[1] !== 'main') {
        const mName = classMethodMatch[1];
        const rawArgs = classMethodMatch[2].split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean);
        transformed.push(`${mName}(${rawArgs.join(', ')}) { recordStep(${lineNum});`);
        scopeDepth++;
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

      // Standard static method declarations: public static int fact(int n) {
      const methodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?static\s+(?:void|int|double|boolean|String|long)\s+(\w+)\s*\((.*?)\)\s*\{/);
      if (methodMatch && methodMatch[1] !== 'main') {
        const mName = methodMatch[1];
        const mArgs = methodMatch[2].split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean);
        const argsStr = mArgs.join(', ');
        let argRegs = mArgs.map(a => `regVar('${a}', 'arg', () => ${a}, ${scopeDepth + 1});`).join(' ');
        transformed.push(`function ${mName}(${argsStr}) { callStack.push({method: '${mName}', line: ${lineNum}}); ${argRegs}`);
        scopeDepth++;
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
        return `let ${v} = _builtinScanner; regVar('${v}', 'Scanner', () => '<Scanner>', ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Array literals: int[] scores = {10, 25, 40, 55};
      line = line.replace(/\b([a-zA-Z0-9_]+)\[\]\s+(\w+)\s*=\s*\{([^}]+)\};/g, (m, type, v, elems) => {
        return `let ${v} = [${elems}]; regVar('${v}', '${type}[]', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Array instantiation: int[] arr = new int[5]; or new int[]{...}
      line = line.replace(/\b([a-zA-Z0-9_]+)\[\]\s+(\w+)\s*=\s*new\s+\w+\[([^\]]+)\];/g, (m, type, v, sz) => {
        return `let ${v} = new Array(${sz}).fill(0); regVar('${v}', '${type}[]', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });
      line = line.replace(/\b([a-zA-Z0-9_]+)\[\]\s+(\w+)\s*=\s*new\s+\w+\[\]\s*\{([^}]+)\};/g, (m, type, v, elems) => {
        return `let ${v} = [${elems}]; regVar('${v}', '${type}[]', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // ArrayList / List instantiation
      line = line.replace(/\b(?:ArrayList|List)(?:\s*<.*?>)?\s+(\w+)\s*=\s*new\s+ArrayList(?:\s*<.*?>)?\s*\((.*?)\);/g, (m, v, initArg) => {
        return `let ${v} = new JavaArrayList(${initArg || ''}); regVar('${v}', 'ArrayList', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Enhanced for loop: for (int x : arr)
      line = line.replace(/for\s*\(\s*(?:int|double|long|float|String)\s+(\w+)\s*:\s*([^)]+)\)\s*\{/g, (m, v, iter) => {
        scopeDepth++;
        return `for (let ${v} of ${iter}) { regVar('${v}', 'item', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Standard for loop: for (int i = 0; i < N; i++)
      line = line.replace(/for\s*\(\s*(?:int|double|long|float)\s+(\w+)\s*=\s*([^;]+);\s*([^;]+);\s*([^)]+)\)\s*\{/g, (m, v, init, cond, inc) => {
        scopeDepth++;
        return `for (let ${v} = ${init}; ((regVar('${v}', 'int', () => ${v}, ${scopeDepth}) && false) || (recordStep(${lineNum}) && (${cond}))); ${inc}) {`;
      });

      // While loop: while (cond) {
      line = line.replace(/while\s*\((.*?)\)\s*\{/g, (m, cond) => {
        scopeDepth++;
        return `while (recordStep(${lineNum}) && (${cond})) {`;
      });

      // Do-while: do { ... } while (cond);
      line = line.replace(/\}\s*while\s*\((.*?)\);/g, (m, cond) => {
        return `} while (recordStep(${lineNum}) && (${cond}));`;
      });

      // If / else if / else
      if (line.includes('else if')) {
        if (line.includes('{')) {
          line = line.replace(/(?:\}\s*)?else\s+if\s*\((.*?)\)\s*\{/g, (m, cond) => {
            return `} else if (recordStep(${lineNum}) && (${cond})) {`;
          });
        } else {
          line = line.replace(/(?:\}\s*)?else\s+if\s*\(([^)]+)\)\s*(?!\{)([^;]+;)/g, (m, cond, stmt) => {
            return `} else if (recordStep(${lineNum}) && (${cond})) { ${stmt} }`;
          });
        }
      } else if (/(\}|\s|^)else\s*\{/.test(line)) {
        line = line.replace(/(?:\}\s*)?else\s*\{/g, () => {
          return `} else { recordStep(${lineNum});`;
        });
      } else if (/(\}|\s|^)else\s+(?!if|\{)/.test(line)) {
        line = line.replace(/(?:\}\s*)?else\s+(?!if|\{)([^;]+;)/g, (m, stmt) => {
          return `} else { recordStep(${lineNum}); ${stmt} }`;
        });
      } else if (/(?<!else\s*)if\s*\(/.test(line)) {
        if (line.includes('{')) {
          line = line.replace(/(?<!else\s*)if\s*\((.*?)\)\s*\{/g, (m, cond) => {
            scopeDepth++;
            return `recordStep(${lineNum}); if (${cond}) {`;
          });
        } else {
          line = line.replace(/(?<!else\s*)if\s*\(([^)]+)\)\s*(?!\{)([^;]+;)/g, (m, cond, stmt) => {
            return `recordStep(${lineNum}); if (${cond}) { ${stmt} }`;
          });
        }
      }

      // Break / continue
      line = line.replace(/\b(break|continue)\s*;/g, (m, kw) => {
        return `recordStep(${lineNum}); ${kw};`;
      });

      // Custom object instantiation: Student s = new Student("Alex", 10);
      line = line.replace(/\b([A-Z][a-zA-Z0-9_]*)\s+(\w+)\s*=\s*new\s+\1\s*\((.*?)\);/g, (m, cls, v, args) => {
        return `setRunningLine(${lineNum}); let ${v} = new ${cls}(${args}); regVar('${v}', '${cls}', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Variable declaration with assignment: int number = 1; (tolerates missing semicolon for beginners)
      line = line.replace(/\b(int|long)\s+(\w+)\s*=\s*(.+?);?$/g, (m, type, v, val) => {
        return `setRunningLine(${lineNum}); let ${v} = Math.trunc(${val}); regVar('${v}', '${type}', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });
      line = line.replace(/\b(double|float|boolean|char|String)\s+(\w+)\s*=\s*(.+?);?$/g, (m, type, v, val) => {
        return `setRunningLine(${lineNum}); let ${v} = ${val}; regVar('${v}', '${type}', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Variable declaration without assignment: int x;
      line = line.replace(/\b(int|double|float|long)\s+(\w+);?$/g, (m, type, v) => {
        return `let ${v} = 0; regVar('${v}', '${type}', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });
      line = line.replace(/\bboolean\s+(\w+);?$/g, (m, v) => {
        return `let ${v} = false; regVar('${v}', 'boolean', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });
      line = line.replace(/\bString\s+(\w+);?$/g, (m, v) => {
        return `let ${v} = null; regVar('${v}', 'String', () => ${v}, ${scopeDepth}); recordStep(${lineNum});`;
      });

      // Integer division: num /= 10 -> num = Math.trunc(num / 10)
      line = line.replace(/(\w+)\s*\/=\s*([^;]+);/g, '$1 = Math.trunc($1 / ($2));');

      // Standalone assignments / increments: number++; or total += scores[i];
      if (/^\s*[a-zA-Z0-9_.]+(\+\+|--|\s*[+\-*/%]?=)/.test(line) && !line.includes('recordStep(')) {
        if (inClassScope && scopeDepth > classDepth && !line.includes('this.') && !line.includes('let ') && !line.includes('const ')) {
          line = line.replace(/^\s*([a-zA-Z0-9_]+)(\+\+|--|\s*[+\-*/%]?=)/, 'this.$1$2');
        }
        line = `recordStep(${lineNum}); ` + line;
      }

      // Standalone method calls: numbers.add(luku); s.promote();
      if (/^\s*[a-zA-Z0-9_$.]+\s*\(.*?\)\s*;/.test(line) && !line.includes('recordStep(')) {
        line = `recordStep(${lineNum}); ` + line;
      }

      // Track closing braces to clear block variables
      if (trimmed === '}' || trimmed.startsWith('}')) {
        scopeDepth = Math.max(1, scopeDepth - 1);
        if (inClassScope && scopeDepth < classDepth) {
          inClassScope = false;
          classDepth = 0;
          line = line + ` clearVarsAtDepth(${scopeDepth});`;
        } else if (!inClassScope) {
          line = line + ` clearVarsAtDepth(${scopeDepth});`;
        }
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
        'setRunningLine',
        'recordStep',
        'regVar',
        'clearVarsAtDepth',
        'print',
        'println',
        '_builtinScanner',
        'JavaArrayList',
        'Arrays',
        'Collections',
        'Integer',
        'Double',
        'Float',
        'Long',
        'Boolean',
        'Character',
        'callStack',
        script
      );
      runner(
        setRunningLine,
        recordStep,
        regVar,
        clearVarsAtDepth,
        print,
        println,
        _builtinScanner,
        JavaArrayList,
        Arrays,
        Collections,
        Integer,
        Double,
        Float,
        Long,
        BooleanObj,
        Character,
        callStack
      );

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
      const isInputWait = Boolean(err.__waitingForInput || (err.message && err.message.includes('NoSuchElementException')));
      if (steps.length > 0) {
        return {
          success: true,
          waitingForInput: isInputWait,
          waitingLine: err.__line || (steps[steps.length - 1] ? steps[steps.length - 1].line : 1),
          waitingMessage: err.message,
          error: isInputWait ? null : err.message,
          steps,
          totalSteps: steps.length
        };
      }
      return {
        success: false,
        waitingForInput: isInputWait,
        error: err.message,
        steps: [],
        totalSteps: 0
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
