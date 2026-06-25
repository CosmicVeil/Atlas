import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup as signupApi } from '../api/auth';
import { motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';

function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const data = await signupApi(email, password);
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden text-white flex flex-col items-center justify-center pt-16">
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
          className="bg-black border border-white/10 p-10 max-w-md w-full mx-4 text-center relative z-10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <TrendingUp className="w-10 h-10 text-white mb-4 mx-auto" strokeWidth={1.5} />
          <h2 className="text-3xl font-light tracking-tight text-white mb-3">Account Created!</h2>
          <p className="text-sm text-white/60 mb-8 leading-relaxed">
            Your Atlas account has been successfully configured.
          </p>
          <motion.button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-white text-black text-sm tracking-wide font-medium hover:bg-white/90 transition-all cursor-pointer border-0"
            whileHover={{ scale: 1.02 }}
          >
            Go to Login
          </motion.button>
        </motion.div>
      </div>
    );
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
          <TrendingUp className="w-10 h-10 text-white mb-3" strokeWidth={1.5} />
          <h2 className="text-3xl font-light tracking-tight text-white">Create Account</h2>
          <p className="text-xs text-white/40 mt-1 tracking-wider uppercase">Begin your trading journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors text-sm"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 tracking-wider uppercase mb-2 block">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 focus:outline-none focus:border-white/30 transition-colors text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-white/60 bg-white/5 border border-white/10 px-4 py-2 text-center">
              ❌ {error}
            </p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm tracking-wide font-medium hover:bg-white/90 transition-all cursor-pointer border-0 mt-4 disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </motion.button>
        </form>

        <p className="text-xs text-center text-white/40 mt-8">
          Already have an account?{' '}
          <Link to="/login" className="text-white hover:underline transition-all">
            Log in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default Signup;
