#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import re
import subprocess
import tempfile
import sys
from pathlib import Path

PORT = 3000
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
TRACER_CLASS = BASE_DIR / "Tracer.class"

EXAMPLES = {
    "while_loop": {
        "title": "While Loop (Screenshot Example)",
        "code": """public class Example {
    public static void main(String[] args) {
        int number = 1;

        while (number < 6) {
            System.out.println(number);
            number++;
        }
    }
}"""
    },
    "array_sum": {
        "title": "For Loop & Array Sum",
        "code": """public class ArraySum {
    public static void main(String[] args) {
        int[] scores = {10, 25, 40, 55};
        int total = 0;

        for (int i = 0; i < scores.length; i++) {
            total += scores[i];
            System.out.println("Added " + scores[i] + ", current total: " + total);
        }
    }
}"""
    },
    "array_list": {
        "title": "ArrayList & Collections",
        "code": """public class ListDemo {
    public static void main(String[] args) {
        ArrayList<String> fruits = new ArrayList<>();
        fruits.add("Apple");
        fruits.add("Banana");
        fruits.add("Cherry");

        for (int i = 0; i < fruits.size(); i++) {
            String item = fruits.get(i);
            System.out.println("Fruit #" + (i + 1) + ": " + item);
        }
    }
}"""
    },
    "remember_numbers": {
        "title": "Remember These Numbers (ArrayList + Scanner)",
        "defaultStdin": "7 2 5 -1",
        "code": """import java.util.ArrayList;
import java.util.Scanner;

public class RememberTheseNumbers {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        ArrayList<Integer> numbers = new ArrayList<>();
        while (true) {
            int luku = Integer.valueOf(scanner.nextLine());
            if (luku == -1) {
                break;
            }
            numbers.add(luku);
        }
        for (int index = numbers.size() - 1; index >= 0; index--) {
            System.out.println(numbers.get(index));
        }
    }
}"""
    },
    "factorial_recursion": {
        "title": "Factorial (Recursion)",
        "code": """public class Factorial {
    public static int fact(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * fact(n - 1);
    }

    public static void main(String[] args) {
        int num = 4;
        int result = fact(num);
        System.out.println("Factorial of " + num + " is " + result);
    }
}"""
    },
    "bubble_sort": {
        "title": "Bubble Sort",
        "code": """public class BubbleSort {
    public static void main(String[] args) {
        int[] arr = {5, 3, 1, 4};
        int n = arr.length;

        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }

        System.out.println("Sorted: " + Arrays.toString(arr));
    }
}"""
    },
    "custom_object": {
        "title": "Custom Class & Objects",
        "code": """public class StudentDemo {
    static class Student {
        String name;
        int grade;

        Student(String name, int grade) {
            this.name = name;
            this.grade = grade;
        }

        void promote() {
            grade++;
        }
    }

    public static void main(String[] args) {
        Student s = new Student("Alex", 10);
        System.out.println("Starting grade: " + s.grade);
        s.promote();
        System.out.println("Promoted grade: " + s.grade);
    }
}"""
    },
    "diamond_pattern": {
        "title": "Diamond Pattern (Scanner Input)",
        "code": """import java.util.Scanner;

public class Main {
    public static void main(String[] args) {

        Scanner sc = new Scanner(System.in);
        int N = sc.nextInt();

        // TOP HALF
        for (int i = 1; i <= N; i++) {

            // spaces
            for (int j = 1; j <= N - i; j++) {
                System.out.print(" ");
            }

            // stars
            for (int j = 1; j <= i; j++) {
                System.out.print("*");

                if (j < i) {
                    System.out.print(" ");
                }
            }

            System.out.println();
        }

        // BOTTOM HALF
        for (int i = N - 1; i >= 1; i--) {

            // spaces
            for (int j = 1; j <= N - i; j++) {
                System.out.print(" ");
            }

            // stars
            for (int j = 1; j <= i; j++) {
                System.out.print("*");

                if (j < i) {
                    System.out.print(" ");
                }
            }

            System.out.println();
        }
    }
}"""
    }
}

