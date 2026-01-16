import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useChairperson } from '../context/ChairpersonContext';
import { useBroadcast } from '../context/BroadcastContext';
import { Clock, Mic, FileText, FilePlus, Mail, Database, AlertCircle, Monitor } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

const menuItems = [
    {
        title: 'ZERO HOUR',
        icon: Clock,
        path: '/zero-hour',
        description: '3-minute countdown timer',
        color: 'from-red-600 to-red-800',
        requiresChair: true,
        requiresBroadcast: true,
        broadcastKey: 'Zero Hour',
    },
    {
        title: 'MEMBER SPEAKING',
        icon: Mic,
        path: '/member-speaking',
        description: 'Track speaking duration',
        color: 'from-red-600 to-red-800',
        requiresChair: true,
        requiresBroadcast: true,
        broadcastKey: 'Member Speaking',
    },
    {
        title: 'DISCUSSIONS',
        icon: FileText,
        path: '/bill-discussions',
        description: 'Discuss running bills',
        color: 'from-red-600 to-red-800',
        requiresChair: true,
        requiresBroadcast: true,
        broadcastKey: 'Bill Discussion',
    },
    {
        title: 'BILL DETAILS',
        icon: FilePlus,
        path: '/bill-details',
        description: 'Add new bill details',
        color: 'from-red-600 to-red-800',
    },
    {
        title: 'MESSAGE',
        icon: Mail,
        path: '/message',
        description: 'Obituary & Birthday',
        color: 'from-red-600 to-red-800',
        requiresBroadcast: true,
    },
    {
        title: 'DATABASE',
        icon: Database,
        path: '/database-entry',
        description: 'Manage data & logs',
        color: 'from-red-600 to-red-800',
    },
];

