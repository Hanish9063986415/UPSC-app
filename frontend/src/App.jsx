import { Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import QuestionResultCard from "./components/QuestionResultCard";
import FinalSummaryCard from "./components/FinalSummaryCard";
import QuestionNavigator from "./components/QuestionNavigator";
import PaperAnalyticsPanel from "./components/PaperAnalyticsPanel";
import EvaluationWaitPanel from "./components/EvaluationWaitPanel";
import WorkspaceNextSteps from "./components/WorkspaceNextSteps";
import { useYantraUser } from "./hooks/useYantraUser";
import { calculateEvaluationPrice, formatInr, PRICE_PER_PAGE_INR } from "./lib/pdfPricing";
import {
  addInstamarkTransaction,
  getVisibleInstamarkTransactions,
  loadInstamarkTransactions,
} from "./lib/instamarkTransactions";
import { evaluationRunner } from "./lib/evaluationRunner";
import { checkApiHealth, formatFetchError, getYantraUserId } from "./lib/api";

function Dashboard() {
  const { userId } = useYantraUser();
  const [file, setFile] = useState(null);
  const [pdfMeta, setPdfMeta] = useState({
    pageCount: null,
    totalPrice: null,
    loading: false,
    error: ""
  });
  const [status, setStatus] = useState("Idle");
  const [apiOnline, setApiOnline] = useState(null);
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

  useEffect(() => {
    refreshInstamarkTransactions();
  }, [userId]);

  const visibleTransactions = useMemo(
    () => getVisibleInstamarkTransactions(instamarkTransactions),
    [instamarkTransactions]
  );

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
  const isComplete = Boolean(summary) || status === "Completed";
  const statusIsError = status.startsWith("Error:") || apiOnline === false;
  const isBackgroundEval = status.startsWith("Evaluating in background");
  const isEvaluating = busy && !isComplete && !statusIsError;
  const showEvaluationPanels = busy || questions.length > 0;
  const evaluationQuestionTotal =
    questions.length > 0 ? questions[questions.length - 1]?.total ?? questions.length : null;

  useEffect(() => {
    evaluationRunner.syncPendingEvaluations(refreshInstamarkTransactions);

    return evaluationRunner.subscribe((job) => {
      if (!job?.userInitiated) return;

      setQuestions(job.questions);
      setSummary(job.summary);
      setBusy(job.status === "running" || job.status === "background");

      if (job.status === "running") {
        setStatus("Evaluating…");
      } else if (job.status === "background") {
        setStatus(
          "Evaluating in background — you can leave this page. Results will appear when ready."
        );
      } else if (job.status === "completed") {
        setStatus(
          job.summary?.persisted === false
            ? job.summary?.persist_error
              ? `Results ready, but not saved to database: ${job.summary.persist_error}`
              : "Results ready, but not saved to database (check DATABASE_URL and Supabase tables)."
            : "Completed"
        );
        refreshInstamarkTransactions();
      } else if (job.status === "error") {
        setStatus(`Error: ${job.error || "Evaluation failed"}`);
        refreshInstamarkTransactions();
      }
    });
  }, []);

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
    if (busy) return;

    const exists = questions.some((q) => q.question_number === activeQuestionNumber);
    if (!exists) {
      const last = questions[questions.length - 1];
      setActiveQuestionNumber(last?.question_number ?? null);
    }
  }, [questions, activeQuestionNumber, busy]);

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

    setStatus("Evaluating…");
    setQuestions([]);
    setSummary(null);
    setActiveQuestionNumber(null);

    const transactionId = addInstamarkTransaction({
      fileName: file.name,
      pageCount: pdfMeta.pageCount,
      amount: pdfMeta.totalPrice,
      yantraUserId: getYantraUserId()
    });
    activeTransactionIdRef.current = transactionId;
    evaluationStartedAtRef.current = Date.now();
    refreshInstamarkTransactions();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_transaction_id", transactionId);
    formData.append("page_count", String(pdfMeta.pageCount));
    formData.append("amount_inr", String(pdfMeta.totalPrice));
    const yantraUserId = getYantraUserId();
    if (yantraUserId) {
      formData.append("yantra_user_id", yantraUserId);
    }

    setBusy(true);
    await evaluationRunner.start({
      formData,
      transactionId,
      fileName: file.name
    });

    activeTransactionIdRef.current = null;
    evaluationStartedAtRef.current = null;
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
              <h1 className="workspace-upload-title">AI Answer Evaluation</h1>
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
            {statusIsError && !showEvaluationPanels && status !== "Idle" && (
              <p className="workspace-upload-error" role="alert">
                {status}
              </p>
            )}
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

      {(isComplete || summary) && (
        <FinalSummaryCard
          summary={summary}
          questions={questions}
          sourceFileName={file?.name}
          canDownload={isComplete && questions.length > 0}
        />
      )}

      {isEvaluating && (
        <aside id="live-progress-panel" className="glass-card status-card live-progress-panel">
          <div className="status-card-head">
            <h2>Live progress</h2>
            <span
              className={`status-live-pill active${apiOnline === false ? " offline" : ""}`}
            >
              {apiOnline === false ? "Offline" : isBackgroundEval ? "Background" : "Running"}
            </span>
          </div>
          <EvaluationWaitPanel isBackground={isBackgroundEval} />
          {questions.length > 0 && evaluationQuestionTotal != null && (
            <p className="evaluation-progress-summary" aria-live="polite">
              {questions.length} of {evaluationQuestionTotal} question
              {evaluationQuestionTotal === 1 ? "" : "s"} evaluated
            </p>
          )}
        </aside>
      )}

      {questions.length > 0 && (
        <section className="glass-card results-card">
          <h2>Results ({questions.length})</h2>
          {questions.map((q, idx) => (
            <QuestionResultCard
              key={`${q.question_number}-${q.current ?? idx}`}
              item={q}
              isActive={q.question_number === activeQuestionNumber}
              onActivate={setActiveQuestionNumber}
            />
          ))}
        </section>
      )}

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
