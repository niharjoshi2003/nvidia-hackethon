import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  H1,
  H2,
  H3,
  Stack,
  Table,
  Text,
} from "cursor/canvas";

export default function SixtyPlan() {
  return (
    <Stack gap={22}>
      <Stack gap={8}>
        <H1>sixty build plan</H1>
        <Text tone="secondary">
          What the finished product is, then the order to build it. The
          contracts live in the low-level design. This plan says when each
          contract becomes something a person can click. Deadline 30 October
          2026, 10:00am PDT. Product code is written in the sixty app. This
          repo stays the spec.
        </Text>
      </Stack>

      <Callout tone="info" title="Finished means this, and only this">
        A teammate opens a seeded topic, speaks for under a minute, and sees
        one miss tied to a sentence they said and a line in that topic’s
        rubric. They reload. Home leads with that topic because the miss is
        still open, and the same miss is on screen before the timer. A grade
        that only says “be more specific” is not finished.
      </Callout>

      <H2>What a session looks like when it is done</H2>
      <Text>
        One person, one browser, no server of ours. Audio and the miss log
        stay on this machine. Two calls leave the machine, both to Nebius
        Token Factory.
      </Text>
      <Table
        headers={["Screen", "What the person sees", "What the code does"]}
        rows={[
          [
            "Home",
            "Today’s plan. If a miss is open, that topic is the first card and the card shows the short miss label.",
            "planNextSession prepends open misses, then the existing SM-2 filler fills the remaining seats.",
          ],
          [
            "Research",
            "The scaffold, plus a banner with the last open miss in plain language when one exists.",
            "Reads the latest open SpokenMiss for this topicId. Does not call a model.",
          ],
          [
            "Explain",
            "The same full-screen timer. The mic is on while the timer runs. Space and Enter behave as they do today.",
            "MediaRecorder plus Web Speech. Finish keeps one blob and the transcript in a module slot. Esc drops both and writes nothing.",
          ],
          [
            "Debrief",
            "The self-rating, and beside it the miss: quote, rubric line, plain language. Under that, the Nano model id and the Ultra model id.",
            "gradeSpokenAnswer runs. Zod rejects a grade that does not quote the transcript or name a real rubric line. Only an accepted grade is saved.",
          ],
          [
            "Next Home, after reload",
            "The same topic is first. Opening it shows the same miss before the person speaks again.",
            "The miss is in AppState.misses, schema version 2, in localStorage and .sixty/progress.json.",
          ],
        ]}
      />

      <H2>What we are not building, even at the end</H2>
      <Text>
        No new app, no chat box, no face video, no vector database, and no
        open agent loop. LangGraph, CrewAI, AutoGen, and LangChain stay out.
        The agent is two TypeScript skills with a fixed order. Topic
        generation through OpenAI or Anthropic stays in the app and stays off
        the demo. Tavily is optional, only after the grade and the second
        session are solid, and only when a topic has fewer than three key
        points.
      </Text>

      <H2>Order of work</H2>
      <Text>
        Do not start a phase until the previous exit is true. Dates assume a
        start of 28 September 2026.
      </Text>
      <Table
        headers={["Phase", "Dates", "Build", "Exit"]}
        rowTone={["neutral", "neutral", "info", "info", "success", "warning"]}
        rows={[
          [
            "A. Contracts",
            "28 Sep – 1 Oct",
            "SpokenMiss on AppState. Schema migration 1 to 2. Zod gate for quote and rubricLine. No microphone and no network.",
            "Old progress still loads with misses set to an empty list. A quote that is not in the transcript is rejected. A rubric line that was not in the prompt is rejected.",
          ],
          [
            "B. Hearing",
            "2 Oct – 5 Oct",
            "Recorder, live transcript, and a one-slot pending attempt. Explain starts the mic with the timer. Debrief shows the transcript. No model yet.",
            "Finish keeps the words. Esc and the exit button leave no pending audio and no new progress.",
          ],
          [
            "C. The grade",
            "6 Oct – 12 Oct",
            "openai client pointed at Token Factory. gradeSpokenAnswer: read rubric, Nano, Ultra, then the Zod gate. Debrief shows graded, rejected, failed, or skipped.",
            "Five spoken runs on two seeded topics. A teammate agrees each accepted miss is specific. A vague model reply shows an error, not a paragraph.",
          ],
          [
            "D. The second session",
            "13 Oct – 18 Oct",
            "miss/append and miss/resolve. Home puts an open miss first. Research and Explain show plainLanguage before the timer. Resolving returns the topic to SM-2.",
            "Reload. Session two is impossible to fake without the stored miss. Marking the miss resolved removes it from the front of the plan.",
          ],
          [
            "E. The measurement",
            "19 Oct – 24 Oct",
            "Both model ids and the two outbound calls visible on Debrief. Empty transcript never calls Ultra. Token Factory errors save the self-rating and invent no miss. About five recordings scored by a teammate.",
            "The agreement count is written in the product README. One honest fraction, for example 4 of 5.",
          ],
          [
            "F. Submission",
            "25 Oct – 29 Oct",
            "Public repo, MIT or Apache 2.0, setup steps, a section titled What changed during the hackathon. YouTube under 3 minutes from the demo script. Devpost form: Personal AI, Token Factory, Nemotron.",
            "A judge who is not us can run the test build and see the miss change the next plan. Submit before 30 Oct, 10:00am PDT.",
          ],
        ]}
      />

      <H2>Files, by the time the product is done</H2>
      <Text size="small" tone="secondary">
        New files are created in the sixty app. The rows marked change are
        files that already exist.
      </Text>
      <Table
        headers={["Path", "Kind", "Phase", "Responsibility"]}
        rows={[
          ["src/agent/gradeSchema.ts", "new", "A", "Zod schema and the quote and rubric checks."],
          ["src/types.ts", "change", "A", "SpokenMiss, AppState.misses, tokenFactoryApiKey."],
          ["src/lib/storage.ts", "change", "A", "SCHEMA_VERSION 2 and the migration that adds an empty miss list."],
          ["src/audio/recorder.ts", "new", "B", "Mic stream and MediaRecorder. discard stops the tracks."],
          ["src/audio/liveTranscript.ts", "new", "B", "Web Speech during the 60 seconds."],
          ["src/audio/pendingAttempt.ts", "new", "B", "One in-memory slot. Not sessionStorage. Not the progress file."],
          ["src/screens/Explain.tsx", "change", "B", "Start on the timer. Finish writes the slot. Esc clears it."],
          ["src/agent/tokenFactory.ts", "new", "C", "OpenAI client, Token Factory base URL, 20 second timeout, call log."],
          ["src/agent/prompts.ts", "new", "C", "Nano classifies key points. Ultra names one miss. Temperature 0."],
          ["src/agent/gradeSpokenAnswer.ts", "new", "C", "Fixed order. The model cannot pick the next tool or write memory."],
          ["src/screens/Debrief.tsx", "change", "C", "Runs the skill. Renders the four statuses. Save still records the self-rating."],
          ["src/hooks/useStore.ts", "change", "D", "miss/append and miss/resolve."],
          ["src/lib/selection.ts", "change", "D", "PlanSlot open-miss occupies the front of the day."],
          ["src/hooks/useDailyPlan.ts", "change", "D", "Passes open miss topic ids into the planner."],
          ["src/screens/Research.tsx", "change", "D", "Banner with the open plain-language miss."],
          ["product README", "change", "E", "Setup, model ids, where Token Factory is called, agreement count, what changed during the hackathon."],
        ]}
      />

      <H3>Who touches what</H3>
      <Table
        headers={["Area", "Phases", "Stays out of"]}
        rows={[
          ["Explain and audio", "B", "The timer logic and the grade prompts."],
          ["Grade client", "A and C", "The daily-plan sort."],
          ["Plan and storage", "A and D", "The microphone."],
          ["Submission", "E and F", "Feature work. No new screen in the last week."],
        ]}
      />

      <H2>How we know a phase is real</H2>
      <Table
        headers={["Check", "Lives with"]}
        rows={[
          ["Schema rejects a quote that is not in the transcript", "Phase A test"],
          ["Schema rejects a rubric line that was not sent in the prompt", "Phase A test"],
          ["Migration from schema 1 yields an empty miss list", "Phase A test"],
          ["Empty transcript does not call Ultra", "Phase C test"],
          ["An open miss sorts ahead of a due review", "Phase D test"],
          ["Resolving that miss removes it from the front of the plan", "Phase D test"],
          ["Five manual grades a teammate will sign", "Phase C, written down before Phase D"],
          ["Agreement count in the README", "Phase E, before the video is recorded"],
        ]}
      />

      <H2>The video, shot from the finished loop</H2>
      <Text>
        Under 3 minutes. Record the product. One topic, two sessions. The
        voiceover says Nebius Token Factory and NVIDIA Nemotron by name, says
        Nano only extracts and Ultra decides the miss, and says the recording
        and the miss log stayed on this machine. Do not show topic generation,
        a chat box, or a second feature.
      </Text>
      <Table
        headers={["Time", "On screen"]}
        rows={[
          ["0:00–0:20", "Home. One line: the drill used to trust a self-rating, so it never heard what you skipped."],
          ["0:20–0:45", "One real topic. The model answer and one gotcha are visible."],
          ["0:45–1:20", "A deliberately incomplete answer. The gotcha just shown is left unsaid."],
          ["1:20–2:00", "Debrief. Point at Nano, then Ultra. Read the quote and the rubric line."],
          ["2:00–2:30", "Reload. Home leads with that topic. The same miss is on screen before the timer."],
          ["2:30–3:00", "Where the data lives, and the agreement count from Phase E."],
        ]}
      />

      <Card>
        <CardHeader>After 30 October</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <Text size="small">
              The shipped loop stays. Later work, only if the grade is already
              trustworthy: Tavily when a scaffold is too thin, logged on
              Debrief, and moving topic generation off OpenAI and Anthropic.
              Neither is required to submit, and neither is part of the demo.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Text size="small" tone="tertiary">
        Pairs with the low-level design canvas and with docs/08-plan.md in
        this repo. Week checklist remains docs/05-build-plan.md.
      </Text>
    </Stack>
  );
}
