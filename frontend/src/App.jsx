import { Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import InstamarkLanding from "./components/InstamarkLanding";
import QuestionResultCard from "./components/QuestionResultCard";
import QuestionNavigator from "./components/QuestionNavigator";
import PaperAnalyticsPanel from "./components/PaperAnalyticsPanel";
import EvaluationWaitPanel from "./components/EvaluationWaitPanel";
import WorkspaceNextSteps from "./components/WorkspaceNextSteps";
import { useYantraUser } from "./hooks/useYantraUser";
import { useInstamarkWallet } from "./hooks/useInstamarkWallet";
import { calculateEvaluationPrice, formatInr, PRICE_PER_PAGE_INR } from "./lib/pdfPricing";
import {
  getVisibleInstamarkTransactions,
  loadInstamarkTransactions,
} from "./lib/instamarkTransactions";
import { evaluationRunner } from "./lib/evaluationRunner";
import { checkApiHealth, formatFetchError, getYantraUserId } from "./lib/api";
import { notifyWalletChanged } from "./lib/walletEvents";
import { buildInsufficientWalletMessage, YANTRA_WALLET_URL } from "./lib/walletMessages";

function Dashboard() {
  const { userId, isSignedIn } = useYantraUser();
  const { balanceInr, walletEnabled, refreshWallet } = useInstamarkWallet(userId);
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
  const [evaluationAttempted, setEvaluationAttempted] = useState(false);
  const [activeQuestionNumber, setActiveQuestionNumber] = useState(null);
  const [instamarkTransactions, setInstamarkTransactions] = useState(() =>
    loadInstamarkTransactions()
  );
  const activeTransactionIdRef = useRef(null);
  const evaluationStartedAtRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const canSubmit = useMemo(() => {
    if (
      !file ||
      pdfMeta.pageCount <= 0 ||
      pdfMeta.loading ||
      pdfMeta.error ||
      busy ||
      apiOnline === false
    ) {
      return false;
    }

    if (walletEnabled && !isSignedIn) {
      return false;
    }

    if (walletEnabled && pdfMeta.totalPrice != null && balanceInr != null) {
      return balanceInr >= pdfMeta.totalPrice;
    }

    return true;
  }, [file, pdfMeta, busy, apiOnline, walletEnabled, isSignedIn, balanceInr]);
  const isComplete = Boolean(summary) || status === "Completed";
  const statusIsError = status.startsWith("Error:") || apiOnline === false;
  const isBackgroundEval = status.startsWith("Evaluating in background");
  const isEvaluating = busy && !isComplete && !statusIsError;
  const showEvaluationPanels = busy || questions.length > 0;
  const evaluationQuestionTotal =
    questions.length > 0 ? questions[questions.length - 1]?.total ?? questions.length : null;
  const showEvalPanel = Boolean(file) || busy || questions.length > 0 || isComplete;

  useEffect(() => {
    if (!isEvaluating) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEvaluating]);

  useEffect(() => {
    evaluationRunner.syncPendingEvaluations(refreshInstamarkTransactions);

    return evaluationRunner.subscribe((job) => {
      if (!job?.userInitiated) return;

      setQuestions(job.questions);
      setSummary(job.summary);
      setBusy(job.status === "running" || job.status === "background");

      if (job.status === "running") {
        setStatus(job.walletDebited ? "Evaluating…" : "Verifying wallet balance…");
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
        refreshWallet();
        notifyWalletChanged();
      } else if (job.status === "error") {
        setStatus(job.insufficientWallet ? job.error || "Insufficient wallet balance." : `Error: ${job.error || "Evaluation failed"}`);
        if (!job.insufficientWallet) {
          refreshInstamarkTransactions();
        }
        refreshWallet();
        notifyWalletChanged();
      }

      if (job.walletBalance != null) {
        notifyWalletChanged();
      }
    });
  }, [refreshWallet]);

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

  const handleStartEvaluateClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
      return;
    }
    document.getElementById("pdf-upload")?.click();
  };

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setPdfMeta({ pageCount: null, totalPrice: null, loading: false, error: "" });
    setQuestions([]);
    setSummary(null);
    setActiveQuestionNumber(null);
    setStatus("Idle");
    setEvaluationAttempted(false);

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
      window.requestAnimationFrame(() => {
        document.getElementById("home-eval-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
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

  const insufficientWallet =
    walletEnabled &&
    isSignedIn &&
    pdfMeta.totalPrice != null &&
    balanceInr != null &&
    balanceInr < pdfMeta.totalPrice;

  const submitBlockedReason = useMemo(() => {
    if (walletEnabled && !isSignedIn) {
      return "Sign in with your YantraIAS account to use wallet credits.";
    }
    if (insufficientWallet) {
      return buildInsufficientWalletMessage({
        balance: balanceInr,
        required: pdfMeta.totalPrice,
      });
    }
    return "";
  }, [walletEnabled, isSignedIn, insufficientWallet, balanceInr, pdfMeta.totalPrice]);

  const showRechargeCallout =
    !evaluationAttempted &&
    !busy &&
    !isComplete &&
    !isEvaluating &&
    walletEnabled &&
    isSignedIn &&
    insufficientWallet &&
    pdfMeta.totalPrice != null;

  const showWalletPricingDetails =
    !evaluationAttempted && !busy && !isComplete && !isEvaluating;

  const handleEvaluate = async (event) => {
    event.preventDefault();
    if (!file) return;

    if (walletEnabled && !getYantraUserId()) {
      setStatus("Error: YantraIAS user id required for wallet billing.");
      return;
    }

    if (insufficientWallet) {
      setStatus(buildInsufficientWalletMessage({
        balance: balanceInr,
        required: pdfMeta.totalPrice,
      }));
      return;
    }

    const online = await checkApiHealth();
    setApiOnline(online);
    if (!online) {
      setStatus(formatFetchError(new TypeError("Failed to fetch")));
      return;
    }

    setStatus(walletEnabled ? "Verifying wallet balance…" : "Evaluating…");
    setQuestions([]);
    setSummary(null);
    setActiveQuestionNumber(null);
    setEvaluationAttempted(true);

    const transactionId = crypto.randomUUID();
    activeTransactionIdRef.current = transactionId;
    evaluationStartedAtRef.current = Date.now();

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
      fileName: file.name,
      pageCount: pdfMeta.pageCount,
      amount: pdfMeta.totalPrice,
      yantraUserId
    });

    refreshInstamarkTransactions();

    activeTransactionIdRef.current = null;
    evaluationStartedAtRef.current = null;
  };

  const fileLabel = file?.name
    ? file.name.length > 42
      ? `${file.name.slice(0, 41)}…`
      : file.name
    : "No file selected";

  return (
    <div className="page dashboard-page is-landing">
      <InstamarkLanding onEvaluate={handleStartEvaluateClick} />

      <input
        ref={fileInputRef}
        id="pdf-upload"
        type="file"
        accept=".pdf,application/pdf"
        className="home-file-input"
        onChange={handleFileChange}
      />

      {showEvalPanel && (
        <section id="home-eval-panel" className="workspace-shell glass-card home-eval-panel">
          <form onSubmit={handleEvaluate} className="workspace-upload-panel">
            <div className="workspace-upload-fields">
              <div className="workspace-field workspace-field-file">
                <div className={`file-upload-stack${file ? " has-file" : ""}`}>
                  <div className={`file-upload-zone${file ? " has-file" : ""}`}>
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
                      {showWalletPricingDetails && walletEnabled && isSignedIn && balanceInr != null && (
                        <>
                          <div className="pdf-pricing-row">
                            <span>Wallet balance</span>
                            <span>{formatInr(balanceInr)}</span>
                          </div>
                          <div
                            className={`pdf-pricing-row pdf-pricing-wallet-after${
                              insufficientWallet ? " is-insufficient" : ""
                            }`}
                          >
                            <span>After debit</span>
                            <strong>{formatInr(balanceInr - pdfMeta.totalPrice)}</strong>
                          </div>
                        </>
                      )}
                    </div>
                    {showRechargeCallout && (
                      <div className="wallet-recharge-callout" role="alert">
                        <p>{submitBlockedReason}</p>
                        <a
                          className="btn btn-secondary wallet-recharge-btn"
                          href={YANTRA_WALLET_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Recharge wallet on YantraIAS
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <button className="btn btn-primary workspace-submit" disabled={!canSubmit} type="submit">
              {busy
                ? "Evaluating…"
                : pdfMeta.loading
                  ? "Checking PDF…"
                  : canSubmit && pdfMeta.totalPrice != null
                    ? `Start evaluation · ${formatInr(pdfMeta.totalPrice)}`
                    : insufficientWallet
                      ? "Recharge wallet to continue"
                      : walletEnabled && !isSignedIn
                        ? "Sign in to evaluate"
                        : "Start evaluation"}
            </button>
            {submitBlockedReason &&
              !evaluationAttempted &&
              !busy &&
              !isComplete &&
              file &&
              pdfMeta.pageCount > 0 &&
              !showRechargeCallout && (
              <p className="workspace-upload-error workspace-wallet-note" role="alert">
                {submitBlockedReason}
              </p>
            )}
            {statusIsError && !showEvaluationPanels && status !== "Idle" && !status.startsWith("Insufficient wallet") && (
              <p className="workspace-upload-error" role="alert">
                {status}
              </p>
            )}
            {status.startsWith("Insufficient wallet") &&
              !evaluationAttempted &&
              !busy &&
              !isEvaluating &&
              !isComplete && (
              <div className="wallet-recharge-callout wallet-recharge-callout--inline" role="alert">
                <p>{status}</p>
                <a
                  className="btn btn-secondary wallet-recharge-btn"
                  href={YANTRA_WALLET_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Recharge wallet on YantraIAS
                </a>
              </div>
            )}
          </form>
        </section>
      )}

      {questions.length > 0 && (
        <QuestionNavigator
          questions={questions}
          activeQuestionNumber={activeQuestionNumber}
          onSelect={handleSelectQuestion}
        />
      )}

      {questions.length > 0 && (
        <PaperAnalyticsPanel
          questions={questions}
          summary={summary}
          sourceFileName={file?.name}
          canDownload={isComplete && questions.length > 0}
          onSelectQuestion={handleSelectQuestion}
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
