import { useEffect, useMemo, useRef, useState } from 'react';
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
const PATIENTS_URL = `${API_BASE_URL}/patients`;
const PATIENT_PROFILE_URL = `${API_BASE_URL}/patient_profile`;
const FOLLOWUP_PATIENTS_URL = `${API_BASE_URL}/followup_patients`;
const FOLLOWUP_VISITS_URL = `${API_BASE_URL}/followup_visits`;

const AUTH_USERS = [
  { username: 'doctor', password: 'doctor123', role: 'Doctor' },
  { username: 'analyst', password: 'analyst123', role: 'Research Analyst' },
];

const AUTH_STORAGE_KEY = 'bayeslca_auth_session';
const AUTH_ACCOUNTS_KEY = 'bayeslca_auth_accounts';

const stageRiskMap = { I: 0.22, II: 0.56, III: 0.93, IV: 1.34 };
const treatmentScoreMap = {
  Surgery: 0.31,
  Chemotherapy: 0.23,
  Radiation: 0.21,
  Immunotherapy: 0.28,
  'Targeted Therapy': 0.26,
  Combination: 0.34,
};

const simulatorTreatments = ['Chemotherapy', 'Radiation', 'Surgery', 'Immunotherapy'];
const responsePalette = {
  Improved: '#27b463',
  Stable: '#f39c12',
  Progressive: '#e74c3c',
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
const unwrapValue = (value) => (Array.isArray(value) ? value[0] : value);
const asNumber = (value, fallback = 0) => {
  const numeric = Number(unwrapValue(value));
  return Number.isFinite(numeric) ? numeric : fallback;
};
const normalizeUsername = (value) => String(value || '').trim().toLowerCase();

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
  const authSceneRef = useRef(null);
  const [auth, setAuth] = useState({
    isLoggedIn: false,
    username: '',
    role: '',
  });
  const [authMode, setAuthMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '', role: 'Doctor' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', confirmPassword: '', role: 'Doctor' });
  const [customAccounts, setCustomAccounts] = useState([]);
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

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
  const [activeView, setActiveView] = useState('overview');
  const [allPatientIds, setAllPatientIds] = useState([]);
  const [patientLookupId, setPatientLookupId] = useState('');
  const [patientLookupMessage, setPatientLookupMessage] = useState('');
  const [loadedPatientProfile, setLoadedPatientProfile] = useState(null);
  const [followupPatientIds, setFollowupPatientIds] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [followupVisits, setFollowupVisits] = useState([]);
  const [treatmentSimulation, setTreatmentSimulation] = useState([]);

  const canAccessDoctorFeatures = auth.role === 'Doctor';
  const canAccessAnalystFeatures = auth.role === 'Research Analyst';
  const allAuthUsers = useMemo(() => [...AUTH_USERS, ...customAccounts], [customAccounts]);

  const handleChange = (event) => {
    const { id, value, type } = event.target;
    const shouldParseNumber = type === 'number' || type === 'range';
    setFormData((prev) => ({
      ...prev,
      [id]: shouldParseNumber ? Number(value) : value,
    }));
  };

  const handleLoginChange = (event) => {
    const { id, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleRegisterChange = (event) => {
    const { id, value } = event.target;
    const fieldMap = {
      register_username: 'username',
      register_password: 'password',
      confirmPassword: 'confirmPassword',
      register_role: 'role',
    };

    const targetField = fieldMap[id] || id;
    setRegisterForm((prev) => ({ ...prev, [targetField]: value }));
  };

  const beginAuthTransition = () => {
    const scene = authSceneRef.current;
    if (!scene) return;
    scene.classList.add('is-auth-submitting');
  };

  const endAuthTransition = () => {
    const scene = authSceneRef.current;
    if (!scene) return;
    scene.classList.remove('is-auth-submitting');
  };

  const handleLogin = (event) => {
    event.preventDefault();
    setAuthBusy(true);
    beginAuthTransition();

    const username = normalizeUsername(loginForm.username);
    const password = String(loginForm.password || '');
    const role = String(loginForm.role || 'Doctor');

    const matched = allAuthUsers.find((user) => {
      return user.username === username && user.password === password && user.role === role;
    });

    if (!matched) {
      setLoginError('Invalid username, password, or role.');
      setAuthBusy(false);
      endAuthTransition();
      return;
    }

    const nextAuth = {
      isLoggedIn: true,
      username: matched.username,
      role: matched.role,
    };

    setAuth(nextAuth);
    setLoginError('');
    setLoginForm({ username: matched.username, password: '', role: matched.role });
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
    setTimeout(() => {
      setAuthBusy(false);
      endAuthTransition();
    }, 420);
  };

  const handleCreateAccount = (event) => {
    event.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');

    const username = normalizeUsername(registerForm.username);
    const password = String(registerForm.password || '');
    const confirmPassword = String(registerForm.confirmPassword || '');
    const role = String(registerForm.role || 'Doctor');

    if (!username || username.length < 3) {
      setRegisterError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      setRegisterError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setRegisterError('Password and confirm password must match.');
      return;
    }

    if (allAuthUsers.some((user) => user.username === username)) {
      setRegisterError('Username already exists. Choose another username.');
      return;
    }

    setAuthBusy(true);
    beginAuthTransition();

    const createdAccount = {
      username,
      password,
      role,
      createdAt: new Date().toISOString(),
    };

    const nextAccounts = [...customAccounts, createdAccount];
    setCustomAccounts(nextAccounts);
    localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(nextAccounts));

    const nextAuth = {
      isLoggedIn: true,
      username,
      role,
    };

    setAuth(nextAuth);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
    setRegisterForm({ username: '', password: '', confirmPassword: '', role: 'Doctor' });
    setRegisterSuccess('Account created and signed in successfully.');

    setTimeout(() => {
      setAuthBusy(false);
      endAuthTransition();
    }, 480);
  };

  const handleLogout = () => {
    setAuth({ isLoggedIn: false, username: '', role: '' });
    setLoginForm({ username: '', password: '', role: 'Doctor' });
    setLoginError('');
    setRegisterError('');
    setRegisterSuccess('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const downloadBlob = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsvReport = () => {
    if (!prediction) return;

    const rows = [
      ['Username', auth.username],
      ['Role', auth.role],
      ['Age', formData.age],
      ['Sex', formData.sex],
      ['Smoking Status', formData.smoke],
      ['Pack Years', formData.pack_years],
      ['ECOG', formData.ecog],
      ['Cancer Stage', formData.stage],
      ['Tumor Size', formData.tumor_size],
      ['Treatment', formData.treatment],
      ['Genetic Marker Score', formData.genetic_score],
      ['Median Survival Months', Number(prediction.median_survival_months || 0).toFixed(2)],
      ['Lower 95 CI', Number(prediction.clinical_trials_ci_lower_95 || 0).toFixed(2)],
      ['Upper 95 CI', Number(prediction.clinical_trials_ci_upper_95 || 0).toFixed(2)],
      ['Survival Probability 5Y', Number((prediction.probability_survival_5y || 0) * 100).toFixed(2)],
      ['Mortality Probability 5Y', Number((prediction.probability_mortality_5y || 0) * 100).toFixed(2)],
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    downloadBlob(csv, `BayesLCA_Analyst_Report_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  };

  const exportDoctorSummary = () => {
    if (!prediction) return;

    const report = [
      'BayesLCA Clinical Report',
      `Date: ${new Date().toLocaleString()}`,
      `Welcome Dr. ${auth.username}`,
      '',
      'Patient Inputs',
      `Age: ${formData.age}`,
      `Sex: ${formData.sex}`,
      `Smoking Status: ${formData.smoke}`,
      `Pack Years: ${formData.pack_years}`,
      `ECOG: ${formData.ecog}`,
      `Stage: ${formData.stage}`,
      `Tumor Size: ${formData.tumor_size} cm`,
      `Treatment: ${formData.treatment}`,
      `Genetic Marker Score: ${formData.genetic_score}`,
      '',
      'Prediction Summary',
      `Median Survival: ${Number(prediction.median_survival_months || 0).toFixed(1)} months`,
      `95% Credible Interval: ${Number(prediction.clinical_trials_ci_lower_95 || 0).toFixed(1)} - ${Number(prediction.clinical_trials_ci_upper_95 || 0).toFixed(1)} months`,
      `5-Year Survival Probability: ${formatPercent((prediction.probability_survival_5y || 0) * 100)}`,
    ].join('\n');

    downloadBlob(report, `BayesLCA_Doctor_Report_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain;charset=utf-8;');
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

  const parseApiPrediction = (rawPrediction, geneticScore) => {
    const base = {
      median_survival_months: asNumber(rawPrediction?.median_survival_months, 0),
      clinical_trials_ci_lower_95: asNumber(rawPrediction?.clinical_trials_ci_lower_95, 0),
      clinical_trials_ci_upper_95: asNumber(rawPrediction?.clinical_trials_ci_upper_95, 0),
      probability_survival_5y: asNumber(rawPrediction?.probability_survival_5y, 0),
      probability_mortality_5y: asNumber(rawPrediction?.probability_mortality_5y, 1),
      treatment_effectiveness_score: asNumber(rawPrediction?.treatment_effectiveness_score, 0),
      genetic_risk_modifier: asNumber(rawPrediction?.genetic_risk_modifier, 1),
      genetic_risk_shift_percent: asNumber(rawPrediction?.genetic_risk_shift_percent, estimateGeneticRiskShift(geneticScore)),
    };

    return normalizePrediction(base, geneticScore);
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

  const buildTreatmentSimulationFromFallback = (baseData) => {
    const rows = simulatorTreatments.map((treatment) => {
      const pred = simulateLocalFallback({ ...baseData, treatment });
      return {
        treatment,
        survival: pred.probability_survival_5y * 100,
        lower: clamp((pred.probability_survival_5y * 100) - 8, 0, 100),
        upper: clamp((pred.probability_survival_5y * 100) + 8, 0, 100),
      };
    });

    const best = Math.max(...rows.map((row) => row.survival));
    return rows.map((row) => ({ ...row, best: row.survival === best }));
  };

  const buildTreatmentSimulationFromApi = async (baseData) => {
    const responses = await Promise.all(
      simulatorTreatments.map(async (treatment) => {
        const response = await axios.post(API_URL, { ...baseData, treatment });
        const pred = parseApiPrediction(response?.data?.prediction ?? {}, baseData.genetic_score);
        const center = (pred.probability_survival_5y || 0) * 100;

        return {
          treatment,
          survival: center,
          lower: clamp(center - 7, 0, 100),
          upper: clamp(center + 7, 0, 100),
        };
      })
    );

    const best = Math.max(...responses.map((row) => row.survival));
    return responses.map((row) => ({ ...row, best: row.survival === best }));
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

  const runPrediction = async (event, payload = formData) => {
    if (event) event.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(API_URL, payload);
      const status = String(unwrapValue(response?.data?.status) || '').toLowerCase();

      if (status === 'success') {
        const nextPrediction = parseApiPrediction(response.data.prediction, payload.genetic_score);
        setPrediction(nextPrediction);
        calculateCharts(nextPrediction);
        const simRows = await buildTreatmentSimulationFromApi(payload);
        setTreatmentSimulation(simRows);
        setApiStatus('connected');
      } else {
        throw new Error('Predict endpoint returned non-success status');
      }
    } catch (error) {
      const nextPrediction = normalizePrediction(simulateLocalFallback(payload), payload.genetic_score);
      setPrediction(nextPrediction);
      calculateCharts(nextPrediction);
      setTreatmentSimulation(buildTreatmentSimulationFromFallback(payload));
      setApiStatus('fallback');
      console.error('API connection failed. Using local fallback.', error);
    } finally {
      setLastUpdated(new Date());
      setTimeout(() => setLoading(false), 700);
    }
  };

  const loadPatientById = async () => {
    const candidateId = String(patientLookupId || '').trim();
    if (!candidateId) {
      setPatientLookupMessage('Enter a valid patient ID.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(PATIENT_PROFILE_URL, {
        params: { patient_id: candidateId },
      });

      const profileRaw = response?.data?.patient_profile;
      const profile = profileRaw
        ? {
            patient_id: String(unwrapValue(profileRaw.patient_id) || candidateId),
            age: asNumber(profileRaw.age, 62),
            sex: String(unwrapValue(profileRaw.sex) || 'Male'),
            smoke: String(unwrapValue(profileRaw.smoke) || 'Never'),
            pack_years: asNumber(profileRaw.pack_years, 0),
            ecog: asNumber(profileRaw.ecog, 1),
            stage: String(unwrapValue(profileRaw.stage) || 'II'),
            tumor_size: asNumber(profileRaw.tumor_size, 3),
            genetic_score: asNumber(profileRaw.genetic_score, 50),
            treatment_response_category: String(unwrapValue(profileRaw.treatment_response_category) || 'N/A'),
          }
        : null;

      if (!profile) {
        setPatientLookupMessage('Patient ID was not found.');
        return;
      }

      const nextFormData = {
        age: Number(profile.age) || 62,
        sex: profile.sex === 'Female' ? 'Female' : 'Male',
        smoke: ['Never', 'Former', 'Current'].includes(profile.smoke) ? profile.smoke : 'Never',
        pack_years: Number.isFinite(Number(profile.pack_years)) ? Number(profile.pack_years) : 0,
        stage: ['I', 'II', 'III', 'IV'].includes(profile.stage) ? profile.stage : 'II',
        ecog: Number.isFinite(Number(profile.ecog)) ? Number(profile.ecog) : 1,
        tumor_size: Number.isFinite(Number(profile.tumor_size)) ? Number(profile.tumor_size) : 3,
        genetic_score: Number.isFinite(Number(profile.genetic_score)) ? Number(profile.genetic_score) : 50,
        treatment: formData.treatment,
      };

      setFormData(nextFormData);
      setLoadedPatientProfile(profile);
      setSelectedPatientId(candidateId);
      setPatientLookupMessage(`Loaded patient ${candidateId}`);
      await runPrediction(null, nextFormData);
    } catch (error) {
      if (error?.response?.status === 404) {
        setPatientLookupMessage('Patient ID was not found in the dataset.');
      } else {
        setPatientLookupMessage('Could not reach API. Please wait for backend to start and try again.');
      }
    } finally {
      setLoading(false);
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
    if (!auth.isLoggedIn) return;
    runPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isLoggedIn]);

  useEffect(() => {
    try {
      const savedAccounts = localStorage.getItem(AUTH_ACCOUNTS_KEY);
      if (!savedAccounts) return;

      const parsedAccounts = JSON.parse(savedAccounts);
      if (!Array.isArray(parsedAccounts)) return;

      const sanitized = parsedAccounts
        .map((entry) => ({
          username: normalizeUsername(entry?.username),
          password: String(entry?.password || ''),
          role: entry?.role === 'Research Analyst' ? 'Research Analyst' : 'Doctor',
        }))
        .filter((entry) => entry.username && entry.password);

      setCustomAccounts(sanitized);
    } catch {
      // Ignore malformed custom account payloads.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const normalizedUsername = normalizeUsername(parsed.username);
      const isValid = allAuthUsers.some((user) => user.username === normalizedUsername && user.role === parsed.role);
      if (!isValid) return;

      setAuth({
        isLoggedIn: true,
        username: normalizedUsername,
        role: parsed.role,
      });
    } catch {
      // No-op on invalid local storage payload.
    }
  }, [allAuthUsers]);

  useEffect(() => {
    if (auth.isLoggedIn) return undefined;

    const scene = authSceneRef.current;
    if (!scene) return undefined;

    const setVars = (x, y, scrollY) => {
      scene.style.setProperty('--auth-pointer-x', `${x}px`);
      scene.style.setProperty('--auth-pointer-y', `${y}px`);
      scene.style.setProperty('--auth-scroll-y', `${scrollY}px`);
    };

    const handleMove = (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 34;
      const y = (event.clientY / window.innerHeight - 0.5) * 26;
      setVars(x, y, window.scrollY || 0);
    };

    const handleScroll = () => {
      setVars(0, 0, window.scrollY || 0);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [auth.isLoggedIn]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const fetchAllPatientIds = async () => {
      try {
        const response = await axios.get(PATIENTS_URL);
        const ids = response?.data?.patient_ids ?? [];
        setAllPatientIds(ids);
        if (ids.length > 0) {
          setPatientLookupId((prev) => (prev ? prev : ids[0]));
        }
      } catch (error) {
        setAllPatientIds([]);
      }
    };

    fetchAllPatientIds();
  }, [auth.isLoggedIn]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    const fetchPatients = async () => {
      try {
        const response = await axios.get(FOLLOWUP_PATIENTS_URL);
        const ids = response?.data?.patient_ids ?? [];
        setFollowupPatientIds(ids);
        if (ids.length > 0) {
          setSelectedPatientId((prev) => (prev ? prev : ids[0]));
        }
      } catch (error) {
        setFollowupPatientIds([]);
      }
    };

    fetchPatients();
  }, [auth.isLoggedIn]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    if (!selectedPatientId) {
      setFollowupVisits([]);
      return;
    }

    const fetchVisits = async () => {
      try {
        const response = await axios.get(FOLLOWUP_VISITS_URL, {
          params: { patient_id: selectedPatientId },
        });
        const visits = response?.data?.visits ?? [];
        setFollowupVisits(visits);
      } catch (error) {
        setFollowupVisits([]);
      }
    };

    fetchVisits();
  }, [selectedPatientId, auth.isLoggedIn]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;

    if (auth.role === 'Doctor' && !['overview', 'simulator'].includes(activeView)) {
      setActiveView('overview');
    }

    if (auth.role === 'Research Analyst' && activeView !== 'overview') {
      setActiveView('overview');
    }
  }, [auth, activeView]);

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

  const monitoringSeries = useMemo(() => (
    followupVisits.map((visit) => ({
      date: visit.visit_date,
      tumor: Number(visit.tumor_size_cm) || 0,
      ecog: Number(visit.ecog_score) || 0,
      response: visit.treatment_response || 'Stable',
    }))
  ), [followupVisits]);

  const responseSeries = useMemo(() => {
    const counts = {};
    followupVisits.forEach((visit) => {
      const key = visit.treatment_response || 'Stable';
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.keys(counts).map((key) => ({
      name: key,
      value: counts[key],
      fill: responsePalette[key] || '#7f8c8d',
    }));
  }, [followupVisits]);

  const simulatorSorted = useMemo(() => {
    return [...treatmentSimulation].sort((a, b) => b.survival - a.survival);
  }, [treatmentSimulation]);

  const explanationFactors = useMemo(() => {
    return [...riskItems]
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.label);
  }, [riskItems]);

  if (!auth.isLoggedIn) {
    return (
      <div className="auth-screen auth-cinematic" ref={authSceneRef}>
        <div className="auth-bg-layer auth-bg-image" />
        <div className="auth-bg-layer auth-bg-drift" />
        <div className="auth-bg-layer auth-bg-sweep" />
        <div className="auth-bg-layer auth-vignette" />
        <div className="auth-particles" aria-hidden="true">
          <span className="auth-particle p1" />
          <span className="auth-particle p2" />
          <span className="auth-particle p3" />
          <span className="auth-particle p4" />
          <span className="auth-particle p5" />
          <span className="auth-particle p6" />
        </div>

        <div className="auth-content-wrap">
          <div className="auth-card cinematic-card">
            <div className="auth-reflection" />
            <div className="auth-kicker">Clinical AI Platform</div>
            <div className="auth-title">Lung Cancer Clinical Intelligence</div>
            <div className="auth-subtitle">AI-powered probabilistic survival and treatment decision system</div>

            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setRegisterError('');
                  setRegisterSuccess('');
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register');
                  setLoginError('');
                }}
              >
                Create Account
              </button>
            </div>

            {authMode === 'login' ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label htmlFor="username">Username</label>
                <input id="username" type="text" value={loginForm.username} onChange={handleLoginChange} placeholder=" " autoComplete="username" />

                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={loginForm.password} onChange={handleLoginChange} placeholder=" " autoComplete="current-password" />

                <label htmlFor="role">Role</label>
                <select id="role" value={loginForm.role} onChange={handleLoginChange} className="auth-select">
                  <option value="Doctor">Doctor</option>
                  <option value="Research Analyst">Research Analyst</option>
                </select>

                {loginError ? <div className="auth-error">{loginError}</div> : null}
                <button type="submit" className={`auth-login-btn ${authBusy ? 'is-loading' : ''}`}>
                  <span className="btn-label">Enter Clinical Portal</span>
                  <span className="btn-spinner" aria-hidden="true" />
                </button>
                <div className="auth-hint">Doctor and Research Analyst access enabled</div>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleCreateAccount}>
                <label htmlFor="register_username">Create Username</label>
                <input id="register_username" type="text" value={registerForm.username} onChange={handleRegisterChange} placeholder=" " autoComplete="username" />

                <label htmlFor="register_password">Create Password</label>
                <input id="register_password" type="password" value={registerForm.password} onChange={handleRegisterChange} placeholder=" " autoComplete="new-password" />

                <label htmlFor="confirmPassword">Confirm Password</label>
                <input id="confirmPassword" type="password" value={registerForm.confirmPassword} onChange={handleRegisterChange} placeholder=" " autoComplete="new-password" />

                <label htmlFor="register_role">Role</label>
                <select id="register_role" value={registerForm.role} onChange={handleRegisterChange} className="auth-select">
                  <option value="Doctor">Doctor</option>
                  <option value="Research Analyst">Research Analyst</option>
                </select>

                {registerError ? <div className="auth-error">{registerError}</div> : null}
                {registerSuccess ? <div className="auth-success">{registerSuccess}</div> : null}

                <button type="submit" className={`auth-login-btn ${authBusy ? 'is-loading' : ''}`}>
                  <span className="btn-label">Create and Enter Portal</span>
                  <span className="btn-spinner" aria-hidden="true" />
                </button>
                <div className="auth-hint">New accounts are stored locally on this device.</div>
              </form>
            )}
          </div>
          <div className="auth-footer-reveal">Bayesian Survival Intelligence - Secure Clinical Environment</div>
        </div>
      </div>
    );
  }

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
            <strong>BayesLCA</strong>
          </div>
        </div>

        <div className="topbar-meta">
          <span>Welcome Dr. {auth.username}</span>
          <span className="role-chip">{auth.role}</span>
          {(canAccessAnalystFeatures || canAccessDoctorFeatures) && prediction ? (
            <button type="button" className="export-btn" onClick={exportCsvReport}>Export CSV</button>
          ) : null}
          {canAccessDoctorFeatures && prediction ? (
            <button type="button" className="export-btn doctor" onClick={exportDoctorSummary}>Export Report</button>
          ) : null}
          <button type="button" className="logout-btn" onClick={handleLogout}>Logout</button>
          <div className={`live-pill ${apiStatus}`}>
            <span className="live-dot" />
            {apiStatusText}
          </div>
        </div>
      </header>

      <div className="view-switcher">
        <button
          type="button"
          className={`view-switch-btn ${activeView === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveView('overview')}
        >
          Overview
        </button>
        {canAccessDoctorFeatures && (
          <button
            type="button"
            className={`view-switch-btn ${activeView === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveView('simulator')}
          >
            Treatment Simulator
          </button>
        )}
      </div>

      {activeView === 'overview' && (
      <div className="dashboard-shell">
        <aside className="panel panel-sidebar">
          <div className="panel-heading sticky">
            <h2>Patient Parameters</h2>
            <p>Configure clinical input variables</p>
          </div>

          <form className="controls-stack" onSubmit={runPrediction}>
            <div className="field-block patient-lookup-block">
              <div className="field-label">
                <div className="field-title">
                  <UserRound size={18} strokeWidth={1.8} />
                  <span>Patient ID Lookup</span>
                </div>
              </div>

              <input
                type="text"
                className="panel-select patient-id-input"
                value={patientLookupId}
                onChange={(event) => setPatientLookupId(event.target.value)}
                list="patient-ids-list"
                placeholder="Enter patient_id"
              />
              <datalist id="patient-ids-list">
                {allPatientIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>

              <button type="button" className="patient-load-button" onClick={loadPatientById}>
                Load Patient Data
              </button>

              {patientLookupMessage ? <div className="patient-lookup-msg">{patientLookupMessage}</div> : null}

              {loadedPatientProfile ? (
                <div className="patient-condition-card">
                  <div><strong>Patient ID:</strong> {loadedPatientProfile.patient_id}</div>
                  <div><strong>Condition:</strong> Stage {loadedPatientProfile.stage} / ECOG {loadedPatientProfile.ecog}</div>
                  <div><strong>Response Category:</strong> {loadedPatientProfile.treatment_response_category || 'N/A'}</div>
                </div>
              ) : null}
            </div>

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
      )}

      {canAccessDoctorFeatures && activeView === 'monitoring' && (
        <div className="module-shell monitoring-shell">
          <section className="panel panel-module">
            <div className="panel-heading">
              <h2>Patient Monitoring Timeline</h2>
              <p>Longitudinal follow-up analysis from visit history</p>
            </div>

            <div className="module-controls">
              <label htmlFor="patient-monitoring-id">Patient ID</label>
              <select
                id="patient-monitoring-id"
                className="panel-select"
                value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}
              >
                {followupPatientIds.length === 0 ? <option value="">No follow-up data</option> : null}
                {followupPatientIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>

            <div className="module-grid two-col">
              <div className="analytic-card">
                <div className="analytic-title">
                  <TrendingUp size={18} strokeWidth={1.8} />
                  <span>Tumor Size Progression</span>
                </div>
                <div className="mini-chart large">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monitoringSeries} margin={{ top: 12, right: 10, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="tumor" stroke="#e74c3c" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="analytic-card">
                <div className="analytic-title">
                  <Activity size={18} strokeWidth={1.8} />
                  <span>ECOG Progression</span>
                </div>
                <div className="mini-chart large">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monitoringSeries} margin={{ top: 12, right: 10, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <YAxis domain={[0, 4]} tickCount={5} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="ecog" stroke="#2c3e50" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="module-grid two-col">
              <div className="analytic-card">
                <div className="analytic-title">
                  <Heart size={18} strokeWidth={1.8} />
                  <span>Treatment Response Over Visits</span>
                </div>
                <div className="response-timeline">
                  {monitoringSeries.length === 0 ? (
                    <div className="empty-note">No follow-up records for this patient.</div>
                  ) : monitoringSeries.map((row, index) => (
                    <div key={`${row.date}-${index}`} className="response-row">
                      <span className="response-dot" style={{ background: responsePalette[row.response] || '#7f8c8d' }} />
                      <strong>{row.response}</strong>
                      <span>{row.date}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="analytic-card">
                <div className="analytic-title">
                  <Waves size={18} strokeWidth={1.8} />
                  <span>Response Distribution</span>
                </div>
                <div className="mini-chart large">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responseSeries} margin={{ top: 12, right: 10, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                        {responseSeries.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {canAccessDoctorFeatures && activeView === 'simulator' && (
        <div className="module-shell simulator-shell">
          <section className="panel panel-module">
            <div className="panel-heading">
              <h2>Treatment Outcome Simulator</h2>
              <p>Bayesian treatment comparison with credible ranges and ranking</p>
            </div>

            <div className="module-grid two-col">
              <div className="analytic-card">
                <div className="analytic-title">
                  <TrendingUp size={18} strokeWidth={1.8} />
                  <span>Treatment Survival Comparison</span>
                </div>
                <div className="mini-chart large">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={simulatorSorted} margin={{ top: 10, right: 10, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                      <XAxis dataKey="treatment" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Bar dataKey="survival" radius={[10, 10, 0, 0]}>
                        {simulatorSorted.map((entry) => (
                          <Cell key={entry.treatment} fill={entry.best ? '#2f9e44' : '#1d73ff'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="analytic-card">
                <div className="analytic-title">
                  <ShieldCheck size={18} strokeWidth={1.8} />
                  <span>Best Treatment & Ranking</span>
                </div>
                <div className="ranking-list">
                  {simulatorSorted.map((row, index) => (
                    <div className={`ranking-item ${row.best ? 'best' : ''}`} key={row.treatment}>
                      <span>#{index + 1} {row.treatment}</span>
                      <strong>{row.survival.toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="module-grid two-col">
              <div className="analytic-card">
                <div className="analytic-title">
                  <Waves size={18} strokeWidth={1.8} />
                  <span>Survival Projection Over Time</span>
                </div>
                <div className="mini-chart large">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={survData} margin={{ top: 12, right: 8, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf5" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={{ fill: '#8b93a7', fontSize: 11 }} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Line type="monotone" dataKey="survival" stroke="#27b463" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="analytic-card">
                <div className="analytic-title">
                  <Cpu size={18} strokeWidth={1.8} />
                  <span>Patient Risk Gauge</span>
                </div>
                <div className="gauge-wrap large-gauge-wrap">
                  <div
                    className="gauge-ring risk-gauge-large"
                    style={{ '--gauge-value': `${survivalProbability}%` }}
                  >
                    <div className="gauge-inner">
                      <div className="gauge-value">{formatPercent(survivalProbability)}</div>
                    </div>
                  </div>
                  <div className="gauge-caption">Green good, yellow moderate, red high risk</div>
                </div>
              </div>
            </div>

            <div className="analytic-card explanation-card">
              <div className="analytic-title">
                <Sparkles size={18} strokeWidth={1.8} />
                <span>AI Prediction Explanation</span>
              </div>
              <p className="explanation-text">The model prediction is mainly influenced by:</p>
              <ul className="explanation-list">
                {explanationFactors.map((factor) => (
                  <li key={factor}>{factor}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      <div className={`loading-screen ${loading ? 'active' : ''}`}>
        <div className="loading-spinner" />
        <p>Running Bayesian posterior sampling...</p>
      </div>
    </div>
  );
}

export default App;
