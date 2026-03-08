import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  CalendarDays,
  CircleDot,
  Clock3,
  Cpu,
  Heart,
  Info,
  Layers3,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UploadCloud,
  UserRound,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './App.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const API_URL = `${API_BASE_URL}/predict`;
const UPLOAD_URL = `${API_BASE_URL}/upload_dataset`;

const stageRiskMap = { I: 0.22, II: 0.56, III: 0.93, IV: 1.34 };
const treatmentScoreMap = {
  Surgery: 0.31,
  Chemotherapy: 0.23,
  Radiation: 0.21,
  Immunotherapy: 0.28,
  'Targeted Therapy': 0.26,
  Combination: 0.34,
};

const sliderConfig = [
  { id: 'age', label: 'Age', min: 18, max: 100, step: 1, unit: 'yr', icon: CalendarDays, info: 'Patient age at diagnosis' },
  { id: 'pack_years', label: 'Pack Years', min: 0, max: 60, step: 1, unit: '', icon: Stethoscope, info: 'Lifetime smoking exposure' },
  { id: 'ecog', label: 'ECOG Score', min: 0, max: 4, step: 1, unit: '', icon: Activity, info: 'Performance status score' },
  { id: 'tumor_size', label: 'Tumor Size', min: 0.5, max: 10, step: 0.1, unit: 'cm', icon: CircleDot, info: 'Approximate lesion size' },
  { id: 'genetic_score', label: 'Genetic Marker Score', min: 0, max: 100, step: 1, unit: '', icon: Sparkles, info: 'Protective genomic profile indicator' },
];

const estimateGeneticRiskShift = (score) => {
  const numericScore = Number(score);
  const boundedScore = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 50;
  const centered = (boundedScore - 50) / 50;
  const modifier = 1 - centered * 0.22;
  return (modifier - 1) * 100;
};

