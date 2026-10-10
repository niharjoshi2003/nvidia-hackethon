import { useState } from "react";
import { useStore } from "@/hooks/useStore";
import { EXAMPLE_RUBRIC, parseRubricFile } from "@/lib/rubricImport";
import { Button, Card, PageTitle, SectionLabel } from "@/components/ui";

export default function SettingsScreen() {
  const { state, topics, updateSettings, importTopics, removeImportedTopic, reset } = useStore();
  const { settings } = state;

  const [rubric, setRubric] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState("");

  const runImport = () => {
    setImportError(null);
    setImported(null);
    const result = parseRubricFile(rubric, topics.map((t) => t.id));
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    importTopics(result.topics);
    setImported(
      `Added ${result.topics.length} topic${result.topics.length === 1 ? "" : "s"}. It is in your library now.`,
    );
    setRubric("");
  };

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      <Card className="mb-4">
        <SectionLabel>The drill</SectionLabel>
        <div className="space-y-4">
          <Field label="Answer time limit">
            <div className="flex gap-1.5">
              {([30, 45, 60, 90] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => updateSettings({ timerSeconds: n })}
                  className={
                    settings.timerSeconds === n
                      ? "rounded border border-amber-400 bg-amber-400 px-3 py-1 text-sm font-medium text-zinc-950"
                      : "rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-zinc-500"
                  }
                >
                  {n}s
                </button>
              ))}
            </div>
          </Field>
          <p className="text-xs text-zinc-500">
            Recording stops on its own after {settings.timerSeconds} seconds. Takes effect on the next answer.
          </p>
        </div>
      </Card>

      <Card className="mb-4">
        <SectionLabel>Your own Token Factory key</SectionLabel>
        <p className="mb-3 text-sm text-zinc-400">
          Optional. The hosted demo shares a small budget; once it is spent, a key of your own keeps
          grading working. It is kept in this browser, sent with each grade request, and never
          stored on the server.
        </p>
        <input
          type="password"
          value={settings.ownApiKey}
          onChange={(e) => updateSettings({ ownApiKey: e.target.value })}
          placeholder="Paste a Nebius Token Factory key"
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </Card>

      <Card className="mb-4">
        <SectionLabel>Replay mode</SectionLabel>
        <p className="mb-3 text-sm text-zinc-400">
          The coach session grades saved answers with saved responses instead of calling the API, so a
          demo still runs when the API is unreachable. Every replayed result is labelled as a replay.
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.replayMode}
            onChange={(e) => updateSettings({ replayMode: e.target.checked })}
            className="accent-amber-400"
          />
          Use saved responses in the coach session
        </label>
      </Card>

      <Card className="mb-4">
        <SectionLabel>Bring your own rubric</SectionLabel>
        <p className="mb-3 text-sm text-zinc-400">
          The evaluator grades a spoken answer against whatever rubric it is given. Paste one and it
          works the same way: a quote from what you said, a line from your rubric. Useful for any
          spoken skill with a checklist, not just interviews.
        </p>
        <textarea
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          rows={8}
          placeholder={EXAMPLE_RUBRIC}
          className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={runImport} disabled={!rubric.trim()}>
            Add to library
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRubric(EXAMPLE_RUBRIC)}>
            Fill in an example
          </Button>
        </div>
        {importError && <p className="mt-3 text-sm text-rose-300">{importError}</p>}
        {imported && <p className="mt-3 text-sm text-emerald-300">{imported}</p>}

        {state.importedTopics.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
            {state.importedTopics.map((topic) => (
              <li key={topic.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">{topic.title}</span>
                <Button size="sm" variant="ghost" onClick={() => removeImportedTopic(topic.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <SectionLabel>Where your data is</SectionLabel>
        <p className="text-sm text-zinc-400">
          Attempts, ratings, notes, and every miss are in this browser&rsquo;s local storage. There
          is no account and no copy on a server. Recordings are discarded when you leave the
          debrief.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Grading sends your transcript and the topic&rsquo;s rubric lines to NVIDIA Nemotron models
          on Nebius Token Factory, and nothing else. Speech recognition runs through your
          browser&rsquo;s own speech service rather than on your machine.
        </p>
      </Card>

      <Card className="border-rose-900/50">
        <SectionLabel>Erase everything</SectionLabel>
        <p className="mb-3 text-sm text-zinc-400">
          Removes every attempt, miss, note, and imported rubric from this browser. It cannot be
          undone. Type <span className="font-mono text-zinc-300">reset</span> to confirm.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={confirmReset}
            onChange={(e) => setConfirmReset(e.target.value)}
            className="w-32 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
          />
          <Button
            variant="danger"
            disabled={confirmReset !== "reset"}
            onClick={() => {
              reset();
              setConfirmReset("");
            }}
          >
            Erase
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-32 text-sm text-zinc-400">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
