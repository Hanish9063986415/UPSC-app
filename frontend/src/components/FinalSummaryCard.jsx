export default function FinalSummaryCard({ summary }) {
  if (!summary) return null;

  const meta = summary.complete_package?.metadata || {};

  return (
    <section className="card summary-card">
      <h2>Final Summary</h2>
      <div className="summary-grid">
        <div>
          <strong>Questions</strong>
          <span>{summary.total_questions ?? meta.total_questions ?? 0}</span>
        </div>
        <div>
          <strong>Duration</strong>
          <span>{summary.total_duration ?? meta.total_duration_seconds ?? 0}s</span>
        </div>
        <div>
          <strong>Tokens</strong>
          <span>{summary.total_tokens ?? meta.total_tokens ?? 0}</span>
        </div>
        <div>
          <strong>Marks obtained</strong>
          <span>{meta.total_ai_magic_marks ?? meta.total_param_marks ?? 0}</span>
        </div>
        <div>
          <strong>Max marks</strong>
          <span>{meta.total_max_marks ?? 0}</span>
        </div>
      </div>
    </section>
  );
}
