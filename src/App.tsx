import { useState, useEffect } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import { BookOpen } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Cache ID Token for server API routes
        currentUser.getIdToken().then((token) => {
          localStorage.setItem("aura_user_token", token);
        });
      } else {
        localStorage.removeItem("aura_user_token");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0E12] flex flex-col items-center justify-center space-y-4 font-sans text-[#E2E8F0]">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white animate-pulse shadow-lg shadow-indigo-500/20">
          <BookOpen className="w-5 h-5" />
        </div>
        <span className="text-xs font-semibold tracking-wider text-slate-400">Echo Mind Security Handshake...</span>
      </div>
    );
  }

  // The user MUST be logged in to access the application, local models, and data
  return user ? <Dashboard /> : <LandingPage onAuthSuccess={() => {}} />;
}

