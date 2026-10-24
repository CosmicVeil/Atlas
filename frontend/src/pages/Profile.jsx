import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, LogOut, Save } from 'lucide-react';
import { getProfile, updateProfile } from '../api/profile';
import { changedValues, usesDropdown } from '../components/profile/profileForm';

// Renders one field from the backend registry (backend/app/profile_fields.py)
function ProfileField({ field, value, error, onChange }) {
  const id = `profile-${field.key}`;
  const inputClass = 'w-full bg-transparent border border-white/20 px-3 py-2 text-sm text-white font-light focus:outline-none focus:border-white/60';
  let control;

  if (field.type === 'select' && usesDropdown(field)) {
    control = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} cursor-pointer`}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value} className="bg-black">{option.label}</option>
        ))}
      </select>
    );
  } else if (field.type === 'select') {
    control = (
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {field.options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1 text-[11px] border transition-all cursor-pointer ${
              value === option.value
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-white/60 border-white/20 hover:text-white hover:border-white/40'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  } else {
    control = (
      <input
        id={id}
        type={field.type === 'number' ? 'number' : field.type}
        value={value ?? ''}
        min={field.min}
        max={field.max}
        maxLength={field.max_length}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  }

  return (
    <div className="border border-white/5 p-4 bg-black/40">
      <label id={`${id}-label`} htmlFor={id} className="text-xs text-white/40 tracking-wider uppercase mb-2 block">{field.label}</label>
      {control}
      {field.help && <p className="text-[11px] text-white/30 mt-2">{field.help}</p>}
      {error && <p className="text-[11px] text-rose-400 mt-2">{error}</p>}
    </div>
  );
}

function Profile() {
  const { token, logout, login } = useAuth();
  const { setCurrency } = useCurrency();
  const navigate = useNavigate();
  const [fields, setFields] = useState([]);
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!token) return;
    getProfile(token)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setFields(data.fields);
        setSaved(data.values);
        setDraft(data.values);
        setStatus('idle');
      })
      .catch(() => setStatus('load-error'));
  }, [token]);

  const changes = changedValues(fields, saved, draft);
  const hasChanges = Object.keys(changes).length > 0;

  async function handleSave() {
    setStatus('saving');
    setErrors({});
    try {
      const data = await updateProfile(token, changes);
      if (data.errors || data.error) {
        setErrors(data.errors || { _: data.error });
        setStatus('idle');
        return;
      }
      setSaved(data.values);
      setDraft(data.values);
      setCurrency(data.values.currency);
      if (changes.email) login(token, data.values.email);
      setStatus('saved');
    } catch {
      setErrors({ _: 'Could not save your profile. Please try again.' });
      setStatus('idle');
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden text-white flex flex-col items-center justify-center pt-16">
      {/* Background SVG Waves */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M0,400 Q100,350 200,380 T400,360 T600,340 T800,380 T1000,350 T1200,370 T1400,340 T1600,360 T1800,380 T2000,350"
            stroke="white"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </svg>
      </div>

      <motion.div
        className="bg-black border border-white/10 p-10 max-w-md w-full mx-4 relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mb-4 bg-white/5">
            <User className="w-8 h-8 text-white" strokeWidth={1} />
          </div>
          <h2 className="text-3xl font-light tracking-tight text-white">Your Profile</h2>
          <p className="text-xs text-white/40 mt-1 tracking-wider uppercase">Manage your Atlas settings</p>
        </div>

        <div className="space-y-4 mb-6">
          {status === 'loading' && <p className="text-sm text-white/40 text-center">Loading profile...</p>}
          {status === 'load-error' && <p className="text-sm text-rose-400 text-center">Could not load your profile.</p>}
          {fields.map((field) => (
            <ProfileField
              key={field.key}
              field={field}
              value={draft[field.key]}
              error={errors[field.key]}
              onChange={(value) => {
                setDraft((prev) => ({ ...prev, [field.key]: value }));
                if (status === 'saved') setStatus('idle');
              }}
            />
          ))}
          <div className="border border-white/5 p-4 bg-black/40">
            <p className="text-xs text-white/40 tracking-wider uppercase mb-1">Session Status</p>
            <p className="text-base text-white font-light flex items-center gap-2">
              {token ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span>Active Session</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                  <span>Inactive</span>
                </>
              )}
            </p>
          </div>
        </div>

        {errors._ && <p className="text-xs text-rose-400 mb-3 text-center">{errors._}</p>}
        {fields.length > 0 && (
          <button
            onClick={handleSave}
            disabled={!hasChanges || status === 'saving'}
            className="w-full py-3 mb-3 bg-white text-black text-sm tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" strokeWidth={1.5} />
            {status === 'saving' ? 'Saving...' : status === 'saved' && !hasChanges ? 'Saved' : 'Save Changes'}
          </button>
        )}

        <motion.button
          onClick={handleLogout}
          className="w-full py-3 border border-white/20 hover:bg-white/5 text-white text-sm tracking-wide bg-transparent transition-all cursor-pointer flex items-center justify-center gap-2"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          Sign Out
        </motion.button>
      </motion.div>
    </div>
  );
}

export default Profile;
