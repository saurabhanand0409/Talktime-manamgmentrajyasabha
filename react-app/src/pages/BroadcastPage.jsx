import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Maximize2 } from 'lucide-react';

const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }
    if (typeof window !== 'undefined') {
        const { protocol, hostname } = window.location;
        return `${protocol}//${hostname}:5000`;
    }
    return 'http://localhost:5000';
};

const timeToSeconds = (time = {}) => {
    if (!time) return 0;
    const hours = time.hours || 0;
    const minutes = time.minutes || 0;
    const seconds = time.seconds || 0;
    return hours * 3600 + minutes * 60 + seconds;
};

const secondsToTime = (totalSeconds = 0) => {
    const safeSeconds = Math.max(0, totalSeconds);
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = safeSeconds % 60;
    return { hours: h, minutes: m, seconds: s };
};

const API_BASE_URL = getApiBaseUrl();

// Party abbreviation to full name mapping
const PARTY_FULL_NAMES = {
    'BJP': 'Bharatiya Janata Party',
    'INC': 'Indian National Congress',
    'CONGRESS': 'Indian National Congress',
    'AAP': 'Aam Aadmi Party',
    'TMC': 'All India Trinamool Congress',
    'TMC(M)': 'Tamil Manila Congress (Moopanar)',
    'TMC (M)': 'Tamil Manila Congress (Moopanar)',
    'AITC': 'All India Trinamool Congress',
    'DMK': 'Dravida Munnetra Kazhagam',
    'AIADMK': 'All India Anna Dravida Munnetra Kazhagam',
    'SP': 'Samajwadi Party',
    'BSP': 'Bahujan Samaj Party',
    'NCP': 'Nationalist Congress Party',
    'NCP-SCP': 'Nationalist Congress Party (Sharad Chandra Pawar)',
    'SS': 'Shiv Sena',
    'SS-UBT': 'Shiv Sena (Uddhav Balasaheb Thackeray)',
    'TDP': 'Telugu Desam Party',
    'YSRCP': 'YSR Congress Party',
    'JD(U)': 'Janata Dal (United)',
    'JDU': 'Janata Dal (United)',
    'RJD': 'Rashtriya Janata Dal',
    'RLD': 'Rashtriya Lok Dal',
    'BJD': 'Biju Janata Dal',
    'CPI': 'Communist Party of India',
    'CPI(M)': 'Communist Party of India (Marxist)',
    'CPIM': 'Communist Party of India (Marxist)',
    'TRS': 'Telangana Rashtra Samithi',
    'BRS': 'Bharat Rashtra Samithi',
    'JMM': 'Jharkhand Mukti Morcha',
    'SAD': 'Shiromani Akali Dal',
    'AGP': 'Asom Gana Parishad',
    'MNS': 'Maharashtra Navnirman Sena',
    'IUML': 'Indian Union Muslim League',
    'KC': 'Kerala Congress',
    'KC(M)': 'Kerala Congress (M)',
    'KC (M)': 'Kerala Congress (M)',
    'JD(S)': 'Janata Dal (Secular)',
    'LJP': 'Lok Janshakti Party',
    'MNM': 'Makkal Needhi Maiam',
    'MNF': 'Mizo National Front',
    'NPP': "National People's Party",
    'RLSP': 'Rashtriya Lok Samata Party',
    'RPI(A)': 'Republican Party of India (Athawale)',
    'RPI (A)': 'Republican Party of India (Athawale)',
    'UPP(L)': "United People's Party (Liberal)",
    'UPP (L)': "United People's Party (Liberal)",
    'NOMINATED': 'NOM',
    'NOM': 'NOM',
    'IND': 'Independent',
    'INDEPENDENT': 'Independent',
    'OTHERS': 'OTH'
};

