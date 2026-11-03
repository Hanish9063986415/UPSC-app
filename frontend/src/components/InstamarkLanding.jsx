export default function InstamarkLanding({ onEvaluate, maintenance = false }) {
  return (
    <div className="instamark-landing">
      <div className="instamark-landing-glow" aria-hidden="true" />

      <section className="instamark-landing-hero">
        <p className="instamark-landing-eyebrow">YantraIAS · Instant AI Evaluation</p>
        <h1 className="instamark-landing-title">
          Master the UPSC Mains with Yantra’s Instant Mains Evaluation.
          <span className="instamark-landing-brand-accent">Instamark</span>
        </h1>
        <p className="instamark-landing-subtitle">
          Don’t wait long days for your mains answer evaluation. Just upload your answer paper we
          will evaluate in couple of minutes with detailed analysis. Our evaluation will bring your
          strengths and weakness along with the UPSC needed inputs based on your answer.
        </p>
        <button
          type="button"
          className="instamark-landing-cta"
          onClick={onEvaluate}
          disabled={maintenance}
        >
          <span className="instamark-landing-cta-label">
            {maintenance ? "Under maintenance" : "Evaluate Answer Now"}
          </span>
        </button>
      </section>

      <section className="instamark-landing-cards" aria-label="Evaluation instructions">
        <article className="instamark-landing-card instamark-landing-card--navy">
          <h2 className="instamark-landing-card-title">Important Instructions</h2>
          <ol className="instamark-landing-list">
            <li>
              <span className="instamark-landing-step">1</span>
              <div className="instamark-landing-step-copy">
                <strong>Question &amp; Marking</strong>
                <span>Write Q-number clearly. Mention marks or it defaults to 10.</span>
              </div>
            </li>
            <li>
              <span className="instamark-landing-step">2</span>
              <div className="instamark-landing-step-copy">
                <strong>Continuous Content</strong>
                <span>No blank pages allowed in the PDF.</span>
              </div>
            </li>
            <li>
              <span className="instamark-landing-step">3</span>
              <div className="instamark-landing-step-copy">
                <strong>Legibility</strong>
                <span>Minimal strikes/cancellations for better AI parsing.</span>
              </div>
            </li>
            <li>
              <span className="instamark-landing-step">4</span>
              <div className="instamark-landing-step-copy">
                <strong>Order</strong>
                <span>Ensure pages are in correct chronological order.</span>
              </div>
            </li>
          </ol>
        </article>
      </section>
    </div>
  );
}
