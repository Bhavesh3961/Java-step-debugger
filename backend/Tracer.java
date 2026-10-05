import com.sun.jdi.*;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Tracer {
    private static final int MAX_STEPS = 1000;

    public static class StepInfo {
        public int step;
        public int line;
        public String method;
        public String frame;
        public List<Map<String, String>> variables = new ArrayList<>();
        public List<Map<String, Object>> callStack = new ArrayList<>();
        public String output = "";
    }

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("Usage: java Tracer <classpath> <mainClass> [jsonOutputFile] [stdinFile]");
            System.exit(1);
        }

        String classPath = args[0];
        String mainClassName = args[1];
        String outputFile = args.length > 2 && !args[2].isEmpty() ? args[2] : null;
        String stdinFile = args.length > 3 && !args[3].isEmpty() ? args[3] : null;

        try {
            List<StepInfo> steps = trace(classPath, mainClassName, stdinFile);
            String json = toJson(steps);
            if (outputFile != null) {
                try (PrintWriter out = new PrintWriter(outputFile, StandardCharsets.UTF_8)) {
                    out.print(json);
                }
            } else {
                System.out.println(json);
            }
        } catch (Exception e) {
            System.err.println("Tracer execution error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    public static List<StepInfo> trace(String classPath, String mainClassName) throws Exception {
        return trace(classPath, mainClassName, null);
    }

    public static List<StepInfo> trace(String classPath, String mainClassName, String stdinFile) throws Exception {
        VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
        LaunchingConnector connector = null;
        for (LaunchingConnector lc : vmm.launchingConnectors()) {
            if (lc.name().equals("com.sun.jdi.CommandLineLaunch")) {
                connector = lc;
                break;
            }
        }

        if (connector == null) {
            throw new IllegalStateException("CommandLineLaunch connector not found");
        }

        Map<String, com.sun.jdi.connect.Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("main").setValue(mainClassName);
        arguments.get("options").setValue("-cp \"" + classPath + "\"");
        arguments.get("suspend").setValue("true");

        VirtualMachine vm = connector.launch(arguments);
        Process process = vm.process();

        // Feed stdin asynchronously if provided, or close stdin to prevent blocking forever
        if (stdinFile != null) {
            new Thread(() -> {
                try (OutputStream os = process.getOutputStream();
                     FileInputStream fis = new FileInputStream(stdinFile)) {
                    byte[] buf = new byte[1024];
                    int r;
                    while ((r = fis.read(buf)) != -1) {
                        os.write(buf, 0, r);
                    }
                    os.flush();
                } catch (IOException ignored) {}
            }).start();
        } else {
            try {
                process.getOutputStream().close();
            } catch (IOException ignored) {}
        }

        // Capture stdout & stderr asynchronously
        StringBuilder stdoutBuf = new StringBuilder();
        Thread outThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                char[] cbuf = new char[1024];
                int read;
                while ((read = reader.read(cbuf)) != -1) {
                    synchronized (stdoutBuf) {
                        stdoutBuf.append(cbuf, 0, read);
                    }
                }
            } catch (IOException ignored) {}
        });
        outThread.setDaemon(true);
        outThread.start();

        Thread errThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                char[] cbuf = new char[1024];
                int read;
                while ((read = reader.read(cbuf)) != -1) {
                    synchronized (stdoutBuf) {
                        stdoutBuf.append(cbuf, 0, read);
                    }
                }
            } catch (IOException ignored) {}
        });
        errThread.setDaemon(true);
        errThread.start();

        EventRequestManager erm = vm.eventRequestManager();

        // Listen for user classes loading
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter(mainClassName + "*");
        cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        cpr.enable();

        List<StepInfo> steps = new ArrayList<>();
        EventQueue queue = vm.eventQueue();
        boolean connected = true;
        int stepCount = 0;
        StepRequest activeStepReq = null;

        while (connected && stepCount < MAX_STEPS) {
            EventSet eventSet = queue.remove(1500);
            if (eventSet == null) {
                if (!process.isAlive()) {
                    break;
                }
                continue;
            }

            for (Event event : eventSet) {
                if (event instanceof VMStartEvent) {
                    // Start of VM
                } else if (event instanceof ClassPrepareEvent) {
                    ClassPrepareEvent cpe = (ClassPrepareEvent) event;
                    ReferenceType refType = cpe.referenceType();
                    if (refType.name().startsWith(mainClassName)) {
                        if (activeStepReq == null) {
                            activeStepReq = erm.createStepRequest(cpe.thread(), StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                            activeStepReq.addClassFilter(mainClassName + "*");
                            activeStepReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                            activeStepReq.enable();
                        }
                    }
                } else if (event instanceof StepEvent) {
                    StepEvent se = (StepEvent) event;
                    Location loc = se.location();
                    int lineNumber = loc.lineNumber();
                    String declName = loc.declaringType().name();

                    if (lineNumber > 0 && declName.startsWith(mainClassName)) {
                        // Tiny pause to allow any just-printed stream bytes to reach buffer
                        try { Thread.sleep(6); } catch (InterruptedException ignored) {}

                        stepCount++;
                        StepInfo si = new StepInfo();
                        si.step = stepCount;
                        si.line = lineNumber;
                        si.method = loc.method().name();
                        si.frame = loc.method().name() + ":" + lineNumber;

                        synchronized (stdoutBuf) {
                            si.output = stdoutBuf.toString();
                        }

                        // Inspect visible local variables and stack frames
                        try {
                            ThreadReference thread = se.thread();
                            if (thread.frameCount() > 0) {
                                StackFrame topFrame = thread.frame(0);
                                List<LocalVariable> visibleVars = topFrame.visibleVariables();
                                for (LocalVariable lv : visibleVars) {
                                    // Filter default empty args if String[0]
                                    if (lv.name().equals("args") && lv.typeName().equals("java.lang.String[]")) {
                                        Value val = topFrame.getValue(lv);
                                        if (val instanceof ArrayReference && ((ArrayReference) val).length() == 0) {
                                            continue;
                                        }
                                    }

                                    Map<String, String> varMap = new LinkedHashMap<>();
                                    varMap.put("name", lv.name());
                                    varMap.put("type", lv.typeName());
                                    try {
                                        Value val = topFrame.getValue(lv);
                                        varMap.put("value", formatValue(val));
                                    } catch (Exception ex) {
                                        varMap.put("value", "<unavailable>");
                                    }
                                    si.variables.add(varMap);
                                }

                                for (int i = 0; i < thread.frameCount(); i++) {
                                    StackFrame f = thread.frame(i);
                                    Location fLoc = f.location();
                                    if (fLoc.declaringType().name().startsWith(mainClassName)) {
                                        Map<String, Object> frameMap = new LinkedHashMap<>();
                                        frameMap.put("method", fLoc.method().name());
                                        frameMap.put("line", fLoc.lineNumber());
                                        frameMap.put("class", fLoc.declaringType().name());
                                        si.callStack.add(frameMap);
                                    }
                                }
                            }
                        } catch (Exception ignored) {}

                        steps.add(si);
                    }
                } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                    connected = false;
                }
            }

            try {
                eventSet.resume();
            } catch (VMDisconnectedException e) {
                connected = false;
            }
        }

        try {
            process.waitFor();
        } catch (InterruptedException ignored) {}

        try {
            outThread.join(400);
            errThread.join(400);
        } catch (InterruptedException ignored) {}

        // Ensure final output matches in last step
        String finalOutput;
        synchronized (stdoutBuf) {
            finalOutput = stdoutBuf.toString();
        }
        if (!steps.isEmpty()) {
            StepInfo last = steps.get(steps.size() - 1);
            if (!last.output.equals(finalOutput)) {
                last.output = finalOutput;
            }
        }

        return steps;
    }

    private static String formatValue(Value value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof IntegerValue) {
            return String.valueOf(((IntegerValue) value).value());
        }
        if (value instanceof BooleanValue) {
            return String.valueOf(((BooleanValue) value).value());
        }
        if (value instanceof LongValue) {
            return String.valueOf(((LongValue) value).value());
        }
        if (value instanceof DoubleValue) {
            return String.valueOf(((DoubleValue) value).value());
        }
        if (value instanceof FloatValue) {
            return String.valueOf(((FloatValue) value).value());
        }
        if (value instanceof ShortValue) {
            return String.valueOf(((ShortValue) value).value());
        }
        if (value instanceof ByteValue) {
            return String.valueOf(((ByteValue) value).value());
        }
        if (value instanceof CharValue) {
            return "'" + ((CharValue) value).value() + "'";
        }
        if (value instanceof StringReference) {
            return "\"" + escapeString(((StringReference) value).value()) + "\"";
        }
        if (value instanceof ArrayReference) {
            ArrayReference arr = (ArrayReference) value;
            int len = arr.length();
            StringBuilder sb = new StringBuilder("[");
            int maxShow = Math.min(len, 25);
            for (int i = 0; i < maxShow; i++) {
                if (i > 0) sb.append(", ");
                sb.append(formatValue(arr.getValue(i)));
            }
            if (len > maxShow) {
                sb.append(", ... (").append(len).append(" items)");
            }
            sb.append("]");
            return sb.toString();
        }
        if (value instanceof ObjectReference) {
            ObjectReference obj = (ObjectReference) value;
            ReferenceType rt = obj.referenceType();
            String typeName = rt.name();

            // Boxed numbers
            if (typeName.equals("java.lang.Integer") || typeName.equals("java.lang.Double") ||
                typeName.equals("java.lang.Boolean") || typeName.equals("java.lang.Long") ||
                typeName.equals("java.lang.Float") || typeName.equals("java.lang.Short") ||
                typeName.equals("java.lang.Byte") || typeName.equals("java.lang.Character")) {
                Field f = rt.fieldByName("value");
                if (f != null) {
                    return formatValue(obj.getValue(f));
                }
            }

            // ArrayList / List
            if (typeName.equals("java.util.ArrayList")) {
                Field elementDataField = rt.fieldByName("elementData");
                Field sizeField = rt.fieldByName("size");
                if (elementDataField != null && sizeField != null) {
                    Value edVal = obj.getValue(elementDataField);
                    Value szVal = obj.getValue(sizeField);
                    if (edVal instanceof ArrayReference && szVal instanceof IntegerValue) {
                        int size = ((IntegerValue) szVal).value();
                        ArrayReference edArr = (ArrayReference) edVal;
                        StringBuilder sb = new StringBuilder("ArrayList [");
                        int maxShow = Math.min(size, 20);
                        for (int i = 0; i < maxShow; i++) {
                            if (i > 0) sb.append(", ");
                            sb.append(formatValue(edArr.getValue(i)));
                        }
                        if (size > maxShow) {
                            sb.append(", ... (").append(size).append(" elements)");
                        }
                        sb.append("]");
                        return sb.toString();
                    }
                }
            }

            // Scanner & I/O Utilities
            if (typeName.equals("java.util.Scanner")) {
                return "<Scanner>";
            }
            if (typeName.equals("java.util.Random")) {
                return "<Random>";
            }
            if (typeName.startsWith("java.io.") || typeName.startsWith("java.nio.")) {
                return "<" + rt.name().substring(rt.name().lastIndexOf('.') + 1) + ">";
            }

            // StringBuilder / StringBuffer
            if (typeName.equals("java.lang.StringBuilder") || typeName.equals("java.lang.StringBuffer")) {
                Field valField = rt.fieldByName("value");
                Field countField = rt.fieldByName("count");
                if (valField != null && countField != null) {
                    try {
                        Value v = obj.getValue(valField);
                        Value c = obj.getValue(countField);
                        if (v instanceof ArrayReference && c instanceof IntegerValue) {
                            ArrayReference arr = (ArrayReference) v;
                            int cnt = ((IntegerValue) c).value();
                            StringBuilder sb = new StringBuilder("\"");
                            for (int i = 0; i < Math.min(cnt, 50); i++) {
                                Value b = arr.getValue(i);
                                if (b instanceof ByteValue) sb.append((char) ((ByteValue) b).value());
                                else if (b instanceof CharValue) sb.append(((CharValue) b).value());
                            }
                            if (cnt > 50) sb.append("...");
                            sb.append("\"");
                            return sb.toString();
                        }
                    } catch (Exception ignored) {}
                }
                return "<" + rt.name().substring(rt.name().lastIndexOf('.') + 1) + ">";
            }

            // Non-user JDK internal objects: display concise <ClassName> instead of internal fields
            if (typeName.startsWith("java.") || typeName.startsWith("javax.") || 
                typeName.startsWith("jdk.") || typeName.startsWith("sun.")) {
                return "<" + rt.name().substring(rt.name().lastIndexOf('.') + 1) + ">";
            }

            // Custom user objects: ClassName{field1=val, field2=val}
            String simpleName = rt.name().substring(rt.name().lastIndexOf('.') + 1);
            StringBuilder sb = new StringBuilder(simpleName).append("{");
            List<Field> fields = rt.visibleFields();
            int count = 0;
            for (Field f : fields) {
                if (f.isStatic()) continue;
                if (count > 0) sb.append(", ");
                if (count >= 6) {
                    sb.append("...");
                    break;
                }
                sb.append(f.name()).append("=");
                try {
                    Value fVal = obj.getValue(f);
                    if (fVal instanceof ObjectReference && !(fVal instanceof StringReference) && !fVal.type().name().startsWith("java.lang.")) {
                        sb.append(fVal.type().name().substring(fVal.type().name().lastIndexOf('.') + 1));
                    } else {
                        sb.append(formatValue(fVal));
                    }
                } catch (Exception e) {
                    sb.append("?");
                }
                count++;
            }
            sb.append("}");
            return sb.toString();
        }
        return value.toString();
    }

    private static String escapeString(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static String toJson(List<StepInfo> steps) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        sb.append("  \"success\": true,\n");
        sb.append("  \"totalSteps\": ").append(steps.size()).append(",\n");
        sb.append("  \"steps\": [\n");
        for (int i = 0; i < steps.size(); i++) {
            StepInfo s = steps.get(i);
            sb.append("    {\n");
            sb.append("      \"step\": ").append(s.step).append(",\n");
            sb.append("      \"line\": ").append(s.line).append(",\n");
            sb.append("      \"method\": \"").append(escapeString(s.method)).append("\",\n");
            sb.append("      \"frame\": \"").append(escapeString(s.frame)).append("\",\n");
            sb.append("      \"output\": \"").append(escapeString(s.output)).append("\",\n");

            sb.append("      \"variables\": [\n");
            for (int j = 0; j < s.variables.size(); j++) {
                Map<String, String> v = s.variables.get(j);
                sb.append("        {\"name\": \"").append(escapeString(v.get("name")))
                  .append("\", \"value\": \"").append(escapeString(v.get("value")))
                  .append("\", \"type\": \"").append(escapeString(v.get("type"))).append("\"}");
                if (j < s.variables.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("      ],\n");

            sb.append("      \"callStack\": [\n");
            for (int k = 0; k < s.callStack.size(); k++) {
                Map<String, Object> cs = s.callStack.get(k);
                sb.append("        {\"method\": \"").append(escapeString((String) cs.get("method")))
                  .append("\", \"line\": ").append(cs.get("line"))
                  .append(", \"class\": \"").append(escapeString((String) cs.get("class"))).append("\"}");
                if (k < s.callStack.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("      ]\n");

            sb.append("    }");
            if (i < steps.size() - 1) sb.append(",");
            sb.append("\n");
        }
        sb.append("  ]\n");
        sb.append("}\n");
        return sb.toString();
    }
}
