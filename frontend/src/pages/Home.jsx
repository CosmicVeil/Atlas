import { useNavigate } from 'react-router-dom';
import { TrendingUp, LineChart, Brain, Wallet, Search, User, BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black relative overflow-hidden text-white">
      {/* Animated Graph Background */}
      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <motion.path
            d="M0,400 Q100,350 200,380 T400,360 T600,340 T800,380 T1000,350 T1200,370 T1400,340 T1600,360 T1800,380 T2000,350"
            stroke="white"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <motion.path
            d="M0,500 Q150,420 300,450 T600,430 T900,470 T1200,440 T1500,460 T1800,450 T2100,480"
            stroke="white"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 0.5 }}
          />
          <motion.path
            d="M0,300 Q200,250 400,280 T800,260 T1200,290 T1600,270 T2000,300"
            stroke="white"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear", delay: 1 }}
          />
        </svg>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-8 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="text-center"
        >
          <h1 className="text-9xl font-light tracking-tight text-white mb-6">
            ATLAS
          </h1>
          <p className="text-sm tracking-[0.3em] text-white/40 mb-4 uppercase">
            AI Trading, Learning & Stock Analysis
          </p>
          <p className="text-base text-white/60 max-w-2xl mx-auto leading-relaxed">
            Advanced algorithmic trading platform powered by machine learning.
            Real-time market analysis, portfolio optimization, and intelligent stock recommendations.
          </p>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-12"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-px h-16 bg-gradient-to-b from-white/20 to-transparent"></div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="relative max-w-7xl mx-auto px-8 py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
          {/* Portfolio Management */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={() => navigate('/portfolio')}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <Wallet className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">Portfolio Management</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Track multiple portfolios with real-time performance metrics and AI-driven insights.
              </p>
            </div>
          </motion.div>

          {/* Stock Data */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <Search className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">Stock Data Explorer</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Access comprehensive market data, historical charts, and real-time analytics.
              </p>
            </div>
          </motion.div>

          {/* AI Analysis */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <Brain className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">AI Market Analysis</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Daily analysis of top 500 stocks with recommendations and risk assessment.
              </p>
            </div>
          </motion.div>

          {/* Personal Analysis */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <LineChart className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">Personal AI Advisor</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Custom stock analysis and recommendations based on your portfolio and budget.
              </p>
            </div>
          </motion.div>

          {/* User Profile */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={() => navigate('/profile')}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <User className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">User Profile</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Manage preferences, risk tolerance, and investment goals in one place.
              </p>
            </div>
          </motion.div>

          {/* Market Insights */}
          <motion.div
            className="bg-black border border-white/5 p-10 group cursor-pointer relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.02] transition-all duration-300"></div>
            <div className="relative">
              <BarChart3 className="w-8 h-8 text-white/60 mb-6" strokeWidth={1} />
              <h3 className="text-xl text-white mb-3 tracking-wide">Market Insights</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Best and worst performing stocks with detailed AI-generated explanations.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 bg-black/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-white/40" strokeWidth={1.5} />
              <span className="text-sm tracking-wider text-white/40">ATLAS</span>
            </div>
            <p className="text-xs text-white/20 tracking-wide">
              © 2026 ATLAS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
