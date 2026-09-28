import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Table,
  Text,
  computeDAGLayout,
  useHostTheme,
} from "cursor/canvas";

const FLOW = [
  { id: "mic", label: "MediaRecorder", detail: "browser, local" },
  { id: "speech", label: "Web Speech", detail: "live transcript" },
  { id: "skill", label: "gradeSpokenAnswer", detail: "fixed skill" },
  { id: "nano", label: "Nano", detail: "Token Factory" },
  { id: "ultra", label: "Ultra", detail: "Token Factory" },
  { id: "zod", label: "Zod gate", detail: "quote + rubric" },
  { id: "store", label: "SpokenMiss", detail: "schema v2" },
  { id: "plan", label: "planNextSession", detail: "open miss first" },
];

const FLOW_EDGES = [
  { from: "mic", to: "speech" },
  { from: "speech", to: "skill" },
  { from: "skill", to: "nano" },
  { from: "nano", to: "ultra" },
  { from: "ultra", to: "zod" },
  { from: "zod", to: "store" },
  { from: "store", to: "plan" },
];

function FlowDiagram() {
  const theme = useHostTheme();
  const layout = computeDAGLayout({
    nodes: FLOW.map((n) => ({ id: n.id })),
    edges: FLOW_EDGES,
    direction: "horizontal",
    nodeWidth: 128,
    nodeHeight: 50,
    rankGap: 28,
    nodeGap: 12,
    padding: 4,
  });
  const byId = Object.fromEntries(FLOW.map((n) => [n.id, n]));
  const remote = new Set(["nano", "ultra"]);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="Low-level path from the microphone through the grade skill, Nano, Ultra, validation, local miss store, and the next plan"
    >
      {layout.edges.map((edge) => (
        <line
          key={`${edge.from}-${edge.to}`}
          x1={edge.sourceX}
          y1={edge.sourceY}
          x2={edge.targetX}
          y2={edge.targetY}
          stroke={theme.stroke.primary}
          strokeWidth={1.5}
        />
      ))}
      {layout.nodes.map((node) => {
        const meta = byId[node.id];
        const isRemote = remote.has(node.id);
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={128}
              height={50}
              rx={6}
              fill={isRemote ? theme.fill.tertiary : theme.bg.elevated}
              stroke={isRemote ? theme.accent.primary : theme.stroke.secondary}
            />
            <text
              x={node.x + 64}
              y={node.y + 21}
              textAnchor="middle"
              fill={theme.text.primary}
              fontSize={11}
              fontWeight={600}
            >
              {meta.label}
            </text>
            <text
              x={node.x + 64}
              y={node.y + 36}
              textAnchor="middle"
              fill={theme.text.secondary}
              fontSize={10}
            >
              {meta.detail}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SixtyLld() {
  return (
    <Stack gap={22}>
      <Stack gap={8}>
        <H1>sixty low-level design</H1>
        <Text tone="secondary">
          Personal AI track. One browser process. Two skills. The model is
          allowed to read a rubric and name a miss. It is not allowed to write
          memory or choose the next tool.
        </Text>
      </Stack>

      <Callout tone="info" title="Agent framework for this project">
        Write a two-skill runner in src/agent. Do not add LangGraph, CrewAI,
        AutoGen, LangChain, Hermes, NemoClaw, or OpenShell. Those run an open
        loop. This job has a fixed order: transcribe, Nano, Ultra, validate,
        save, replan. The only new package is the official openai client, with
        baseURL set to Nebius Token Factory.
      </Callout>

      <H2>Runtime path</H2>
      <Text tone="secondary" size="small">
        Accent boxes are the only network calls. Source: sixty app at
        ../sixty/sixty plus the hackathon spec in docs 02 through 06.
      </Text>
      <FlowDiagram />

      <H2>Stack</H2>
      <Table
        headers={["Layer", "Choice", "Where", "Why this one"]}
        rows={[
          [
            "App",
            "React 18, TypeScript, Vite, Tailwind, Radix",
            "already in sixty",
            "Timer, topics, SM-2, and debrief already exist. Rebuilding them spends the month the grade needs.",
          ],
          [
            "Validation",
            "Zod 3, already a dependency",
            "src/agent/gradeSchema.ts",
            "A grade that fails the schema never reaches the screen.",
          ],
          [
            "Audio",
            "MediaRecorder, audio/webm;codecs=opus",
            "src/audio/recorder.ts",
            "No upload library. The blob lives in a module variable for one attempt, then is dropped.",
          ],
          [
            "Transcript",
            "webkitSpeechRecognition / SpeechRecognition",
            "src/audio/liveTranscript.ts",
            "Runs during the 60 seconds on this machine. Token Factory never has to accept audio.",
          ],
          [
            "Model client",
            "openai npm package, baseURL override",
            "src/agent/tokenFactory.ts",
            "Token Factory is OpenAI-compatible. One client, two model ids, a call log the debrief can show.",
          ],
          [
            "Cheap model",
            "Nemotron 3 Nano, id from env",
            "structureTranscript",
            "Lists which key points were covered. High volume, no judgment.",
          ],
          [
            "Judge model",
            "Nemotron 3 Ultra, id from env",
            "nameMiss",
            "Returns one miss. This is the qualifying call.",
          ],
          [
            "Memory",
            "AppState.misses, schemaVersion 2",
            "localStorage sixty.v1 and .sixty/progress.json",
            "Same store as attempts. No database.",
          ],
          [
            "Planner",
            "buildDailyPlan plus one prepend rule",
            "src/lib/selection.ts",
            "SM-2 stays. An open miss occupies the first slot.",
          ],
        ]}
      />

      <H2>Skills and tools</H2>
      <Text>
        A skill is a TypeScript function with an allow-list. The model never
        picks the next tool. The orchestrator calls tools in order and stops
        on the first failure.
      </Text>
      <Table
        headers={["Skill", "Caller", "Tools it may use", "Writes memory?"]}
        rowTone={["info", "success"]}
        rows={[
          [
            "gradeSpokenAnswer",
            "Debrief, after the timer",
            "readRubric, structureTranscript, nameMiss",
            "No. The screen saves only after Zod accepts the miss.",
          ],
          [
            "planNextSession",
            "useDailyPlan on Home",
            "listOpenMisses, then existing buildDailyPlan",
            "No. It only sorts. Closing a miss is a separate user or grade action.",
          ],
        ]}
      />

      <H3>Tool contracts</H3>
      <Table
        headers={["Tool", "Input", "Output", "Network"]}
        rows={[
          [
            "readRubric",
            "topicId",
            "modelAnswer, keyPoints, commonGotchas copied from the Topic already in the catalog",
            "None",
          ],
          [
            "structureTranscript",
            "transcript + keyPoints",
            "{ covered: string[], skipped: string[] } where every string is copied from keyPoints",
            "Token Factory, Nano",
          ],
          [
            "nameMiss",
            "transcript, rubric, Nano lists",
            "Ultra JSON: missType, quote, rubricLine, plainLanguage, coveredRubricLines",
            "Token Factory, Ultra",
          ],
          [
            "listOpenMisses",
            "AppState.misses",
            "Latest miss per topic where status is open, newest first",
            "None",
          ],
        ]}
      />

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill size="sm" active>local write</Pill>}>
            appendMiss
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Not a model tool. useStore action miss/append runs only when
                gradeSpokenAnswer returns status graded.
              </Text>
              <Text size="small" tone="secondary">
                Payload is the validated SpokenMiss plus the two OutboundCall
                records so Debrief can name Nano and Ultra.
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill size="sm" active>local write</Pill>}>
            resolveMiss
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                miss/resolve sets status to resolved. Two triggers: the person
                presses Resolved on Debrief, or a later accepted grade lists
                that same rubricLine inside coveredRubricLines.
              </Text>
              <Text size="small" tone="secondary">
                A failed or rejected grade never resolves anything.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <H2>gradeSpokenAnswer</H2>
      <Text>
        Signature: gradeSpokenAnswer(input: GradeInput): Promise&lt;GradeOutcome&gt;.
        GradeInput is topic, transcript, attemptId, and the Token Factory
        client. The function does not touch React state.
      </Text>
      <Table
        headers={["Step", "Stop condition", "Outcome status"]}
        rowTone={["neutral", "warning", "danger", "danger", "danger", "success"]}
        rows={[
          [
            "1. Trim the transcript",
            "Empty after trim",
            "skipped, reason empty-transcript. Ultra is not called.",
          ],
          [
            "2. readRubric",
            "Topic missing from catalog",
            "failed, reason unknown-topic.",
          ],
          [
            "3. structureTranscript on Nano",
            "HTTP error, timeout, or JSON that cites a point not in keyPoints",
            "failed, reason nano-error. Attempt can still save from the self-rating.",
          ],
          [
            "4. nameMiss on Ultra",
            "HTTP error or timeout at 20s",
            "failed, reason ultra-error. No invented miss.",
          ],
          [
            "5. Zod plus two checks",
            "Schema fail, quote not in the transcript, or rubricLine not in the scaffold",
            "rejected, reason vague-grade. Debrief shows an error, not a paragraph.",
          ],
          [
            "6. Return the miss",
            "All checks passed",
            "graded. UI then dispatches miss/append.",
          ],
        ]}
      />

      <Callout tone="warning" title="The two checks Zod cannot do alone">
        Normalize both strings: lowercase, collapse whitespace. quote must be a
        substring of the transcript. rubricLine must equal one keyPoint, one
        commonGotcha, or one modelAnswer line that was sent in the prompt.
        covered and skipped must be subsets of keyPoints. If Ultra paraphrases
        the rubric, the grade is rejected.
      </Callout>

      <H3>Ultra JSON</H3>
      <Table
        headers={["Field", "Rule"]}
        rows={[
          ["missType", "1 to 48 characters. Short label, for example skipped idempotency. Used to group repeats."],
          ["quote", "1 to 240 characters. Must occur in the transcript after normalization."],
          ["rubricLine", "Must be an exact member of the rubric lines passed in."],
          ["plainLanguage", "1 to 280 characters. One or two sentences shown on the next session."],
          ["coveredRubricLines", "Array of rubric lines Ultra believes this answer did cover. Used only to close an older miss."],
          ["model", "Filled by the client from the Ultra model id, not by the model."],
        ]}
      />

      <H3>Prompts, fixed</H3>
      <Text size="small">
        Nano system: you only classify key points. Return JSON covered and
        skipped. Every string must be copied from the list. Do not add points.
        Temperature 0.
      </Text>
      <Text size="small">
        Ultra system: you name one primary miss. quote must be copied from the
        transcript. rubricLine must be copied from the rubric. If nothing was
        missed, still pick the weakest rubric line and say so in plainLanguage.
        Do not give study tips. Temperature 0. Response format json_object.
      </Text>

      <H2>Data, schema version 2</H2>
      <Text>
        storage.ts today is SCHEMA_VERSION 1 with an empty MIGRATIONS table.
        Add MIGRATIONS[1] that sets misses to [] and tokenFactoryApiKey to "".
        Bump SCHEMA_VERSION to 2. Existing attempts, SM-2 progress, and notes
        stay.
      </Text>
      <Grid columns="1.2fr 1fr" gap={16}>
        <Stack gap={8}>
          <H3>SpokenMiss</H3>
          <Table
            headers={["Field", "Type"]}
            rows={[
              ["id", "string from uid()"],
              ["topicId", "string"],
              ["attemptId", "string, same id as the Attempt"],
              ["at", "ISO timestamp"],
              ["status", "open or resolved"],
              ["missType", "string"],
              ["quote", "string"],
              ["rubricLine", "string"],
              ["plainLanguage", "string"],
              ["model", "Ultra model id"],
              ["resolvedAt", "ISO or null"],
              ["calls", "OutboundCall[2], Nano then Ultra"],
            ]}
          />
        </Stack>
        <Stack gap={8}>
          <H3>Settings addition</H3>
          <Text size="small">
            tokenFactoryApiKey sits beside the existing aiApiKey. Topic
            generation keeps using OpenAI or Anthropic. Grading never reads
            aiApiKey.
          </Text>
          <Divider />
          <Text size="small">
            Env for a judge running the test build: VITE_TOKEN_FACTORY_API_KEY,
            VITE_TOKEN_FACTORY_BASE_URL defaulting to
            https://api.tokenfactory.us-central1.nebius.com/v1, VITE_NEMOTRON_NANO,
            VITE_NEMOTRON_ULTRA. Env wins over the settings field. Keys are
            never committed.
          </Text>
          <Divider />
          <Text size="small">
            OutboundCall is at, provider token-factory, model, purpose
            structure or judge. Debrief renders this list under the miss.
          </Text>
        </Stack>
      </Grid>

      <H2>planNextSession</H2>
      <Text>
        Add PlanSlot open-miss. buildDailyPlan gains an optional openMissTopicIds
        argument. useDailyPlan passes the ids from listOpenMisses.
      </Text>
      <Table
        headers={["Order", "Rule"]}
        rows={[
          ["1", "Take open misses, one per topic, newest first."],
          ["2", "Emit those as entries with slot open-miss, up to planSize."],
          ["3", "Call the existing slot filler for the remaining seats, skipping topic ids already used."],
          ["4", "Do not change nextSchedule. Ease, interval, and dueAt still come from the 1 to 5 self-rating."],
          ["5", "An open miss is due today even when dueAt is in the future. Resolving it returns the topic to SM-2."],
        ]}
      />
      <Text size="small" tone="secondary">
        Home card for an open-miss slot shows missType. Research and Explain
        read the latest open SpokenMiss for that topicId and render
        plainLanguage above the timer. Esc on Explain does not resolve it.
      </Text>

      <H2>Screen wiring</H2>
      <Table
        headers={["File", "Change"]}
        rows={[
          [
            "src/audio/recorder.ts",
            "start() gets a mic stream and a SpeechRecognition session. finish() stops both and returns { blob, transcript }. discard() stops tracks and drops both. No sessionStorage for audio.",
          ],
          [
            "src/audio/pendingAttempt.ts",
            "Module slot: one PendingAttempt or null. Explain.finish writes it. Debrief reads it once and clears it. Explain abandon writes null.",
          ],
          [
            "src/screens/Explain.tsx",
            "On counting start, recorder.start(). Enter and timer end call finish then navigate. Esc and the exit button call discard then navigate home. A mic error still allows the timer. Transcript may be empty, and the grade then skips.",
          ],
          [
            "src/screens/Debrief.tsx",
            "On mount, if a pending attempt exists, run gradeSpokenAnswer. Show Nano box, Ultra box, or the failure status. Self-rating still required. Save writes the Attempt and, only on graded, the SpokenMiss with the same attempt id.",
          ],
          [
            "src/screens/Research.tsx",
            "Banner with the open plainLanguage miss when one exists for this topic.",
          ],
          [
            "src/hooks/useStore.ts",
            "Actions miss/append and miss/resolve. recordAttempt stays the path for ratings and SM-2.",
          ],
          [
            "src/lib/selection.ts",
            "Prepend open-miss entries. Tests in selection.test.ts cover an open miss beating a higher-mastery due review.",
          ],
        ]}
      />

      <H2>Client call</H2>
      <Text size="small">
        tokenFactory.ts exports createClient(apiKey). It constructs new
        OpenAI with baseURL and dangerouslyAllowBrowser: true, matching the
        existing browser-side key pattern in src/lib/ai.ts. chatJson(model,
        system, user) sends temperature 0 and response_format json_object,
        strips a markdown fence if the model adds one, then JSON.parse. Timeout
        20 seconds via AbortSignal. Each success or failure pushes an
        OutboundCall before returning.
      </Text>

      <H2>What the debrief renders</H2>
      <Grid columns={3} gap={12}>
        <Card>
          <CardHeader>graded</CardHeader>
          <CardBody>
            <Text size="small">
              Quote, rubric line, plain language, miss type. Under it, two
              lines: Nano model id for the covered list, Ultra model id for
              the miss.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>rejected</CardHeader>
          <CardBody>
            <Text size="small">
              “The grade did not cite your words or a rubric line.” No
              paragraph. Self-rating can still save. Nothing is appended to
              misses.
            </Text>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>failed or skipped</CardHeader>
          <CardBody>
            <Text size="small">
              “The grade did not run.” Reason is empty transcript, Nano error,
              or Ultra error. The plan does not gain an open miss.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <H2>Tests that define done</H2>
      <Table
        headers={["Test", "Proves"]}
        rows={[
          ["gradeSchema rejects a quote absent from the transcript", "Vague output cannot ship."],
          ["gradeSchema rejects a rubricLine that was not in the prompt", "The model cannot invent the rubric."],
          ["gradeSpokenAnswer does not call Ultra when the transcript is empty", "The failure rule is real."],
          ["selection puts an open miss in slot 0 ahead of a due review", "Session two is caused by the miss."],
          ["resolveMiss removes that topic from the front of the plan", "Closing the miss returns control to SM-2."],
          ["migration from schema 1 yields misses: []", "Existing local progress still loads."],
        ]}
      />

      <Callout tone="neutral" title="Left out on purpose">
        No vector store, no chat thread, no second agent that plans in natural
        language, no face video, no Tavily on the grade path. Tavily can be a
        third tool later, scaffoldLookup, called only when keyPoints.length is
        under 3, and its OutboundCall must show on Debrief. Topic generation in
        src/lib/ai.ts stays on its current providers and stays off the demo.
      </Callout>

      <Row gap={8}>
        <Text size="small" tone="tertiary">
          Product code lives in the sixty app. This repo stays the spec until
          the grade work starts there.
        </Text>
      </Row>
    </Stack>
  );
}