def extract_main_class_name(code: str) -> str:
    main_match = re.search(r'class\s+([A-Za-z0-9_]+)[^{]*\{[^{}]*(?:(?!class)[\s\S])*?public\s+static\s+void\s+main', code)
    if main_match:
        return main_match.group(1)

    public_match = re.search(r'public\s+class\s+([A-Za-z0-9_]+)', code)
    if public_match:
        return public_match.group(1)

    class_match = re.search(r'class\s+([A-Za-z0-9_]+)', code)
    if class_match:
        return class_match.group(1)

    return "Main"

def prepare_code(raw_code: str) -> tuple[str, str, int]:
    has_class = bool(re.search(r'\bclass\s+[A-Za-z0-9_]+', raw_code))
    has_main = bool(re.search(r'public\s+static\s+void\s+main', raw_code))

    code = raw_code
    line_offset = 0

    if not has_class and not has_main:
        # Bare snippet inside main
        wrapper_prefix = "public class Main {\n    public static void main(String[] args) {\n"
        code = wrapper_prefix + raw_code + "\n    }\n}"
        line_offset = 2
    else:
        # User wrote a full class
        # Add standard library imports on a single line at the top
        std_imports = "import java.util.*; import java.io.*; import java.math.*; import java.time.*;\n"
        code = std_imports + code
        line_offset = 1

    class_name = extract_main_class_name(code)

    # Auto-close missing braces so incomplete typing doesn't fail compilation with parsing error
    open_braces = code.count('{')
    close_braces = code.count('}')
    if open_braces > close_braces:
        code += '\n' + ('}\n' * (open_braces - close_braces))

    return class_name, code, line_offset

def normalize_stdin(stdin_data: str, user_code: str) -> str:
    if not stdin_data or not stdin_data.strip():
        needs_input = bool(re.search(r'\b(Scanner|System\.in|BufferedReader|readLine)\b', user_code))
        if needs_input:
            if re.search(r'9999', user_code):
                return "72\n2\n8\n8\n11\n9999\n"
            if re.search(r'==\s*-1|-1\s*==', user_code):
                return "1\n2\n3\n-1\n"
            if re.search(r'==\s*0|0\s*==|!=\s*0|0\s*!=', user_code):
                return "1\n2\n3\n0\n"
            return "3\n"
        return ""

    # Unescape literal \n if user typed it
    cleaned = stdin_data.replace("\\n", "\n")

    # If code uses 9999 as sentinel and stdin doesn't contain 9999, append it so while(true) doesn't run out of input!
    if "9999" in user_code and "9999" not in cleaned:
        cleaned = cleaned.rstrip() + "\n9999\n"

    # If input is a single line (or no newlines) with multiple space/comma separated tokens,
    # and the code uses Scanner/System.in, separate them by newlines so nextLine() reads line-by-line!
    lines = [l for l in cleaned.splitlines() if l.strip()]
    if len(lines) <= 1:
        tokens = re.split(r'[, \t]+', cleaned.strip())
        if len(tokens) > 1:
            has_next_line = bool(re.search(r'\b(nextLine|readLine)\b', user_code))
            all_numeric = all(re.match(r'^-?\d+(?:\.\d+)?$', t) for t in tokens)
            if has_next_line or all_numeric:
                cleaned = "\n".join(tokens) + "\n"

    if not cleaned.endswith("\n"):
        cleaned += "\n"
    return cleaned

