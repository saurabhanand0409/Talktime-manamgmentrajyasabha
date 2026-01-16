import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ZeroHour from './pages/ZeroHour';
import MemberSpeaking from './pages/MemberSpeaking';
import BillDiscussions from './pages/BillDiscussions';
import BillDetails from './pages/BillDetails';
import DatabaseEntry from './pages/DatabaseEntry';
import LogList from './pages/LogList';
import BroadcastPage from './pages/BroadcastPage';
import Message from './pages/Message';
import { SocketProvider } from './context/SocketContext';
import { ChairpersonProvider } from './context/ChairpersonContext';
import { BroadcastProvider } from './context/BroadcastContext';

// Protected Route Component
function ProtectedRoute({ children }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <SocketProvider>
      <ChairpersonProvider>
        <BroadcastProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Welcome />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/zero-hour" element={
              <ProtectedRoute>
                <ZeroHour />
              </ProtectedRoute>
            } />
            <Route path="/member-speaking" element={
              <ProtectedRoute>
                <MemberSpeaking />
              </ProtectedRoute>
            } />
            <Route path="/bill-discussions" element={
              <ProtectedRoute>
                <BillDiscussions />
              </ProtectedRoute>
            } />
            <Route path="/bill-details" element={
              <ProtectedRoute>
                <BillDetails />
              </ProtectedRoute>
            } />
            <Route path="/database-entry" element={
              <ProtectedRoute>
                <DatabaseEntry />
              </ProtectedRoute>
            } />
            <Route path="/log-list" element={
              <ProtectedRoute>
                <LogList />
              </ProtectedRoute>
            } />
            <Route path="/message" element={
              <ProtectedRoute>
                <Message />
              </ProtectedRoute>
            } />
            <Route path="/broadcast" element={<BroadcastPage />} />
          </Routes>
        </Router>
        </BroadcastProvider>
      </ChairpersonProvider>
    </SocketProvider>
  );
}

export default App;
