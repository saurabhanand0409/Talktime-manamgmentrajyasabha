import { Link, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useChairperson } from '../context/ChairpersonContext';
import { useBroadcast } from '../context/BroadcastContext';
import { LogOut } from 'lucide-react';

export default function Header({ showBack = false, backTo = '/dashboard' }) {
    const { isConnected } = useSocket();
    const { chairperson, selectChairperson, chairpersons, selectedChairpersonData } = useChairperson();
    const { isBroadcasting } = useBroadcast();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        navigate('/login');
    };

    const handleChairSelect = (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
            const chair = chairpersons.find(c => c.id.toString() === selectedId);
            selectChairperson(chair);
        } else {
            selectChairperson(null);
        }
    };

    // Format position display name
    const formatPosition = (position) => {
        if (position === 'Deputy-Chairman' || position === 'Vice-Chairperson' || position === 'Vice Chairperson') {
            return 'Deputy Chairman';
        }
        if (position === 'Chairperson') {
            return 'Chairman';
        }
        if (position === 'Co-Chairperson') {
            return 'In The Chair';
        }
        return position;
    };

    return (
        <header className="gradient-primary px-5 py-3 shadow-xl sticky top-0 z-50">
            <div className="max-w-full mx-auto flex items-center justify-between gap-5">
                {/* Logo and Title */}
                <div className="flex items-center gap-4">
                    <img
                        src="/parliament_logo.png"
                        alt="Parliament Logo"
                        className="w-20 h-20 object-contain drop-shadow-lg"
                    />
                    <div>
                        <h1 className="text-white text-2xl font-extrabold text-shadow leading-tight">
                            Rajya Sabha Talk Time Management System
                        </h1>
                        <p className="text-white/80 text-base">Parliament of India</p>
                    </div>
                </div>

                {/* All Controls in One Line */}
                <div className="flex items-center gap-5">
                    {/* Connection Status */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-base font-semibold ${isConnected
                        ? 'bg-green-500/20 text-green-100'
                        : 'bg-red-500/20 text-red-100'
                        }`}>
                        <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse-ring' : 'bg-red-400'
                            }`}></span>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>

                    {/* Chair Selector (if on dashboard) */}
                    {!showBack && (
                        <div className="flex items-center gap-3">
                            <span className="text-white font-semibold text-base">IN THE CHAIR:</span>
                            <select
                                value={selectedChairpersonData?.id?.toString() || ''}
                                onChange={handleChairSelect}
                                disabled={isBroadcasting}
                                title={isBroadcasting ? 'Change the chair from the active session window' : undefined}
                                className={`bg-white/95 border border-white/50 rounded-lg px-4 py-2 text-gray-800 font-semibold text-base min-w-[220px] ${
                                    isBroadcasting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                                }`}
                            >
                                <option value="">Select Member</option>
                                {chairpersons.map((chair) => (
                                    <option key={chair.id} value={chair.id.toString()}>
                                        {formatPosition(chair.position)} - {chair.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Back Button */}
                    {showBack && (
                        <Link
                            to={backTo}
                            className="bg-white/20 hover:bg-white/30 text-white px-5 py-2 rounded-lg text-base font-semibold flex items-center gap-2"
                        >
                            ← Back to Dashboard
                        </Link>
                    )}

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        className="bg-red-900/50 hover:bg-red-900/80 text-white px-5 py-2 rounded-lg text-base font-semibold flex items-center gap-2"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
}
