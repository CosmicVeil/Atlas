import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Portfolio from './pages/Portfolio'
import Profile from './pages/Profile'
import AIAnalysisScreen from './pages/AIAnalysisScreen'
import UserStockAnalysis from './pages/UserStockAnalysis'
import MarketNews from './pages/MarketNews'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" />
}

function App() {
  return (
    <div className="dark bg-black text-white min-h-screen relative overflow-hidden">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/portfolio"
          element={
            <PrivateRoute>
              <Portfolio />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          path="/ai-analysis"
          element={
            <PrivateRoute>
              <AIAnalysisScreen />
            </PrivateRoute>
          }
        />
        <Route
          path="/stock-data"
          element={
            <PrivateRoute>
              <UserStockAnalysis />
            </PrivateRoute>
          }
        />
        <Route
          path="/market-news"
          element={<MarketNews />}
        />
      </Routes>
    </div>
  )
}

export default App