export default function Dashboard() {
    const { chairperson, selectedChairpersonData } = useChairperson();
    const { openIdleBroadcast, setChairpersonData, isBroadcasting, broadcastType, isBroadcastWindowReady } = useBroadcast();
    const [alertMessage, setAlertMessage] = useState('');
    const alertTimeoutRef = useRef(null);

    const triggerAlert = (message) => {
        if (!message) return;
        setAlertMessage(message);
        if (alertTimeoutRef.current) {
            clearTimeout(alertTimeoutRef.current);
        }
        alertTimeoutRef.current = setTimeout(() => {
            setAlertMessage('');
        }, 3000);
    };

    useEffect(() => {
        return () => {
            if (alertTimeoutRef.current) {
                clearTimeout(alertTimeoutRef.current);
            }
        };
    }, []);

    const getMenuLockState = (item) => {
        if (item.comingSoon) {
            return { disabled: true, badge: 'Coming Soon', message: 'This feature is coming soon.' };
        }
        if (item.requiresChair && !chairperson) {
            return { disabled: true, badge: 'Select Chair', message: 'Please select a Chairperson first!' };
        }
        if (item.requiresBroadcast && !isBroadcastWindowReady) {
            return { disabled: true, badge: 'Open Broadcast', message: 'Open the broadcast window before using this module.' };
        }
        
        // Check if Message (Obituary/Birthday) is currently broadcasting
        const isMessageBroadcasting = isBroadcasting && (broadcastType === 'Obituary' || broadcastType === 'Birthday');
        
        // If MESSAGE is broadcasting, show Active badge on MESSAGE and disable ZH/MS/BD
        if (isMessageBroadcasting && item.title === 'MESSAGE') {
            return { disabled: false, badge: 'Active Broadcasting', badgeColor: 'bg-green-500' };
        }
        
        // If MESSAGE is broadcasting, disable ZH, MS, BD
        if (isMessageBroadcasting && item.broadcastKey && ['Zero Hour', 'Member Speaking', 'Bill Discussion'].includes(item.broadcastKey)) {
            return { disabled: true, badge: 'Session Active', message: `End the ongoing ${broadcastType} broadcast before starting ${item.broadcastKey}.` };
        }
        
        // Normal broadcast conflict check (ZH vs MS vs BD)
        if (isBroadcasting && item.broadcastKey && broadcastType && broadcastType !== item.broadcastKey) {
            return { disabled: true, badge: 'Session Active', message: `End the ongoing ${broadcastType} broadcast before starting ${item.broadcastKey}.` };
        }
        return { disabled: false };
    };

    // Update broadcast window when chairperson changes (for idle mode)
    useEffect(() => {
        if (selectedChairpersonData) {
            setChairpersonData({
                name: selectedChairpersonData.name || '',
                position: selectedChairpersonData.position || '',
                picture: selectedChairpersonData.picture || null
            });
        }
    }, [selectedChairpersonData, setChairpersonData]);

    const handleMenuClick = (item, lockState, e) => {
        const state = lockState || getMenuLockState(item);
        if (state.disabled) {
            e.preventDefault();
            triggerAlert(state.message || 'This option is currently unavailable.');
        }
    };

    const handleBroadcastClick = () => {
        if (!chairperson) {
            triggerAlert('Please select a Chairperson first!');
            return;
        }
        
        // Update chairperson data in context before opening broadcast
        if (selectedChairpersonData) {
            setChairpersonData({
                name: selectedChairpersonData.name || '',
                position: selectedChairpersonData.position || '',
                picture: selectedChairpersonData.picture || null
            });
        }
        
        // Open idle broadcast window
        const win = openIdleBroadcast();
        if (win) {
            // Send chairperson data after window loads
            setTimeout(() => {
                win.postMessage({
                    type: 'BROADCAST_END',
                    chairperson: selectedChairpersonData?.name || chairperson || '',
                    chairpersonPosition: selectedChairpersonData?.position || '',
                    chairpersonPhoto: selectedChairpersonData?.picture || null
                }, '*');
            }, 500);
        }
    };

    const broadcastButtonState = isBroadcasting
        ? {
            label: 'Active Broadcasting',
            className: 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/30'
        }
        : isBroadcastWindowReady
            ? {
                label: 'Broadcasting',
                className: 'bg-gradient-to-r from-yellow-300 to-yellow-500 text-red-900 shadow-lg shadow-yellow-500/30'
            }
            : {
                label: 'Open Broadcast',
                className: 'bg-gradient-to-r from-red-600 to-red-800 text-white hover:from-red-700 hover:to-red-900'
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
            <Header />

            {/* Alert for no chairperson selected */}
            {alertMessage && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
                    <div className="bg-yellow-500 text-gray-900 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
                        <AlertCircle size={24} />
                        <span className="font-bold">{alertMessage}</span>
                        <button
                            onClick={() => setAlertMessage('')}
                            className="ml-2 hover:bg-white/20 p-1 rounded"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                {/* Dashboard Header with Broadcast Button */}
                <div className="flex items-center justify-between mb-8 animate-fade-in">
                    {/* Spacer for centering */}
                    <div className="w-48"></div>
                    
                    {/* Centered Dashboard Title */}
                    <h2 className="text-3xl md:text-4xl font-bold text-red-800">
                        DASHBOARD
                    </h2>
                    
                    {/* Broadcast Button - Right side */}
                    <button
                        onClick={handleBroadcastClick}
                        className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-lg transition-all hover:-translate-y-1 hover:shadow-xl ${broadcastButtonState.className}`}
                    >
                        <Monitor size={24} />
                        {broadcastButtonState.label}
                    </button>
                </div>

                {/* Menu Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {menuItems.map((item, index) => {
                        const lockState = getMenuLockState(item);
                        return (
                        <MenuCard
                            key={item.title}
                            item={item}
                            delay={index * 100}
                                lockState={lockState}
                            onMenuClick={handleMenuClick}
                        />
                        );
                    })}
                </div>
            </main>

            <Footer />
        </div>
    );
}

function MenuCard({ item, delay, lockState, onMenuClick }) {
    const Icon = item.icon;
    const disabled = lockState?.disabled;
    const badge = lockState?.badge;
    const badgeColor = lockState?.badgeColor || 'bg-black/40';

    const content = (
        <div
            className={`relative h-48 md:h-56 bg-gradient-to-br ${item.color} rounded-2xl p-6 text-white transition-all duration-300 overflow-hidden group ${
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-2 hover:shadow-2xl'
            }`}
            style={{ animationDelay: `${delay}ms` }}
        >
            {/* Background decoration */}
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full transition-transform group-hover:scale-150"></div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full transition-transform group-hover:scale-150"></div>

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col items-center justify-center text-center">
                <Icon size={56} className="mb-4 drop-shadow-lg group-hover:scale-110 transition-transform" />
                <h3 className="text-xl md:text-2xl font-bold">{item.title}</h3>
            </div>

            {/* Badge */}
            {badge && (
                <div className={`absolute top-3 right-3 ${badgeColor} text-white text-xs font-bold px-2 py-1 rounded-full`}>
                    {badge}
                </div>
            )}
        </div>
    );

    if (item.comingSoon) {
        return (
            <div className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
                {content}
            </div>
        );
    }

    return (
        <Link
            to={item.path}
            className="animate-fade-in block"
            style={{ animationDelay: `${delay}ms` }}
            tabIndex={disabled ? -1 : undefined}
            onClick={(e) => onMenuClick(item, lockState, e)}
        >
            {content}
        </Link>
    );
}
