import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, LogOut, Settings } from 'lucide-react';

function Profile() {
  const { token, email, logout } = useAuth();
  const { currency, setCurrency, EXCHANGE_RATES } = useCurrency();
  const navigate = useNavigate();

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

        <div className="space-y-4 mb-8">
          <div className="border border-white/5 p-4 bg-black/40">
            <p className="text-xs text-white/40 tracking-wider uppercase mb-1">Email Address</p>
            <p className="text-base text-white font-light">{email || 'Not available'}</p>
          </div>
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
          <div className="border border-white/5 p-4 bg-black/40">
            <p className="text-xs text-white/40 tracking-wider uppercase mb-2 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Display Currency
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(EXCHANGE_RATES).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setCurrency(curr)}
                  className={`px-2.5 py-1 text-[11px] border transition-all cursor-pointer ${
                    currency === curr
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-white/60 border-white/20 hover:text-white hover:border-white/40'
                  }`}
                >
                  {curr} ({EXCHANGE_RATES[curr].symbol})
                </button>
              ))}
            </div>
          </div>
        </div>

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
