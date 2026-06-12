import { Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import QuestionResultCard from "./components/QuestionResultCard";
import FinalSummaryCard from "./components/FinalSummaryCard";
import QuestionNavigator from "./components/QuestionNavigator";
import PaperAnalyticsPanel from "./components/PaperAnalyticsPanel";
import ProgressTimeline from "./components/ProgressTimeline";
import EvaluationWaitPanel from "./components/EvaluationWaitPanel";
import WorkspaceNextSteps from "./components/WorkspaceNextSteps";
import { getQuestionScores } from "./lib/evaluationMetrics";
import { calculateEvaluationPrice, formatInr, PRICE_PER_PAGE_INR } from "./lib/pdfPricing";
import {
  addInstamarkTransaction,
  extractEvaluationSummary,
  getVisibleInstamarkTransactions,
  loadInstamarkTransactions,
  removeInstamarkTransaction,
  updateInstamarkTransaction
} from "./lib/instamarkTransactions";
import { saveTransactionPdf } from "./lib/instamarkTransactionAssets";
import { API_BASE_URL, checkApiHealth, formatFetchError, getYantraAuthHeaders } from "./lib/api";

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
  const [pdfMeta, setPdfMeta] = useState({
    pageCount: null,
    totalPrice: null,
    loading: false,
    error: ""
  });
  const [status, setStatus] = useState("Idle");
  const [apiOnline, setApiOnline] = useState(null);
  const [progress, setProgress] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeQuestionNumber, setActiveQuestionNumber] = useState(null);
  const [instamarkTransactions, setInstamarkTransactions] = useState(() =>
    loadInstamarkTransactions()
  );
  const activeTransactionIdRef = useRef(null);
  const evaluationStartedAtRef = useRef(null);

  const refreshInstamarkTransactions = () => {
    setInstamarkTransactions(loadInstamarkTransactions());
  };

  const visibleTransactions = useMemo(
    () => getVisibleInstamarkTransactions(instamarkTransactions),
    [instamarkTransactions]
  );

  const discardFailedTransaction = () => {
    const id = activeTransactionIdRef.current;
    if (id) removeInstamarkTransaction(id);
    refreshInstamarkTransactions();
  };
  const canSubmit = useMemo(
    () =>
      !!file &&
      pdfMeta.pageCount > 0 &&
      !pdfMeta.loading &&
      !pdfMeta.error &&
      !busy &&
      apiOnline !== false,
    [file, pdfMeta, busy, apiOnline]
  );
  const isComplete = status === "Completed";
  const statusIsError = status.startsWith("Error:") || apiOnline === false;

  useEffect(() => {
    let cancelled = false;

    const verifyApi = async () => {
      const online = await checkApiHealth();
      if (cancelled) return;
      setApiOnline(online);
      if (!online && !busy && status === "Idle") {
        setStatus(formatFetchError(new TypeError("Failed to fetch")));
      } else if (online && status.startsWith("Cannot reach")) {
        setStatus("Idle");
      }
    };

    verifyApi();
    const intervalId = window.setInterval(verifyApi, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [busy, status]);

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

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setPdfMeta({ pageCount: null, totalPrice: null, loading: false, error: "" });

    if (!selected) return;

    setPdfMeta((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const { getPdfPageCount: readPageCount } = await import("./lib/pdfPageCount");
      const pageCount = await readPageCount(selected);
      setPdfMeta({
        pageCount,
        totalPrice: calculateEvaluationPrice(pageCount),
        loading: false,
        error: ""
      });
    } catch (error) {
      setPdfMeta({
        pageCount: null,
        totalPrice: null,
        loading: false,
        error: error?.message || "Could not read this PDF."
      });
    }
  };

  const handleSelectQuestion = (questionNumber) => {
    setActiveQuestionNumber(questionNumber);
    const el = document.getElementById(`question-${questionNumber}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEvaluate = async (event) => {
    event.preventDefault();
    if (!file) return;

    const online = await checkApiHealth();
    setApiOnline(online);
    if (!online) {
      setStatus(formatFetchError(new TypeError("Failed to fetch")));
      return;
    }

    setBusy(true);
    setStatus("Evaluating…");
    setProgress([]);
    setQuestions([]);
    setSummary(null);
    setActiveQuestionNumber(null);

    const transactionId = addInstamarkTransaction({
      fileName: file.name,
      pageCount: pdfMeta.pageCount,
      amount: pdfMeta.totalPrice
    });
    activeTransactionIdRef.current = transactionId;
    evaluationStartedAtRef.current = Date.now();
    refreshInstamarkTransactions();

    saveTransactionPdf(transactionId, file)
      .then(() => {
        updateInstamarkTransaction(transactionId, { hasPdfCopy: true });
        refreshInstamarkTransactions();
      })
      .catch(() => {
        updateInstamarkTransaction(transactionId, { hasPdfCopy: false });
        refreshInstamarkTransactions();
      });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_transaction_id", transactionId);
    formData.append("page_count", String(pdfMeta.pageCount));
    formData.append("amount_inr", String(pdfMeta.totalPrice));

    let evaluationSucceeded = false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/evaluate-stream`, {
        method: "POST",
        headers: getYantraAuthHeaders(),
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
            const message = payload.message || "Processing...";
            setProgress((prev) => {
              if (prev[prev.length - 1] === message) return prev;
              return [...prev, message];
            });
          } else if (type === "question_complete") {
            setQuestions((prev) => [...prev, payload]);
            setActiveQuestionNumber(payload.question_number ?? null);
          } else if (type === "question_error") {
            setQuestions((prev) => [...prev, payload]);
            setActiveQuestionNumber(payload.question_number ?? null);
          } else if (type === "final_summary") {
            setSummary(payload);
            setStatus("Completed");
            evaluationSucceeded = true;
            const evalSummary = extractEvaluationSummary(payload);
            const clientDuration =
              evaluationStartedAtRef.current != null
                ? Math.round((Date.now() - evaluationStartedAtRef.current) / 1000)
                : null;
            updateInstamarkTransaction(activeTransactionIdRef.current, {
              status: "completed",
              completedAt: new Date().toISOString(),
              serverEvaluationId: payload.evaluation_id || null,
              persistedToDatabase: payload.persisted === true,
              ...evalSummary,
              durationSeconds: evalSummary.durationSeconds ?? clientDuration
            });
            refreshInstamarkTransactions();
          } else if (type === "error") {
            setStatus(payload.message || "Error");
            discardFailedTransaction();
          }
        });
      }
    } catch (error) {
      setStatus(`Error: ${formatFetchError(error)}`);
      discardFailedTransaction();
    } finally {
      if (!evaluationSucceeded && activeTransactionIdRef.current) {
        const current = loadInstamarkTransactions().find(
          (tx) => tx.id === activeTransactionIdRef.current
        );
        if (current?.status === "processing") {
          discardFailedTransaction();
        }
      }
      activeTransactionIdRef.current = null;
      evaluationStartedAtRef.current = null;
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
          <form onSubmit={handleEvaluate} className="workspace-upload-panel">
            <div className="workspace-upload-intro">
              <p className="eyebrow">Instamark · Live evaluation</p>
              <h1 className="workspace-upload-title">Answer evaluation workspace</h1>
              <p className="muted workspace-upload-hint">Upload your PDF answer sheet to begin</p>
            </div>

            <div className="workspace-upload-fields">
              <div className="workspace-field workspace-field-file">
                <div className={`file-upload-stack${file ? " has-file" : ""}`}>
                  <div className={`file-upload-zone${file ? " has-file" : ""}`}>
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="file-upload-input"
                      onChange={handleFileChange}
                    />
                    <label htmlFor="pdf-upload" className="file-upload-trigger">
                      <span className="file-upload-copy">
                        <strong>{file ? "Change PDF file" : "Choose PDF file"}</strong>
                        <span className="file-upload-hint">
                          Click to browse your handwritten answer sheet
                        </span>
                        <span className="file-upload-meta">PDF only</span>
                      </span>
                    </label>
                  </div>
                  <span
                    className={`file-selected-name${file ? " is-selected" : ""}`}
                    title={file?.name || ""}
                  >
                    {fileLabel}
                  </span>
                </div>
              </div>
            </div>

            {file && (
              <div
                className={`pdf-pricing-card${pdfMeta.loading ? " is-loading" : ""}${
                  pdfMeta.error ? " has-error" : ""
                }${pdfMeta.pageCount ? " is-ready" : ""}`}
              >
                {pdfMeta.loading && (
                  <>
                    <span className="pdf-pricing-label">Checking PDF</span>
                    <p className="pdf-pricing-message">Reading total pages…</p>
                  </>
                )}

                {!pdfMeta.loading && pdfMeta.error && (
                  <>
                    <span className="pdf-pricing-label">PDF check failed</span>
                    <p className="pdf-pricing-error">{pdfMeta.error}</p>
                  </>
                )}

                {!pdfMeta.loading && !pdfMeta.error && pdfMeta.pageCount > 0 && (
                  <>
                    <div className="pdf-pricing-head">
                      <span className="pdf-pricing-label">Evaluation cost</span>
                      <span className="pdf-pricing-pages">
                        {pdfMeta.pageCount} page{pdfMeta.pageCount === 1 ? "" : "s"} detected
                      </span>
                    </div>
                    <div className="pdf-pricing-rows">
                      <div className="pdf-pricing-row">
                        <span>Rate</span>
                        <span>{formatInr(PRICE_PER_PAGE_INR)} per page</span>
                      </div>
                      <div className="pdf-pricing-row pdf-pricing-total">
                        <span>Total amount</span>
                        <strong>{formatInr(pdfMeta.totalPrice)}</strong>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <button className="btn btn-primary workspace-submit" disabled={!canSubmit} type="submit">
              {busy
                ? "Evaluating…"
                : pdfMeta.loading
                  ? "Checking PDF…"
                  : canSubmit
                    ? `Start evaluation · ${formatInr(pdfMeta.totalPrice)}`
                    : "Start evaluation"}
            </button>
          </form>
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
            <span className={`status-live-pill${busy ? " active" : ""}${apiOnline === false ? " offline" : ""}`}>
              {busy ? "Running" : isComplete ? "Done" : apiOnline === false ? "Offline" : "Ready"}
            </span>
          </div>
          {busy && !isComplete && !statusIsError ? (
            <EvaluationWaitPanel />
          ) : (
            <p className={`status-text${isComplete ? " done" : ""}${statusIsError ? " error" : ""}`}>
              {status}
            </p>
          )}
          {!busy && progress.length > 0 && (
            <ProgressTimeline steps={progress} isComplete={isComplete} />
          )}
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

      <FinalSummaryCard
        summary={summary}
        questions={questions}
        sourceFileName={file?.name}
        canDownload={isComplete && questions.length > 0}
      />

      <WorkspaceNextSteps transactions={visibleTransactions} />

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
