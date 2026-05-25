import { Link, Route, Routes } from "react-router-dom";
import { useMemo, useState } from "react";
import QuestionResultCard from "./components/QuestionResultCard";
import FinalSummaryCard from "./components/FinalSummaryCard";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function Landing() {
  return (
    <div className="page">
      <header className="hero">
        <h1>UPSC Answer Evaluation System</h1>
        <p>AI-powered evaluation with live streaming results</p>
        <div className="row">
          <Link className="btn" to="/dashboard">Open Dashboard</Link>
          <a className="btn btn-secondary" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">API Docs</a>
        </div>
      </header>
    </div>
  );
}

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
  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  const handleEvaluate = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus("Processing...");
    setProgress([]);
    setQuestions([]);
    setSummary(null);

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
          } else if (type === "question_error") {
            setQuestions((prev) => [...prev, payload]);
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

  return (
    <div className="page dashboard-page">
      <header className="header">
        <p className="eyebrow">Live evaluation</p>
        <h1>UPSC Answer Evaluation Dashboard</h1>
        <p>Upload a PDF to get marks, parameter analysis, feedback, and model answers.</p>
      </header>

      <form onSubmit={handleEvaluate} className="card upload-card">
        <label>Upload PDF</label>
        <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <label>Page limit (1–100)</label>
        <input type="number" min="1" max="100" value={pageLimit} onChange={(e) => setPageLimit(Number(e.target.value))} />
        <button className="btn" disabled={!canSubmit} type="submit">
          {busy ? "Evaluating..." : "Start Evaluation"}
        </button>
      </form>

      <div className="grid">
        <section className="card status-card">
          <h2>Status</h2>
          <p className={`status-text ${status === "Completed" ? "done" : ""}`}>{status}</p>
          <ul className="progress-list">
            {progress.map((item, idx) => (
              <li key={`${item}-${idx}`}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="card results-card">
          <h2>Results ({questions.length})</h2>
          {questions.length === 0 && <p className="muted">Results will appear here as each question is evaluated.</p>}
          {questions.map((q, idx) => (
            <QuestionResultCard key={`${q.question_number}-${q.current ?? idx}`} item={q} />
          ))}
        </section>
      </div>

      <FinalSummaryCard summary={summary} />

      <div className="row">
        <Link className="btn btn-secondary" to="/">Back</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
