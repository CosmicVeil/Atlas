import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

function Navbar() {
  const { token, email, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="absolute top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <TrendingUp className="w-6 h-6 text-white" strokeWidth={1.5} />
          <span className="text-lg tracking-wider text-white font-light">ATLAS</span>
        </Link>
        <nav className="flex items-center gap-8">
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Link to="/" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
              Home
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Link to="/portfolio" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
              Portfolio
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Link to="/stock-data" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
              Stock Data
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Link to="/ai-analysis" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
              AI Analysis
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <Link to="/profile" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
              Profile
            </Link>
          </motion.div>
          <div className="h-6 w-px bg-white/10"></div>
          {!token ? (
            <>
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Link to="/login" className="text-white/70 hover:text-white transition-colors text-sm tracking-wide no-underline">
                  Login
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Link to="/signup" className="px-5 py-2 border border-white/20 text-white text-sm tracking-wide hover:bg-white/5 transition-all no-underline">
                  Sign Up
                </Link>
              </motion.div>
            </>
          ) : (
            <>
              <span className="text-white/50 text-sm tracking-wide font-light">{email}</span>
              <motion.button
                onClick={handleLogout}
                className="text-white/70 hover:text-white transition-colors text-sm tracking-wide bg-transparent border-0 cursor-pointer"
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                Logout
              </motion.button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
