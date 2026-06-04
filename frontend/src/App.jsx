import { Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import QuestionResultCard from "./components/QuestionResultCard";
import FinalSummaryCard from "./components/FinalSummaryCard";
import QuestionNavigator from "./components/QuestionNavigator";
import PaperAnalyticsPanel from "./components/PaperAnalyticsPanel";
import ProgressTimeline from "./components/ProgressTimeline";
import { getQuestionScores } from "./lib/evaluationMetrics";
import { computePaperStats } from "./lib/paperAnalytics";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function parseSseChunk(chunk) {
  const line = chunk.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return null;
  try {
    return JSON.parse(line.replace("data: ", ""));
  } catch {
    return null;
  }
}

function Dashboard() {
  const [file, setFile] = useState(null);
  const [pageLimit, setPageLimit] = useState(80);
  const [status, setStatus] = useState("Idle");
  const [progress, setProgress] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeQuestionNumber, setActiveQuestionNumber] = useState(null);
  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);
  const paperStats = useMemo(() => (questions.length ? computePaperStats(questions) : null), [questions]);
  const isComplete = status === "Completed";

  useEffect(() => {
    if (!questions.length) {
      setActiveQuestionNumber(null);
      return;
    }
    const exists = questions.some((q) => q.question_number === activeQuestionNumber);
    if (!exists) {
      const last = questions[questions.length - 1];
      setActiveQuestionNumber(last?.question_number ?? null);
    }
  }, [questions, activeQuestionNumber]);

  const handleSelectQuestion = (questionNumber) => {
    setActiveQuestionNumber(questionNumber);
    const el = document.getElementById(`question-${questionNumber}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEvaluate = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus("Processing...");
    setProgress([]);
    setQuestions([]);
    setSummary(null);
    setActiveQuestionNumber(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("page_limit", String(pageLimit));

    try {
      const response = await fetch(`${API_BASE_URL}/api/evaluate-stream`, {
        method: "POST",
        body: formData
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        chunks.forEach((chunk) => {
          const payload = parseSseChunk(chunk);
          if (!payload) return;
          const type = payload.type || "unknown";

          if (type === "progress") {
            setStatus(payload.message || "Processing...");
            setProgress((prev) => [...prev, payload.message || "Progress update"]);
          } else if (type === "question_complete") {
            setQuestions((prev) => [...prev, payload]);
            setActiveQuestionNumber(payload.question_number ?? null);
          } else if (type === "question_error") {
            setQuestions((prev) => [...prev, payload]);
            setActiveQuestionNumber(payload.question_number ?? null);
          } else if (type === "final_summary") {
            setSummary(payload);
            setStatus("Completed");
          } else if (type === "error") {
            setStatus(payload.message || "Error");
          }
        });
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const fileLabel = file?.name
    ? file.name.length > 42
      ? `${file.name.slice(0, 41)}…`
      : file.name
    : "No file selected";

  return (
    <div className="page dashboard-page">
      <section className="workspace-shell glass-card">
        <div className="workspace-shell-grid">
          <div className="workspace-intro">
            <p className="eyebrow">Instamark · Live evaluation</p>
            <h1>Answer evaluation workspace</h1>
            <p className="workspace-lead">
              Upload a PDF to get marks, parameter analysis, paper heatmaps, and model answers.
            </p>
            <div className="workspace-status-strip">
              <div className="workspace-status-item">
                <span className="workspace-status-label">Status</span>
                <span className={`workspace-status-value${isComplete ? " done" : ""}`}>{status}</span>
              </div>
              {paperStats && (
                <>
                  <div className="workspace-status-item">
                    <span className="workspace-status-label">Paper score</span>
                    <span className={`workspace-status-value band-${paperStats.band}`}>
                      {paperStats.percent}%
                    </span>
                  </div>
                  <div className="workspace-status-item">
                    <span className="workspace-status-label">Marks</span>
                    <span className="workspace-status-value">
                      {paperStats.totalAwarded}/{paperStats.totalPossible}
                    </span>
                  </div>
                </>
              )}
              {questions.length > 0 && (
                <div className="workspace-status-item">
                  <span className="workspace-status-label">Questions</span>
                  <span className="workspace-status-value">{questions.length}</span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleEvaluate} className="workspace-upload-panel">
            <h2 className="workspace-upload-title">Start evaluation</h2>
            <p className="muted workspace-upload-hint">PDF answer sheet · streaming results as each question completes</p>

            <div className="workspace-upload-fields">
              <div className="workspace-field workspace-field-file">
                <label htmlFor="pdf-upload">Upload PDF</label>
                <div className="file-input-shell">
                  <input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
                <span className="file-selected-name" title={file?.name || ""}>
                  {fileLabel}
                </span>
              </div>

              <div className="workspace-field workspace-field-limit">
                <label htmlFor="page-limit">Page limit</label>
                <input
                  id="page-limit"
                  type="number"
                  min="1"
                  max="100"
                  value={pageLimit}
                  onChange={(e) => setPageLimit(Number(e.target.value))}
                />
                <span className="field-help">1–100 pages</span>
              </div>
            </div>

            <button className="btn btn-primary workspace-submit" disabled={!canSubmit} type="submit">
              {busy ? "Evaluating…" : "Start evaluation"}
            </button>
          </form>
        </div>
      </section>

      {questions.length > 0 && (
        <QuestionNavigator
          questions={questions}
          activeQuestionNumber={activeQuestionNumber}
          onSelect={handleSelectQuestion}
        />
      )}

      {questions.length > 0 && (
        <PaperAnalyticsPanel questions={questions} onSelectQuestion={handleSelectQuestion} />
      )}

      <div className={`dashboard-main${questions.length === 0 ? " dashboard-main--idle" : ""}`}>
        <aside className="glass-card status-card">
          <div className="status-card-head">
            <h2>Live progress</h2>
            <span className={`status-live-pill${busy ? " active" : ""}`}>
              {busy ? "Running" : isComplete ? "Done" : "Ready"}
            </span>
          </div>
          <p className={`status-text ${isComplete ? "done" : ""}`}>{status}</p>
          <ProgressTimeline steps={progress} isComplete={isComplete} />
          {questions.length > 0 && (
            <div className="status-scoreboard">
              <strong>Scoreboard</strong>
              <ul className="scoreboard-list">
                {questions.map((q, idx) => {
                  const s = getQuestionScores(q);
                  return (
                    <li key={`sb-${s.questionNumber}-${idx}`}>
                      <button
                        type="button"
                        className={`scoreboard-link${
                          s.questionNumber === activeQuestionNumber ? " active" : ""
                        }`}
                        onClick={() => handleSelectQuestion(s.questionNumber)}
                      >
                        Q{s.questionNumber}:{" "}
                        {q.error ? "Error" : `${s.awarded}/${s.possible} (${s.percent}%)`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>

        <section className="glass-card results-card">
          <h2>Results ({questions.length})</h2>
          {questions.length === 0 && (
            <div className="results-empty">
              <strong>No results yet</strong>
              <p className="muted">
                Upload your answer PDF and start evaluation. Question-wise feedback will appear here
                in real time.
              </p>
            </div>
          )}
          {questions.map((q, idx) => (
            <QuestionResultCard
              key={`${q.question_number}-${q.current ?? idx}`}
              item={q}
              isActive={q.question_number === activeQuestionNumber}
              onActivate={setActiveQuestionNumber}
            />
          ))}
        </section>
      </div>

      <FinalSummaryCard summary={summary} questions={questions} />

    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </AppShell>
  );
}