def trace_java_code(user_code: str, stdin_data: str = "") -> dict:
    if not user_code or not user_code.strip():
        return {
            "success": False,
            "error": "Code cannot be empty.",
            "message": "Please write or paste Java code."
        }

    stdin_data = normalize_stdin(stdin_data, user_code)

    class_name, processed_code, line_offset = prepare_code(user_code)

    with tempfile.TemporaryDirectory(prefix="jdbg_") as temp_dir:
        java_file = Path(temp_dir) / f"{class_name}.java"
        java_file.write_text(processed_code, encoding="utf-8")

        # Compile with -g for full debugging symbols
        javac_cmd = ["javac", "-g", "-encoding", "UTF-8", str(java_file)]
        compile_res = subprocess.run(javac_cmd, capture_output=True, text=True, cwd=temp_dir)

        if compile_res.returncode != 0:
            err_msg = compile_res.stderr.strip()
            # Clean up path prefixes and adjust line numbers in error message if needed
            lines_clean = []
            for l in err_msg.splitlines():
                m = re.match(r'.*?' + re.escape(class_name) + r'\.java:(\d+):(.*)', l)
                if m:
                    raw_ln = int(m.group(1))
                    adj_ln = max(1, raw_ln - line_offset)
                    lines_clean.append(f"{class_name}.java:{adj_ln}:{m.group(2)}")
                else:
                    lines_clean.append(l)
            return {
                "success": False,
                "error": "\n".join(lines_clean),
                "message": "Compilation failed. Check your Java syntax."
            }

        # Write stdin file if input is provided or needed
        stdin_path = Path(temp_dir) / "stdin.txt"
        stdin_path.write_text(stdin_data, encoding="utf-8")

        # Run Tracer
        trace_json_path = Path(temp_dir) / "trace.json"
        tracer_cmd = [
            "java",
            "-cp", f"{BASE_DIR}:{temp_dir}",
            "Tracer",
            temp_dir,
            class_name,
            str(trace_json_path),
            str(stdin_path)
        ]

        try:
            tracer_res = subprocess.run(tracer_cmd, capture_output=True, text=True, timeout=12)
            if trace_json_path.exists():
                trace_content = trace_json_path.read_text(encoding="utf-8")
                data = json.loads(trace_content)
                
                # Adjust line numbers back to user source code lines
                total_lines = len(user_code.splitlines())
                filtered_steps = []
                for step in data.get("steps", []):
                    adj_line = max(1, step["line"] - line_offset)
                    if adj_line <= total_lines:
                        step["line"] = adj_line
                        step["frame"] = f"{step['method']}:{adj_line}"
                        if "callStack" in step:
                            for frame in step["callStack"]:
                                frame["line"] = max(1, frame["line"] - line_offset)
                        filtered_steps.append(step)

                # Re-index steps
                for i, s in enumerate(filtered_steps):
                    s["step"] = i + 1

                data["steps"] = filtered_steps
                data["totalSteps"] = len(filtered_steps)
                data["className"] = class_name
                data["sourceCode"] = user_code
                return data
            else:
                err_text = tracer_res.stderr or tracer_res.stdout or "Debugger failed to produce execution trace."
                return {
                    "success": False,
                    "error": err_text,
                    "message": "Execution error during trace."
                }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Execution timed out (exceeded 12 seconds). Possible infinite loop.",
                "message": "Execution timed out."
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Unexpected execution failure."
            }

class DebuggerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/examples":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(EXAMPLES).encode("utf-8"))
            return

        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/trace":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode("utf-8"))
                code = payload.get("code", "")
                stdin_val = payload.get("stdin", "")
                result = trace_java_code(code, stdin_val)
            except Exception as e:
                result = {
                    "success": False,
                    "error": str(e),
                    "message": "Server processing error"
                }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return

        self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    port = PORT
    for attempt in range(5):
        try:
            with socketserver.TCPServer(("", port), DebuggerHandler) as httpd:
                print(f"Debugger server running at http://localhost:{port}")
                httpd.serve_forever()
                break
        except OSError as e:
            if e.errno == 48:
                port += 1
            else:
                raise e

if __name__ == "__main__":
    run_server()
