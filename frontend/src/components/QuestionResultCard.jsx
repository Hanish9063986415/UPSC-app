function ParameterBlock({ param }) {
  const analysis = param?.student_analysis || {};
  const enhancement = param?.upsc_enhancement || {};

  return (
    <div className="param-block">
      <h4>
        {param?.parameter_name || "Parameter"}
        <span className="param-marks">
          {analysis.marks_allocation ?? 0} / {param?.max_marks_for_parameter ?? 0}
        </span>
      </h4>
      {analysis.what_student_wrote && (
        <p><strong>What you wrote:</strong> {analysis.what_student_wrote}</p>
      )}
      {Array.isArray(analysis.strengths_for_upsc) && analysis.strengths_for_upsc.length > 0 && (
        <div className="tag-list good">
          <strong>Strengths:</strong>
          <ul>{analysis.strengths_for_upsc.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {Array.isArray(analysis.missing_upsc_elements) && analysis.missing_upsc_elements.length > 0 && (
        <div className="tag-list warn">
          <strong>Missing elements:</strong>
          <ul>{analysis.missing_upsc_elements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {enhancement.ideal_upsc_content && (
        <p className="ideal-content"><strong>Ideal UPSC content:</strong> {enhancement.ideal_upsc_content}</p>
      )}
    </div>
  );
}

export default function QuestionResultCard({ item }) {
  if (item.error) {
    return (
      <article className="question error">
        <h3>Question {item.question_number}</h3>
        <p className="error-text">{item.error}</p>
      </article>
    );
  }

  const evaluation = item.evaluation || {};
  const overall = evaluation.overall_upsc_assessment || {};
  const analysis = evaluation.upsc_question_analysis || {};
  const parameters = evaluation.upsc_focused_parameters || [];
  const modelText =
    item.model_answer?.model_answer?.full_text ||
    item.model_answer?.full_text ||
    "";

  const awarded = overall.total_param_marks_awarded ?? 0;
  const possible = overall.total_param_marks_possible ?? item.marks ?? 0;
  const pct = possible > 0 ? Math.round((awarded / possible) * 100) : 0;

  return (
    <article className="question">
      <div className="question-head">
        <h3>Question {item.question_number}</h3>
        <div className="score-pill">
          {awarded} / {possible} <span>({pct}%)</span>
        </div>
      </div>

      <p className="question-text">{item.question}</p>

      {analysis.upsc_expectations?.length > 0 && (
        <section className="sub-card">
          <h4>UPSC expectations</h4>
          <ul>
            {analysis.upsc_expectations.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {evaluation.student_answer && (
        <section className="sub-card">
          <h4>Your answer (extracted)</h4>
          <p className="answer-text">{evaluation.student_answer}</p>
        </section>
      )}

      {parameters.length > 0 && (
        <section className="sub-card">
          <h4>Parameter-wise analysis</h4>
          {parameters.map((p, i) => (
            <ParameterBlock key={i} param={p} />
          ))}
        </section>
      )}

      {overall.final_upsc_advice && (
        <section className="sub-card advice">
          <h4>Final advice</h4>
          <p>{overall.final_upsc_advice}</p>
        </section>
      )}

      {Array.isArray(overall.keywords_for_success) && overall.keywords_for_success.length > 0 && (
        <section className="sub-card">
          <h4>Keywords for success</h4>
          <div className="chips">
            {overall.keywords_for_success.slice(0, 12).map((k, i) => (
              <span key={i} className="chip">{k}</span>
            ))}
          </div>
        </section>
      )}

      {modelText && (
        <section className="sub-card model">
          <h4>Model answer</h4>
          <pre className="model-text">{modelText}</pre>
        </section>
      )}
    </article>
  );
}
