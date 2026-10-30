import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudySources from "./StudySources";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const result = {
  provider: "tavily", query: "public topic", idea: "Retrieval evaluation", cached: false,
  retrievedAt: "2026-10-30T12:00:00Z", requestId: "live-request",
  results: [{ title: "Evaluate retrieval", url: "https://docs.ragas.io/en/stable/", content: "Measure retrieved context separately." }],
};

describe("study sources interaction", () => {
  it("searches on demand, renders real links, and reopens results without another call", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetcher);
    render(<StudySources topicId="rag-production-design#turn1" rubricLine="Retrieval evaluation" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Find sources with Tavily" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Evaluate retrieval" })).toHaveAttribute("href", result.results[0]!.url));
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ topicId: "rag-production-design", rubricLine: "Retrieval evaluation" });
    fireEvent.click(screen.getByRole("button", { name: "Hide study sources" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show study sources" }));
    expect(screen.getByRole("link")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("clears old sources when the selected idea changes and aborts pending work on unmount", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<StudySources topicId="rag-production-design" rubricLine="Retrieval evaluation" />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("link");
    view.rerender(<StudySources topicId="rag-production-design" rubricLine="Access control" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find sources with Tavily" })).toBeInTheDocument();
    fetcher.mockImplementation(() => new Promise(() => {}));
    await act(async () => fireEvent.click(screen.getByRole("button")));
    const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