export default function BroadcastPage() {
    const [searchParams] = useSearchParams();
    
    // Parse data from URL params - default to 'Idle' if no type specified
    const typeParam = searchParams.get('type');
    const isRemoteMode = searchParams.get('remote') === '1';
    const isIdleMode = !typeParam || typeParam === 'Idle';
    const type = typeParam || 'Idle';
    const billName = searchParams.get('billName') || '';
    const chairpersonParam = searchParams.get('chairperson') || '';
    const chairpersonPosition = searchParams.get('chairpersonPosition') || '';
    const memberDataStr = searchParams.get('memberData');
    const partyTimeDataStr = searchParams.get('partyTimeData');
    const initialTimeStr = searchParams.get('initialTime');
    
    const memberDataParsed = memberDataStr ? JSON.parse(decodeURIComponent(memberDataStr)) : null;
    const partyTimeDataParsed = partyTimeDataStr ? JSON.parse(decodeURIComponent(partyTimeDataStr)) : null;
    const initialTimeFromParams = initialTimeStr ? JSON.parse(decodeURIComponent(initialTimeStr)) : { hours: 0, minutes: 0, seconds: 0 };
    const memberTimeDataStr = searchParams.get('memberTimeData');
    const memberTimeDataParsed = memberTimeDataStr ? JSON.parse(decodeURIComponent(memberTimeDataStr)) : { allocated: 0, isAllocated: false };
    
    // Parse chairperson photo from URL params (for idle mode)
    const chairpersonPhotoParam = searchParams.get('chairpersonPhoto') || '';

    // Initial payload injected by opener window to avoid flicker (e.g., current chairperson photo)
    let initialWindowPayload = null;
    if (typeof window !== 'undefined' && window.__BROADCAST_INITIAL_DATA__) {
        initialWindowPayload = window.__BROADCAST_INITIAL_DATA__;
        try {
            delete window.__BROADCAST_INITIAL_DATA__;
        } catch {
            // ignore
        }
    }
    
    const derivedInitialTime = initialWindowPayload?.initialTime || initialTimeFromParams;
    const derivedMemberData = initialWindowPayload?.memberData ?? memberDataParsed;
    const derivedPartyTimeData = initialWindowPayload?.partyTimeData ?? partyTimeDataParsed;
    const derivedMemberTimeData = initialWindowPayload?.memberTimeData ?? memberTimeDataParsed;
    const derivedChairperson = initialWindowPayload?.chairperson ?? chairpersonParam;
    const derivedChairPosition = initialWindowPayload?.chairpersonPosition ?? chairpersonPosition;
    const derivedChairPhoto = initialWindowPayload?.chairpersonPhoto ?? (chairpersonPhotoParam || null);
    const derivedBillName = initialWindowPayload?.billName ?? billName;
    const derivedBroadcastMode = initialWindowPayload?.broadcastMode ?? (isIdleMode ? 'Idle' : type);
    const derivedCustomHeading = initialWindowPayload?.customHeading ?? '';

    const [currentTime, setCurrentTime] = useState(new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // State for dynamic data that can be updated from parent
    const [memberData, setMemberData] = useState(derivedMemberData);
    const [partyTimeData, setPartyTimeData] = useState(derivedPartyTimeData);
    const [memberTimeData, setMemberTimeData] = useState(derivedMemberTimeData);
    const [chairperson, setChairperson] = useState(derivedChairperson);
    const [chairPosition, setChairPosition] = useState(derivedChairPosition);
    const [currentBillName, setCurrentBillName] = useState(derivedBillName);
    const [chairpersonPhoto, setChairpersonPhoto] = useState(derivedChairPhoto);
    const [broadcastMode, setBroadcastMode] = useState(derivedBroadcastMode);
    const [customHeading, setCustomHeading] = useState(derivedCustomHeading);
    const [isPaused, setIsPaused] = useState(false);
    
    // State for message broadcasts (Obituary/Birthday)
    const [messageData, setMessageData] = useState(null);
    const [messageEntries, setMessageEntries] = useState([]);
    const [messageIndex, setMessageIndex] = useState(0);
    
    // Ref to track current member data for message handler (avoids stale closure)
    const memberDataRef = useRef(derivedMemberData);
    const remoteTimerRef = useRef({
        baseSeconds: timeToSeconds(derivedMemberData ? derivedInitialTime : { hours: 0, minutes: 0, seconds: 0 }),
        lastSyncMs: Date.now(),
        isPaused: true
    });
    
    // Timer state - controlled entirely by parent window messages
    const [displayTime, setDisplayTime] = useState({ 
        hours: derivedInitialTime.hours || 0, 
        minutes: derivedInitialTime.minutes || 0, 
        seconds: derivedInitialTime.seconds || 0 
    });
    
    // Pause indicator state
    
    // Zero Hour timer duration (configurable, default 3 minutes)
    const [zhTimerDuration, setZhTimerDuration] = useState(3);
    
    // Track if chairperson data received from parent (to avoid overriding with API fetch)
    const [receivedFromParent, setReceivedFromParent] = useState(!!initialWindowPayload);
    
    // Fetch chairperson data for idle mode (only if not received from parent)
    useEffect(() => {
        if (isRemoteMode) {
            setReceivedFromParent(true);
            return;
        }
        const fetchChairpersonData = async () => {
            // Skip if we already received data from parent
            if (receivedFromParent) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/chairpersons`);
                const data = await response.json();
                if (data.success && data.data.length > 0) {
                    // Find selected chairperson or use the first one
                    const selected = data.data.find(c => c.is_selected) || data.data[0];
                    if (selected) {
                        setChairperson(selected.name);
                        setChairPosition(selected.position);
                        setChairpersonPhoto(selected.picture);
                    }
                }
            } catch (error) {
                console.error('Error fetching chairperson:', error);
            }
        };
        
        if (broadcastMode === 'Idle' && !receivedFromParent) {
            fetchChairpersonData();
            // Only refresh if not received from parent
            const interval = setInterval(() => {
                if (!receivedFromParent) fetchChairpersonData();
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [broadcastMode, receivedFromParent, isRemoteMode]);
    
    const isGenericChairLabel = (position = '') => {
        if (!position) return false;
        return /in\s+the\s+chair/i.test(position.trim());
    };

    // Chairperson display helpers
    const normalizeChairTitle = (position = '') => position.trim().toLowerCase();
    const isChairTitleOnly = (position = '') => {
        const pos = normalizeChairTitle(position);
        return pos === 'chairman' || pos === 'deputy chairman';
    };
    const getChairTitleLabel = (position = '') => {
        const pos = normalizeChairTitle(position);
        if (pos === 'chairman') return "HON'BLE CHAIRMAN";
        if (pos === 'deputy chairman') return 'DEPUTY CHAIRMAN';
        return null;
    };

    // For Chairman/Deputy Chairman show only the title (with "Hon." for Chairman); otherwise include the name
    const getChairpersonDisplay = () => {
        const positionTrimmed = (chairPosition || '').trim();
        const titleLabel = getChairTitleLabel(positionTrimmed);
        if (positionTrimmed && isChairTitleOnly(positionTrimmed)) {
            return titleLabel || positionTrimmed.toUpperCase();
        }
        if (!chairperson) return 'Not Selected';
        
        if (chairPosition && !isGenericChairLabel(chairPosition)) {
            return `${chairPosition} - ${chairperson}`;
        }
        // For other "In The Chair" members, just show the name
        return chairperson;
    };

    // Maximize window on mount
    useEffect(() => {
        try {
            window.moveTo(0, 0);
            window.resizeTo(screen.availWidth, screen.availHeight);
        } catch {
            console.log('Window resize not allowed');
        }
        
        // Listen for fullscreen changes
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Toggle fullscreen function
    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch {
            console.log('Fullscreen not supported');
        }
    };

    // Try to enter fullscreen (called from message handler or on user interaction)
    const tryEnterFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                setIsFullscreen(true);
            }
        } catch {
            console.log('Fullscreen request failed (requires user gesture)');
        }
    };

    // Track fullscreen state changes (e.g., when user presses ESC)
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Keep memberDataRef in sync with memberData state
    useEffect(() => {
        memberDataRef.current = memberData;
        console.log('memberDataRef updated:', memberData?.seat_no);
    }, [memberData]);

    // Listen for messages from parent window - ONLY update display, don't run own timer
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data.type === 'TIMER_UPDATE' || event.data.type === 'TIMER_SYNC') {
                // Update display time from parent
                if (event.data.hours !== undefined) {
                    setDisplayTime({
                        hours: event.data.hours || 0,
                        minutes: event.data.minutes || 0,
                        seconds: event.data.seconds || 0
                    });
                }
                if (event.data.time) {
                    setDisplayTime(event.data.time);
                }
            } else if (event.data.type === 'DATA_UPDATE') {
                // Update member/chairperson/bill data from parent
                if (event.data.memberData !== undefined) {
                    setMemberData(event.data.memberData);
                }
                if (event.data.chairperson !== undefined) {
                    setChairperson(event.data.chairperson);
                }
                if (event.data.chairpersonPosition !== undefined) {
                    setChairPosition(event.data.chairpersonPosition);
                }
                if (event.data.chairpersonPhoto !== undefined) {
                    setChairpersonPhoto(event.data.chairpersonPhoto);
                }
                // Mark that we received chairperson data from parent
                if (event.data.chairperson !== undefined || event.data.chairpersonPhoto !== undefined) {
                    setReceivedFromParent(true);
                }
                if (event.data.partyTimeData !== undefined) {
                    setPartyTimeData(event.data.partyTimeData);
                }
                if (event.data.memberTimeData !== undefined) {
                    setMemberTimeData(event.data.memberTimeData);
                }
                if (event.data.billName !== undefined) {
                    setCurrentBillName(event.data.billName);
                }
                if (event.data.customHeading !== undefined) {
                    setCustomHeading(event.data.customHeading || '');
                }
                if (event.data.timerDuration !== undefined) {
                    setZhTimerDuration(event.data.timerDuration);
                }
                // Handle member allocations update from Bill Details page
                if (event.data.memberAllocationsUpdated !== undefined) {
                    // Use ref to get current member data (avoids stale closure)
                    const currentMemberData = memberDataRef.current;
                    const currentSeat = currentMemberData?.seat_no?.toString();
                    console.log('Checking allocation for seat:', currentSeat, 'with allocations:', event.data.memberAllocationsUpdated);
                    if (currentSeat) {
                        // Try both string and number keys
                        const allocation = event.data.memberAllocationsUpdated[currentSeat] || 
                                          event.data.memberAllocationsUpdated[parseInt(currentSeat)];
                        if (allocation) {
                            console.log('Updating member allocation:', allocation);
                            setMemberTimeData(allocation);
                        }
                    }
                }
                // Handle broadcast mode change
                if (event.data.broadcastMode !== undefined) {
                    setBroadcastMode(event.data.broadcastMode);
                }
                // Handle message data updates (Obituary/Birthday)
                if (event.data.messageData !== undefined) {
                    setMessageData(event.data.messageData);
                }
                if (event.data.currentIndex !== undefined) {
                    setMessageIndex(event.data.currentIndex);
                }
            } else if (event.data.type === 'TIMER_PAUSED') {
                setIsPaused(!!event.data.isPaused);
            } else if (event.data.type === 'START_BROADCAST' || event.data.type === 'BROADCAST_START') {
                // Switch from idle to active broadcast mode (triggered by timer start)
                console.log('START_BROADCAST received:', event.data);
                setBroadcastMode(event.data.broadcastType || 'Zero Hour');
                if (event.data.customHeading !== undefined) {
                    setCustomHeading(event.data.customHeading || '');
                }
                setIsPaused(false); // Clear pause state when starting
                
                // Handle message broadcasts (Obituary/Birthday)
                if (event.data.messageData) {
                    setMessageData(event.data.messageData);
                }
                if (event.data.messageEntries) {
                    setMessageEntries(event.data.messageEntries);
                }
                if (event.data.currentIndex !== undefined) {
                    setMessageIndex(event.data.currentIndex);
                }
                
                if (event.data.memberData) setMemberData(event.data.memberData);
                if (event.data.chairperson) {
                    setChairperson(event.data.chairperson);
                    setReceivedFromParent(true);
                }
                if (event.data.chairpersonPosition) setChairPosition(event.data.chairpersonPosition);
                if (event.data.partyTimeData) setPartyTimeData(event.data.partyTimeData);
                if (event.data.memberTimeData) setMemberTimeData(event.data.memberTimeData);
                if (event.data.billName) setCurrentBillName(event.data.billName);
                if (event.data.customHeading !== undefined) setCustomHeading(event.data.customHeading || '');
                // Set timer duration for Zero Hour
                if (event.data.timerDuration) {
                    setZhTimerDuration(event.data.timerDuration);
                }
                if (event.data.initialTime) {
                    setDisplayTime({
                        hours: event.data.initialTime.hours || 0,
                        minutes: event.data.initialTime.minutes || 0,
                        seconds: event.data.initialTime.seconds || 0
                    });
                } else {
                    setDisplayTime({ hours: 0, minutes: 0, seconds: 0 });
                }
            } else if (event.data.type === 'BROADCAST_END') {
                // Switch back to idle mode with chairperson data
                setBroadcastMode('Idle');
                setMemberData(null);
                setMessageData(null);
                setMessageEntries([]);
                setMessageIndex(0);
                setDisplayTime({ hours: 0, minutes: 0, seconds: 0 });
                // Update chairperson from parent data
                if (event.data.chairperson) {
                    setChairperson(event.data.chairperson);
                    setReceivedFromParent(true);
                }
                if (event.data.chairpersonPosition) {
                    setChairPosition(event.data.chairpersonPosition);
                }
                if (event.data.chairpersonPhoto) {
                    setChairpersonPhoto(event.data.chairpersonPhoto);
                }
            } else if (event.data.type === 'REQUEST_FULLSCREEN') {
                // Request fullscreen from parent window
                tryEnterFullscreen();
            }
        };
        
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Remote viewer mode - poll backend for broadcast state
    useEffect(() => {
        if (!isRemoteMode) return;
        let isMounted = true;

        const fetchRemoteState = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/broadcast-feed?_=${Date.now()}`, {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                const data = await response.json();
                if (!isMounted || !data.success) return;
                const state = data.state || {};
                const payload = state.payload || {};
                setBroadcastMode(state.is_active ? (state.mode || 'Idle') : 'Idle');
                setMemberData(payload.memberData || null);
                setPartyTimeData(payload.partyTimeData || null);
                setMemberTimeData(payload.memberTimeData || { allocated: 0, isAllocated: false });
                setChairperson(payload.chairperson || '');
                setChairPosition(payload.chairpersonPosition || '');
                setCurrentBillName(payload.billName || '');
                // Set custom heading for Member Speaking
                if (payload.customHeading !== undefined) {
                    setCustomHeading(payload.customHeading);
                }
                // Set message data for Obituary/Birthday
                if (payload.messageData !== undefined) {
                    setMessageData(payload.messageData);
                }
                // Set chairperson photo for remote viewers
                if (payload.chairpersonPhoto !== undefined) {
                    setChairpersonPhoto(payload.chairpersonPhoto);
                }
                const payloadTime = payload.displayTime || { hours: 0, minutes: 0, seconds: 0 };
                const payloadSeconds = typeof payload.displayTimeSeconds === 'number'
                    ? payload.displayTimeSeconds
                    : timeToSeconds(payloadTime);
                const timerTimestamp = payload.timerTimestamp ? Number(payload.timerTimestamp) : null;
                const isPausedState = !state.is_active || !!payload.isPaused;
                const now = Date.now();
                const lagSeconds = timerTimestamp && !isPausedState
                    ? Math.max(0, Math.floor((now - timerTimestamp) / 1000))
                    : 0;
                const adjustedBase = payloadSeconds + lagSeconds;

                remoteTimerRef.current = {
                    baseSeconds: adjustedBase,
                    lastSyncMs: now,
                    isPaused: isPausedState
                };
                setDisplayTime(secondsToTime(adjustedBase));

                if (payload.zhTimerDuration) {
                    setZhTimerDuration(payload.zhTimerDuration);
                }
                setIsPaused(!!payload.isPaused);
                setReceivedFromParent(true);
            } catch (error) {
                console.error('Remote broadcast fetch error:', error);
            }
        };

        fetchRemoteState();
        const interval = setInterval(fetchRemoteState, 1000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isRemoteMode]);

    useEffect(() => {
        if (!isRemoteMode) return;
        const interval = setInterval(() => {
            const { baseSeconds, lastSyncMs, isPaused } = remoteTimerRef.current;
            if (isPaused) return;
            const delta = Math.max(0, Math.floor((Date.now() - lastSyncMs) / 1000));
            setDisplayTime(secondsToTime(baseSeconds + delta));
        }, 300);
        return () => clearInterval(interval);
    }, [isRemoteMode]);

    // Update clock every second (only the current time, not the timer)
    useEffect(() => {
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(clockInterval);
    }, []);

    const formatTime = (h, m, s) => {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');
    };

    const formatClock = (date) => {
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    // Format party time display
    const formatPartyTime = (seconds) => {
        if (seconds === undefined || seconds === null) return '00:00:00';
        const safeSeconds = Math.max(0, Math.floor(Math.abs(seconds)));
        const h = Math.floor(safeSeconds / 3600);
        const m = Math.floor((safeSeconds % 3600) / 60);
        const s = safeSeconds % 60;
        return formatTime(h, m, s);
    };

    const formatSignedPartyTime = (seconds) => {
        if (seconds === undefined || seconds === null) return '00:00:00';
        const prefix = seconds < 0 ? '-' : '';
        return `${prefix}${formatPartyTime(seconds)}`;
    };

// Short form for party names; show NOM for nominated
const getPartyShortName = (party) => {
    if (!party) return '-';
    const upper = party.trim().toUpperCase();
    if (upper.includes('NOM')) return 'NOM';
    const words = upper.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        const acronym = words.map(w => w[0]).join('');
        return acronym.slice(0, 6);
    }
    return upper.length > 10 ? upper.slice(0, 10) : upper;
};

    const getPrimaryTimerDisplay = () => {
        if (broadcastMode === 'Zero Hour') {
            return getZHRemaining().text;
        }
        if (broadcastMode === 'Bill Discussion') {
            return formatPartyTime(bdMemberTotals.total);
        }
        return formatTime(displayTime.hours, displayTime.minutes, displayTime.seconds);
    };

    // displayTime is always the elapsed/spoken time (Timer component now sends elapsed for countdown mode)
    const getSpokenSeconds = () => {
        return displayTime.hours * 3600 + displayTime.minutes * 60 + displayTime.seconds;
    };

    const getBillDiscussionMemberTotals = () => {
        const session = getSpokenSeconds();
        if (broadcastMode !== 'Bill Discussion' || !memberTimeData) {
            return { base: 0, session, total: session };
        }
        const base = memberTimeData.spokenBase || 0;
        return {
            base,
            session,
            total: base + session
        };
    };

    const getBillDiscussionPartyStats = () => {
        const session = getSpokenSeconds();
        if (broadcastMode !== 'Bill Discussion' || !partyTimeData) {
            return { totalSpoken: session, diff: 0 };
        }
        const consumedBase = partyTimeData.consumed || 0;
        const totalSpoken = consumedBase + session;
        const allocated = partyTimeData.allocated || 0;
        return {
            totalSpoken,
            diff: allocated - totalSpoken
        };
    };

    const bdMemberTotals = getBillDiscussionMemberTotals();
    const bdPartyStats = getBillDiscussionPartyStats();

    // Calculate remaining time for Zero Hour (duration - elapsed)
    const getZHRemaining = () => {
        const elapsedSeconds = getSpokenSeconds();
        const totalSeconds = zhTimerDuration * 60; // Use configurable duration
        const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
        const m = Math.floor(remainingSeconds / 60);
        const s = remainingSeconds % 60;
        const isOver = elapsedSeconds > totalSeconds;
        return { text: formatTime(0, m, s), isOver };
    };
    
    // Get formatted allotted time for Zero Hour
    const getZHAllotted = () => {
        return formatTime(0, zhTimerDuration, 0);
    };
    
    // Check if Zero Hour time is up (when remaining time is 0 or elapsed >= duration)
    const isZHTimeUp = () => {
        if (broadcastMode !== 'Zero Hour') return false;
        const elapsedSeconds = getSpokenSeconds();
        const totalSeconds = zhTimerDuration * 60;
        const remainingSeconds = totalSeconds - elapsedSeconds;
        // Show message when elapsed >= total OR remaining <= 0
        return elapsedSeconds >= totalSeconds || remainingSeconds <= 0;
    };

    // Get full party name from abbreviation
    const getFullPartyName = (partyAbbr) => {
        if (!partyAbbr) return '-';
        const upperParty = partyAbbr.trim().toUpperCase();
        
        // Check for nominated/independent
        if (upperParty === 'NOM' || upperParty === 'NOMINATED') return 'NOM';
        if (upperParty === 'IND' || upperParty === 'INDEPENDENT') return 'IND';
        if (upperParty === 'OTH' || upperParty === 'OTHERS') return 'OTH';
        
        // Look up in mapping
        return PARTY_FULL_NAMES[upperParty] || PARTY_FULL_NAMES[partyAbbr] || partyAbbr;
    };

    const renderIdleView = () => (
        <div className="h-screen bg-[#ffe8e8] flex flex-col overflow-hidden">
            {!isFullscreen && (
                <button
                    onClick={toggleFullscreen}
                    className="fixed top-4 right-4 z-50 bg-red-600/20 hover:bg-red-600/30 text-red-800 p-3 rounded-lg shadow-lg transition-all"
                    title="Click for Fullscreen"
                >
                    <Maximize2 size={28} />
                </button>
            )}
            <div className="flex-1 flex flex-col items-center justify-center p-10">
                <h1 className="text-5xl md:text-7xl font-bold text-[#a00000] uppercase tracking-wider mb-12">
                    IN THE CHAIR
                </h1>
                <div className="mb-10">
                    {chairpersonPhoto ? (
                        <img
                            src={`data:image/jpeg;base64,${chairpersonPhoto}`}
                            alt={chairperson}
                            className="w-56 h-64 md:w-64 md:h-72 object-cover rounded-2xl border-4 border-[#a00000] shadow-2xl"
                        />
                    ) : (
                        <div className="w-56 h-64 md:w-64 md:h-72 rounded-2xl border-4 border-[#a00000] bg-red-100 flex items-center justify-center text-[#a00000] text-5xl font-extrabold shadow-inner">
                            ?
                        </div>
                    )}
                </div>
                <div className="text-center mb-10">
                    {(() => {
                        const titleLabel = getChairTitleLabel(chairPosition);
                        if (titleLabel) {
                            return (
                                <p className="text-5xl md:text-7xl font-bold text-[#a00000] uppercase tracking-wide">
                                    {titleLabel}
                                </p>
                            );
                        }
                        return (
                            <>
                                {chairPosition && !isGenericChairLabel(chairPosition) && (
                                    <p className="text-3xl md:text-4xl font-bold text-[#a00000] mb-3 uppercase tracking-wide">
                                        {chairPosition}
                                    </p>
                                )}
                                <p className="text-5xl md:text-7xl font-bold text-[#a00000]">
                                    {chairperson || 'Not Selected'}
                                </p>
                            </>
                        );
                    })()}
                </div>
                <div className="text-center">
                    <p className="text-4xl md:text-5xl text-[#a00000] mb-4">{formatDate(currentTime)}</p>
                    <p className="text-7xl md:text-8xl text-[#a00000] font-mono font-bold">{formatClock(currentTime)}</p>
                </div>
            </div>
        </div>
    );

    const renderActiveView = () => (
        <div className="h-screen flex flex-col overflow-hidden bg-[#ffe8e8]">
            {!isFullscreen && (
                <button
                    onClick={toggleFullscreen}
                    className="fixed top-4 right-4 z-50 bg-red-600/20 hover:bg-red-600/30 text-red-800 p-3 rounded-lg shadow-lg transition-all"
                    title="Click for Fullscreen"
                >
                    <Maximize2 size={28} />
                </button>
            )}
            {/* Title - Centered at top */}
            <div className="text-center py-4 border-b border-red-300 px-4">
                <h1 className={`font-extrabold text-[#a00000] ${
                    broadcastMode === 'Zero Hour'
                        ? 'text-3xl md:text-4xl lg:text-5xl whitespace-nowrap'
                        : broadcastMode === 'Bill Discussion'
                            ? (() => {
                                const billLen = (currentBillName || '').length;
                                if (billLen > 80) return 'text-xl md:text-2xl lg:text-3xl';
                                if (billLen > 50) return 'text-2xl md:text-3xl lg:text-4xl';
                                if (billLen > 30) return 'text-3xl md:text-4xl lg:text-5xl';
                                return 'text-4xl md:text-5xl lg:text-6xl';
                              })()
                            : 'text-3xl md:text-4xl lg:text-5xl whitespace-nowrap'
                }`}>
                    {broadcastMode === 'Bill Discussion' ? (
                        <span>DISCUSSION: {currentBillName || 'No Bill Selected'}</span>
                    ) : broadcastMode === 'Zero Hour' ? (
                        <span>MATTERS RAISED WITH THE PERMISSION OF CHAIR</span>
                    ) : (
                        <span>{(customHeading || broadcastMode || 'Member Speaking').toUpperCase()}</span>
                    )}
                </h1>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-6 flex flex-col min-h-0 overflow-hidden">
                {/* Member Info Section */}
                <div className="flex gap-6 md:gap-10 mb-4 flex-1 min-h-0">
                    {/* Photo and Seat Info Column */}
                    <div className="flex-shrink-0 flex flex-col">
                        {memberData?.picture ? (
                            <img
                                src={`data:image/jpeg;base64,${memberData.picture}`}
                                alt={memberData.name}
                                className="w-36 h-44 md:w-44 md:h-56 object-cover border-4 border-[#a00000] rounded shadow-lg"
                            />
                        ) : (
                            <div className="w-36 h-44 md:w-44 md:h-56 bg-red-100 border-4 border-[#a00000] rounded flex items-center justify-center shadow-lg">
                                <span className="text-[#a00000]/50 text-5xl">?</span>
                            </div>
                        )}
                        {/* Seat No below photo */}
                        <div className="text-7xl md:text-8xl font-bold text-[#a00000] mt-4">{memberData?.seat_no || '-'}</div>
                        <div className="text-2xl md:text-3xl font-extrabold text-[#a00000] mt-3">{formatDate(currentTime)}</div>
                        <div className="text-2xl md:text-3xl font-extrabold text-[#a00000]">{formatClock(currentTime)}</div>
                    </div>

                    {/* Member Details */}
                    <div className="flex-1">
                        <h2 className="text-4xl md:text-5xl font-black text-[#a00000] mb-3">
                            {memberData?.name || 'No Member Selected'}
                        </h2>
                        {/* Hindi Name - with gap from English name */}
                        {memberData?.name_hindi && (
                            <h3 className="text-3xl md:text-4xl font-black text-[#800000] mb-4">
                                {memberData.name_hindi}
                            </h3>
                        )}
                        {/* Full Party Name Display */}
                        <p className="text-4xl md:text-5xl text-[#800000] font-black mb-1 uppercase">
                            {getFullPartyName(memberData?.party)}
                        </p>
                        {/* State if available */}
                        {memberData?.state && (
                            <p className="text-xl text-[#a00000]/80 mb-4">
                                {memberData.state}
                            </p>
                        )}

                        {/* Timer Display - Show countdown for Zero Hour, elapsed for others */}
                        <div className="flex items-center gap-6 mb-6">
                            <div className={`text-5xl md:text-6xl font-mono font-bold ${
                                broadcastMode === 'Zero Hour' && getSpokenSeconds() > zhTimerDuration * 60
                                    ? 'text-red-600 animate-pulse'
                                    : 'text-[#a00000]'
                            }`}>
                                {getPrimaryTimerDisplay()}
                            </div>
                            {isPaused && (
                                <div className="bg-[#a00000] text-[#ffe8e8] px-6 py-3 rounded-xl font-black text-4xl animate-pulse-subtle shadow-lg">
                                    PAUSE
                                </div>
                            )}
                        </div>

                        {/* Time Table */}
                        {broadcastMode !== 'Member Speaking' && (
                            <div className={`bg-white/90 backdrop-blur rounded-lg overflow-hidden border border-white/30 origin-top mb-2 ${broadcastMode === 'Zero Hour' ? 'mt-6 md:mt-8' : ''}`}>
                                <table className="w-full table-fixed">
                                    <thead>
                                        <tr className="border-b-2 border-red-300">
                                            {broadcastMode === 'Zero Hour' ? (
                                                <>
                                                    <th className="w-1/3 px-5 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl bg-[#f5d5d5]">Time Allotted</th>
                                                    <th className="w-1/3 px-5 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl border-l-2 border-red-300 bg-[#f5d5d5]">Spoken</th>
                                                    <th className="w-1/3 px-5 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl border-l-2 border-red-300 bg-[#f5d5d5]">Remaining</th>
                                                </>
                                            ) : broadcastMode === 'Bill Discussion' ? (
                                                <>
                                                    <th className="w-[35%] px-6 py-4 text-left text-[#a00000] font-black text-4xl md:text-5xl bg-[#f5d5d5]">Time</th>
                                                    <th className="w-[20.83%] px-6 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl border-l-2 border-red-300 bg-[#f5d5d5]">Allotted</th>
                                                    <th className="w-[20.83%] px-6 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl border-l-2 border-red-300 bg-[#f5d5d5]">Spoken</th>
                                                    <th className="w-[23.33%] px-6 py-4 text-center text-[#a00000] font-black text-4xl md:text-5xl border-l-2 border-red-300 bg-[#f5d5d5]">Remaining</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="w-1/4 px-4 py-3 text-left text-gray-800 font-extrabold text-[37px] md:text-[46px]">Party</th>
                                                    <th className="w-1/4 px-4 py-3 text-center text-gray-800 font-extrabold text-[37px] md:text-[46px] border-l-2 border-red-300">Time Allotted</th>
                                                    <th className="w-1/4 px-4 py-3 text-center text-gray-800 font-extrabold text-[37px] md:text-[46px] border-l-2 border-red-300">Spoken</th>
                                                    <th className="w-1/4 px-4 py-3 text-center text-gray-800 font-extrabold text-[37px] md:text-[46px] border-l-2 border-red-300">Remaining</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {broadcastMode === 'Zero Hour' && (
                                            <tr className="bg-white">
                                                <td className="w-1/3 px-5 py-4 text-center font-mono font-black text-[#a00000] text-4xl md:text-5xl">
                                                    {getZHAllotted()}
                                                </td>
                                                <td className={`w-1/3 px-5 py-4 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300 ${
                                                    getSpokenSeconds() > zhTimerDuration * 60 ? 'text-red-600 animate-pulse' : 'text-[#a00000]'
                                                }`}>
                                                    {formatTime(displayTime.hours, displayTime.minutes, displayTime.seconds)}
                                                </td>
                                                {(() => {
                                                    const remaining = getZHRemaining();
                                                    const over = getSpokenSeconds() > zhTimerDuration * 60;
                                                    return (
                                                        <td className={`w-1/3 px-5 py-4 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300 ${
                                                            over ? 'text-red-600 animate-pulse' : 'text-green-600'
                                                        }`}>
                                                            {remaining.text}
                                                        </td>
                                                    );
                                                })()}
                                            </tr>
                                        )}
                        {broadcastMode === 'Bill Discussion' && (
                            <>
                                {/* Member row - only show when member has allocated time */}
                                {memberTimeData?.isAllocated && (
                                    <tr className="bg-white">
                                        <td className="w-[35%] px-6 py-5 text-left font-black text-[#a00000] text-4xl md:text-5xl">
                                            Member
                                        </td>
                                        <td className="w-[20.83%] px-6 py-5 text-center font-mono font-black text-[#a00000] text-4xl md:text-5xl border-l-2 border-red-300">
                                            {formatPartyTime(memberTimeData.allocated)}
                                        </td>
                                        <td className="w-[20.83%] px-6 py-5 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300 text-[#a00000]">
                                            {formatPartyTime(bdMemberTotals.total)}
                                        </td>
                                        <td className="w-[23.33%] px-6 py-5 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300">
                                            {(() => {
                                                const allocated = memberTimeData?.allocated || 0;
                                                const diff = allocated - bdMemberTotals.total;
                                                return (
                                                    <span className={diff < 0 ? 'text-red-600' : 'text-green-600'}>
                                                        {formatSignedPartyTime(diff)}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                )}

                                {/* Party row */}
                                {partyTimeData && (
                                    <tr className={`bg-white ${memberTimeData?.isAllocated ? 'border-t-2 border-red-300' : ''}`}>
                                        <td className="w-[35%] px-6 py-5 text-left font-black text-[#a00000] text-4xl md:text-5xl">
                                            Party '{getPartyShortName(partyTimeData.effectiveParty || memberData?.party)}'
                                        </td>
                                        <td className="w-[20.83%] px-6 py-5 text-center font-mono font-black text-[#a00000] text-4xl md:text-5xl border-l-2 border-red-300">
                                            {formatPartyTime(partyTimeData.allocated)}
                                        </td>
                                        <td className="w-[20.83%] px-6 py-5 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300 text-[#a00000]">
                                            {formatPartyTime(bdPartyStats.totalSpoken)}
                                        </td>
                                        <td className="w-[23.33%] px-6 py-5 text-center font-mono font-black text-4xl md:text-5xl border-l-2 border-red-300">
                                            <span className={bdPartyStats.diff < 0 ? 'text-red-600' : 'text-green-600'}>
                                                {formatSignedPartyTime(bdPartyStats.diff)}
                                            </span>
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        
                        {/* Zero Hour - Speaking Time Over Message - shows when remaining time is 0 */}
                        {broadcastMode === 'Zero Hour' && isZHTimeUp() && (
                            <div className="flex-1 flex items-end justify-center pb-4 mt-12 md:mt-14">
                                <div className="w-full rounded-xl bg-[#a00000] py-4 shadow-2xl animate-pulse-soft">
                                    <p className="text-3xl md:text-4xl font-black text-[#ffe8e8] text-center uppercase tracking-widest">
                                        SPEAKING TIME IS OVER
                                    </p>
                                </div>
                            </div>
                        )}

                    {broadcastMode === 'Bill Discussion' && memberTimeData?.isAllocated && bdMemberTotals.total > (memberTimeData?.allocated || 0) && (
                            <div className="flex-1 flex items-end justify-center pb-4">
                                <div className="w-full rounded-xl bg-[#a00000] py-4 shadow-2xl animate-pulse-soft">
                                    <p className="text-3xl md:text-4xl font-black text-[#ffe8e8] text-center uppercase tracking-widest">
                                        SPEAKING TIME IS OVER
                                    </p>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
                
                {/* In The Chair - At bottom of content area */}
                <div className="bg-[#e8b4b4] rounded-lg px-8 py-4 mt-auto">
                    <p className="text-3xl md:text-4xl font-black text-[#a00000]">
                        <span className="uppercase">IN THE CHAIR:</span>{' '}
                        <span>{getChairpersonDisplay()}</span>
                    </p>
                </div>
            </div>
        </div>
    );

    // Obituary broadcast view - Red background with white/yellow text, centered (no timer)
    const renderObituaryView = () => {
        if (!messageData) return renderIdleView();
        
        return (
            <div className="h-screen flex flex-col overflow-hidden bg-[#ffe8e8]">
                {!isFullscreen && (
                    <button
                        onClick={toggleFullscreen}
                        className="fixed top-4 right-4 z-50 bg-red-600/20 hover:bg-red-600/30 text-red-800 p-3 rounded-lg shadow-lg transition-all"
                        title="Click for Fullscreen"
                    >
                        <Maximize2 size={28} />
                    </button>
                )}
                
                <div className="flex-1 flex flex-col m-8">
                    {/* Border Container */}
                    <div className="flex-1 border-4 border-[#a00000]/30 rounded-lg flex flex-col overflow-hidden">
                        {/* Header Banner */}
                        <div className="bg-[#a00000]/10 text-[#a00000] text-center py-6 px-8">
                            <p className="text-5xl md:text-6xl font-extrabold tracking-wide">
                                दिवंगत के प्रति श्रद्धांजलि / OBITUARY REFERENCE
                            </p>
                        </div>
                        
                        {/* Content - Centered */}
                        <div className="flex-1 p-12 flex items-center justify-center gap-16">
                            {/* Photo with frame */}
                            <div className="flex-shrink-0">
                                <div className="p-2 bg-white rounded-lg shadow-2xl border-2 border-[#a00000]/30">
                                    {messageData.photo ? (
                                        <img 
                                            src={`data:image/jpeg;base64,${messageData.photo}`}
                                            alt={messageData.nameEnglish}
                                            className="w-64 h-80 object-cover"
                                        />
                                    ) : (
                                        <div className="w-64 h-80 flex items-center justify-center text-[#a00000] text-8xl font-extrabold bg-red-100">
                                            ?
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Details - Centered */}
                            <div className="flex flex-col justify-center">
                                <p className="text-6xl font-extrabold text-[#800000] mb-3">{messageData.nameHindi || ''}</p>
                                <p className="text-5xl font-extrabold text-[#a00000] mb-4">{messageData.nameEnglish}</p>
                                <p className="text-3xl font-bold text-[#a00000]/80 mb-8">
                                    ({messageData.birthDateDisplay || '-'} – {messageData.deathDateDisplay || '-'})
                                </p>
                                
                                {messageData.termsDisplay && messageData.termsDisplay.length > 0 && (
                                    <div className="bg-[#a00000]/10 rounded-xl p-6 text-center">
                                        <p className="font-extrabold text-[#800000] text-4xl mb-4">कार्यकाल / TERM</p>
                                        {messageData.termsDisplay.map((term, idx) => (
                                            <p key={idx} className="text-[#a00000] font-bold text-3xl">
                                                {term.start} - {term.end}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Birthday broadcast view - Light pink background with dark red text
    const renderBirthdayView = () => {
        if (!messageData) return renderIdleView();
        
        const day = messageData.birthDay || '';
        const month = messageData.birthMonth || '';
        const suffix = day === 1 || day === 21 || day === 31 ? 'st' : 
                      day === 2 || day === 22 ? 'nd' : 
                      day === 3 || day === 23 ? 'rd' : 'th';
        
        return (
            <div className="h-screen flex flex-col overflow-hidden bg-[#ffe8e8]">
                {!isFullscreen && (
                    <button
                        onClick={toggleFullscreen}
                        className="fixed top-4 right-4 z-50 bg-red-600/20 hover:bg-red-600/30 text-red-800 p-3 rounded-lg shadow-lg transition-all"
                        title="Click for Fullscreen"
                    >
                        <Maximize2 size={28} />
                    </button>
                )}
                
                <div className="flex-1 flex flex-col m-8">
                    {/* Border Container */}
                    <div className="flex-1 border-4 border-[#a00000]/30 rounded-lg flex flex-col overflow-hidden">
                        {/* Header Banner */}
                        <div className="bg-[#a00000]/10 text-[#a00000] text-center py-6 px-8">
                            <p className="text-4xl font-bold text-[#800000]">जन्मदिन की शुभकामनाएँ</p>
                            <p className="text-5xl md:text-6xl font-extrabold">BIRTHDAY GREETINGS</p>
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 p-12 flex items-center justify-center gap-16">
                            {/* Photo */}
                            <div className="flex-shrink-0">
                                {messageData.photo ? (
                                    <img 
                                        src={`data:image/jpeg;base64,${messageData.photo}`}
                                        alt={messageData.nameEnglish}
                                        className="w-64 h-80 object-cover rounded-lg border-4 border-[#a00000] shadow-2xl"
                                    />
                                ) : (
                                    <div className="w-64 h-80 rounded-lg border-4 border-[#a00000] flex items-center justify-center text-[#a00000] text-8xl font-extrabold shadow-2xl bg-red-100">
                                        ?
                                    </div>
                                )}
                            </div>
                            
                            {/* Details */}
                            <div className="text-center">
                                <p className="text-5xl md:text-6xl font-extrabold text-[#800000] mb-8">{day}{suffix} {month}</p>
                                <p className="text-5xl md:text-6xl font-bold text-[#800000] mb-2">{messageData.nameHindi || ''}</p>
                                <p className="text-5xl md:text-6xl font-extrabold text-[#a00000]">{messageData.nameEnglish}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Determine which view to render
    if (broadcastMode === 'Obituary') {
        return renderObituaryView();
    } else if (broadcastMode === 'Birthday') {
        return renderBirthdayView();
    } else if (broadcastMode === 'Idle') {
        return renderIdleView();
    } else {
        return renderActiveView();
    }
}