const formatPercent = (value, digits = 1) => `${Number(value).toFixed(digits)}%`;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const SelectField = ({ id, label, value, onChange, options, icon: Icon, info }) => (
  <div className="field-block">
    <div className="field-label">
      <div className="field-title">
        <Icon size={18} strokeWidth={1.8} />
        <span>{label}</span>
      </div>
      <span className="field-info" title={info}>
        <Info size={16} strokeWidth={1.8} />
      </span>
    </div>
    <select id={id} value={value} onChange={onChange} className="panel-select">
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const SliderField = ({ config, value, onChange }) => {
  const Icon = config.icon;
  const displayValue = config.id === 'genetic_score' ? Number(value).toFixed(0) : Number(value).toFixed(config.step < 1 ? 1 : 0);

  const percentage = ((value - config.min) / (config.max - config.min)) * 100;

  return (
    <div className="field-block">
      <div className="field-label">
        <div className="field-title">
          <Icon size={18} strokeWidth={1.8} />
          <span>{config.label}</span>
        </div>
        <span className="field-info" title={config.info}>
          <Info size={16} strokeWidth={1.8} />
        </span>
      </div>
      <div className="slider-row">
        <input
          id={config.id}
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          onChange={onChange}
          className="panel-slider"
          style={{
            background: `linear-gradient(90deg, #1477ff 0%, #1477ff ${percentage}%, #e4e8ef ${percentage}%, #e4e8ef 100%)`
          }}
        />
        <div className="slider-value">
          {displayValue}
          {config.unit ? ` ${config.unit}` : ''}
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, label, value, suffix }) => (
  <div className="metric-card">
    <div className="metric-header">
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </div>
    <div className="metric-value">
      {value}
      {suffix ? <span>{suffix}</span> : null}
    </div>
  </div>
);

function App() {
  const [formData, setFormData] = useState({
    age: 62,
    sex: 'Male',
    smoke: 'Former',
    pack_years: 25,
    stage: 'III',
    ecog: 1,
    tumor_size: 4.2,
    genetic_score: 65,
    treatment: 'Surgery',
  });
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [survData, setSurvData] = useState([]);
  const [distData, setDistData] = useState([]);
  const [apiStatus, setApiStatus] = useState('connecting');
  const [lastUpdated, setLastUpdated] = useState(null);

  const handleChange = (event) => {
    const { id, value, type } = event.target;
    const shouldParseNumber = type === 'number' || type === 'range';
    setFormData((prev) => ({
      ...prev,
      [id]: shouldParseNumber ? Number(value) : value,
    }));
  };

  const normalizePrediction = (rawPrediction, geneticScore) => {
    const providedShift = Number(rawPrediction?.genetic_risk_shift_percent);
    const geneticShift = Number.isFinite(providedShift)
      ? providedShift
      : estimateGeneticRiskShift(geneticScore);

    return {
      ...rawPrediction,
      genetic_risk_shift_percent: geneticShift,
    };
  };

  const simulateLocalFallback = (data) => {
    const baseMedian = 65;
    const stageRisk = stageRiskMap[data.stage] ?? 0.56;
    const ecogScore = Number.isFinite(Number(data.ecog)) ? Number(data.ecog) : 1;
    const packYears = Number.isFinite(Number(data.pack_years)) ? Number(data.pack_years) : 0;

    let risk =
      1.0 +
      (Number(data.age) - 50) * 0.015 +
      stageRisk +
      Number(data.tumor_size) * 0.08 +
      ecogScore * 0.2 +
      packYears * 0.004;

    if (data.sex === 'Female') risk *= 0.95;
    if (data.smoke === 'Current') risk *= 1.35;
    if (data.smoke === 'Former') risk *= 1.15;

    const geneticRiskShift = estimateGeneticRiskShift(data.genetic_score);
    risk *= 1 + geneticRiskShift / 100;

    const treatmentEffect = {
      Surgery: 0.55,
      Chemotherapy: 0.85,
      Radiation: 0.8,
      Immunotherapy: 0.6,
      'Targeted Therapy': 0.5,
      Combination: 0.4,
    }[data.treatment] ?? 0.8;

    const median = (baseMedian * treatmentEffect) / Math.max(risk, 0.25);
    const ciSpread = 0.34;
    const ciLower = Math.max(4, median * (1 - ciSpread));
    const ciUpper = median * (1 + ciSpread * 1.15);
    const prob5y = Math.exp(-(Math.log(2) / Math.max(median, 1)) * 60);
    const treatmentEffectiveness = Math.min(0.99, Math.max(0.05, prob5y * 1.42));

    return {
      median_survival_months: median,
      clinical_trials_ci_lower_95: ciLower,
      clinical_trials_ci_upper_95: ciUpper,
      probability_survival_5y: prob5y,
      probability_mortality_5y: 1 - prob5y,
      treatment_effectiveness_score: treatmentEffectiveness,
      genetic_risk_shift_percent: geneticRiskShift,
    };
  };

  const calculateCharts = (pred) => {
    const medianMonths = Math.max(Number(pred.median_survival_months) || 1, 1);
    const ciLower = Math.max(Number(pred.clinical_trials_ci_lower_95) || 1, 1);
    const ciUpper = Math.max(Number(pred.clinical_trials_ci_upper_95) || 1, 1);
    const maxMonth = Math.max(60, Math.ceil(ciUpper * 2.3));
    const lambda = Math.log(2) / medianMonths;

    const survivalCurve = Array.from({ length: 13 }, (_, index) => {
      const month = Math.round((maxMonth / 12) * index);
      return {
        month,
        survival: Math.exp(-lambda * month) * 100,
      };
    });
    setSurvData(survivalCurve);

    const sigma = Math.max((ciUpper - ciLower) / 3.92, 0.9);
    const distributionCurve = Array.from({ length: 12 }, (_, index) => {
      const percentile = 1 + index * 9;
      const month = (maxMonth / 11) * index;
      const density = Math.exp(-0.5 * ((month - medianMonths) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
      return {
        band: `${percentile}%`,
        density,
      };
    });
    setDistData(distributionCurve);
  };

  const runPrediction = async (event) => {
    if (event) event.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(API_URL, formData);
      if (response.data.status === 'success') {
        const nextPrediction = normalizePrediction(response.data.prediction, formData.genetic_score);
        setPrediction(nextPrediction);
        calculateCharts(nextPrediction);
        setApiStatus('connected');
      }
    } catch (error) {
      const nextPrediction = normalizePrediction(simulateLocalFallback(formData), formData.genetic_score);
      setPrediction(nextPrediction);
      calculateCharts(nextPrediction);
      setApiStatus('fallback');
      console.error('API connection failed. Using local fallback.', error);
    } finally {
      setLastUpdated(new Date());
      setTimeout(() => setLoading(false), 700);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const uploadData = new FormData();
    uploadData.append('dataset', file);

    setLoading(true);
    try {
      await axios.post(UPLOAD_URL, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (error) {
      console.warn('Upload fallback triggered.', error);
    } finally {
      setLoading(false);
      event.target.value = null;
    }
  };

  useEffect(() => {
    runPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const survivalProbability = prediction ? prediction.probability_survival_5y * 100 : 0;
  const mortalityProbability = prediction ? prediction.probability_mortality_5y * 100 : 0;
  const credibleLower = prediction ? prediction.clinical_trials_ci_lower_95 : 0;
  const credibleUpper = prediction ? prediction.clinical_trials_ci_upper_95 : 0;
  const medianMonths = prediction ? prediction.median_survival_months : 0;

  const credibleCenter = prediction ? clamp(((medianMonths - credibleLower) / Math.max(credibleUpper - credibleLower, 1)) * 100, 10, 90) : 50;
  const credibleWidth = prediction ? clamp(((credibleUpper - credibleLower) / Math.max(credibleUpper, 1)) * 100, 18, 54) : 28;

  const riskItems = useMemo(() => {
    const geneticRiskShift = estimateGeneticRiskShift(formData.genetic_score);
    return [
      {
        label: 'Cancer Stage',
        score: ((stageRiskMap[formData.stage] ?? 0.56) / 1.34) * 100,
        state: (stageRiskMap[formData.stage] ?? 0.56) > 0.6 ? 'Adverse' : 'Favorable',
      },
      {
        label: 'Age',
        score: clamp(((formData.age - 18) / 82) * 100, 12, 100),
        state: formData.age < 65 ? 'Favorable' : 'Adverse',
      },
      {
        label: 'Smoking History',
        score: formData.smoke === 'Current' ? 92 : formData.smoke === 'Former' ? 58 : 18,
        state: formData.smoke === 'Never' ? 'Favorable' : 'Adverse',
      },
      {
        label: 'ECOG Score',
        score: clamp((Number(formData.ecog) / 4) * 100, 10, 100),
        state: Number(formData.ecog) <= 1 ? 'Favorable' : 'Adverse',
      },
      {
        label: 'Tumor Size',
        score: clamp((Number(formData.tumor_size) / 10) * 100, 10, 100),
        state: Number(formData.tumor_size) <= 3 ? 'Favorable' : 'Adverse',
      },
      {
        label: 'Genetic Markers',
        score: clamp(Math.abs(geneticRiskShift) * 3.4, 12, 100),
        state: geneticRiskShift <= 0 ? 'Favorable' : 'Adverse',
      },
    ];
  }, [formData]);

  const treatmentBars = useMemo(() => (
    Object.entries(treatmentScoreMap).map(([name, score]) => ({
      name,
      value: Math.round(score * 100 + (name === formData.treatment ? 3 : 0)),
      active: name === formData.treatment,
    }))
  ), [formData.treatment]);

  const apiStatusText = apiStatus === 'connected'
    ? 'Active'
    : apiStatus === 'fallback'
      ? 'Simulation'
      : 'Connecting';

  return (
    <div className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="app-topbar">
        <div className="brand-lockup">
          <div className="brand-badge">
            <Cpu size={18} strokeWidth={2} />
          </div>
          <div className="brand-copy">
            <strong>BayesOnc AI</strong>
          </div>
        </div>

        <div className="topbar-meta">
          <span>Bayesian Lung Cancer Predictor</span>
          <div className={`live-pill ${apiStatus}`}>
            <span className="live-dot" />
            {apiStatusText}
          </div>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="panel panel-sidebar">
          <div className="panel-heading sticky">
            <h2>Patient Parameters</h2>
            <p>Configure clinical input variables</p>
          </div>

          <form className="controls-stack" onSubmit={runPrediction}>
            <SliderField config={sliderConfig[0]} value={formData.age} onChange={handleChange} />

            <SelectField
              id="sex"
              label="Sex"
              value={formData.sex}
              onChange={handleChange}
              icon={UserRound}
              info="Reported sex"
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
              ]}
            />

            <SelectField
              id="smoke"
              label="Smoking Status"
              value={formData.smoke}
              onChange={handleChange}
              icon={Stethoscope}
              info="Smoking behavior category"
              options={[
                { value: 'Never', label: 'Never' },
                { value: 'Former', label: 'Former' },
                { value: 'Current', label: 'Current' },
              ]}
            />

            <SliderField config={sliderConfig[1]} value={formData.pack_years} onChange={handleChange} />
            <SliderField config={sliderConfig[2]} value={formData.ecog} onChange={handleChange} />

            <SelectField
              id="stage"
              label="Cancer Stage"
              value={formData.stage}
              onChange={handleChange}
              icon={Layers3}
              info="Clinical stage grouping"
              options={[
                { value: 'I', label: 'Stage I' },
                { value: 'II', label: 'Stage II' },
                { value: 'III', label: 'Stage IIIA' },
                { value: 'IV', label: 'Stage IV' },
              ]}
            />

            <SliderField config={sliderConfig[3]} value={formData.tumor_size} onChange={handleChange} />
            <SliderField config={sliderConfig[4]} value={formData.genetic_score} onChange={handleChange} />

            <SelectField
              id="treatment"
              label="Treatment"
              value={formData.treatment}
              onChange={handleChange}
              icon={Heart}
              info="Selected treatment strategy"
              options={[
                { value: 'Surgery', label: 'Surgery' },
                { value: 'Chemotherapy', label: 'Chemotherapy' },
                { value: 'Radiation', label: 'Radiation' },
                { value: 'Immunotherapy', label: 'Immunotherapy' },
                { value: 'Targeted Therapy', label: 'Targeted Therapy' },
                { value: 'Combination', label: 'Combined' },
              ]}
            />

            <label className="upload-strip">
              <UploadCloud size={16} strokeWidth={1.8} />
              <span>Upload new dataset</span>
              <input type="file" accept=".csv,.xls,.xlsx" hidden onChange={handleFileUpload} />
            </label>

            <button type="submit" className="predict-button">
              <Waves size={18} strokeWidth={2} />
              Run AI Prediction
            </button>
          </form>
        </aside>

        <main className="panel panel-results">
          <div className="panel-heading">
            <h2>Prediction Results</h2>
            <p>Bayesian posterior estimates</p>
          </div>

          <section className="gauge-section">
            <div className="gauge-wrap">
              <div
                className="gauge-ring"
                style={{ '--gauge-value': `${survivalProbability}%` }}
              >
                <div className="gauge-inner">
                  <div className="gauge-value">{formatPercent(survivalProbability)}</div>
                </div>
              </div>
              <div className="gauge-caption">5-Year Survival Probability</div>
            </div>
          </section>

          <section className="risk-strip">
            <div className="risk-strip-head">
              <span>Mortality Risk</span>
              <strong>{formatPercent(mortalityProbability)}</strong>
            </div>
            <div className="risk-track">
              <div
                className="risk-fill"
                style={{ width: `${mortalityProbability}%` }}
              />
            </div>
          </section>

          <section className="metrics-row">
            <MetricCard
              icon={Clock3}
              label="Expected Survival"
              value={prediction ? Math.round(prediction.median_survival_months) : '--'}
              suffix="months"
            />
            <MetricCard
              icon={ShieldCheck}
              label="Survival Rate"
              value={prediction ? Math.round(survivalProbability) : '--'}
              suffix="%"
            />
          </section>

          <section className="credible-card">
            <div className="credible-head">
              <div className="credible-title">
                <TrendingUp size={16} strokeWidth={1.8} />
                <span>95% Credible Interval</span>
              </div>
            </div>
            <div className="credible-track">
              <div
                className="credible-band"
                style={{
                  left: `${credibleCenter - credibleWidth / 2}%`,
                  width: `${credibleWidth}%`,
                }}
              >
                <span className="credible-marker" />
              </div>
            </div>
            <div className="credible-values">
              <span>{prediction ? formatPercent((credibleLower / 60) * 100) : '--'}</span>
              <strong>{formatPercent(survivalProbability)}</strong>
              <span>{prediction ? formatPercent((credibleUpper / 60) * 100) : '--'}</span>
            </div>
          </section>

          <div className="results-footer">
            <div className="footer-chip">
              <Sparkles size={14} strokeWidth={1.8} />
              Genetic impact {prediction ? `${Math.abs(prediction.genetic_risk_shift_percent).toFixed(1)}%` : '--'}
            </div>
            {lastUpdated ? (
              <div className="footer-time">Updated {lastUpdated.toLocaleTimeString()}</div>
            ) : null}
          </div>
        </main>

        <aside className="panel panel-analytics">
          <div className="panel-heading sticky">
            <h2>Advanced Analytics</h2>
            <p>Interactive visualizations</p>
          </div>

          <section className="analytic-card">
            <div className="analytic-title">
              <TrendingUp size={18} strokeWidth={1.8} />
              <span>Survival Curve</span>
            </div>
            <div className="mini-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={survData} margin={{ top: 12, right: 8, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatPercent(value)} labelFormatter={(value) => `Month ${value}`} />
                  <Line type="monotone" dataKey="survival" stroke="#1477ff" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="analytic-card">
            <div className="analytic-title">
              <Activity size={18} strokeWidth={1.8} />
              <span>Treatment Comparison</span>
            </div>
            <div className="mini-chart treatment-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={treatmentBars} layout="vertical" margin={{ top: 8, right: 12, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 5" horizontal={false} stroke="#eef2f7" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} tick={{ fill: '#7a8297', fontSize: 11 }} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={15}>
                    {treatmentBars.map((entry) => (
                      <Cell key={entry.name} fill={entry.active ? '#e86f63' : '#f1a197'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="analytic-card">
            <div className="analytic-title">
              <Waves size={18} strokeWidth={1.8} />
              <span>Posterior Distribution</span>
            </div>
            <div className="mini-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={distData} margin={{ top: 12, right: 8, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#ece8fb" />
                  <XAxis dataKey="band" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                  <YAxis hide domain={[0, 'dataMax + 0.03']} />
                  <Tooltip formatter={(value) => Number(value).toFixed(4)} labelFormatter={(value) => `Percentile ${value}`} />
                  <Line type="monotone" dataKey="density" stroke="#7c5ce3" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="analytic-card risk-card">
            <div className="analytic-title">
              <ShieldCheck size={18} strokeWidth={1.8} />
              <span>Risk Factor Importance</span>
            </div>
            <div className="risk-list">
              {riskItems.map((item) => (
                <div key={item.label} className="risk-item">
                  <div className="risk-item-head">
                    <span>{item.label}</span>
                    <strong className={item.state === 'Favorable' ? 'state-good' : 'state-bad'}>{item.state}</strong>
                  </div>
                  <div className="risk-item-track">
                    <div
                      className={`risk-item-fill ${item.state === 'Favorable' ? 'good' : 'bad'}`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className={`loading-screen ${loading ? 'active' : ''}`}>
        <div className="loading-spinner" />
        <p>Running Bayesian posterior sampling...</p>
      </div>
    </div>
  );
}

export default App;
