import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

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

const API_BASE_URL = getApiBaseUrl();

const BroadcastContext = createContext();

const getSecondsFromTime = (time = {}) => {
    if (!time) return 0;
    const hours = time.hours || 0;
    const minutes = time.minutes || 0;
    const seconds = time.seconds || 0;
    return hours * 3600 + minutes * 60 + seconds;
};

const buildTimerPayload = (time = { hours: 0, minutes: 0, seconds: 0 }) => ({
    displayTime: time,
    displayTimeSeconds: getSecondsFromTime(time),
    timerTimestamp: Date.now()
});

export function BroadcastProvider({ children }) {
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [broadcastType, setBroadcastType] = useState(null); // 'Zero Hour', 'Member Speaking', 'Bill Discussion'
    const [isBroadcastWindowReady, setIsBroadcastWindowReady] = useState(false);
    const broadcastWindowRef = useRef(null);
    const checkIntervalRef = useRef(null);
    
    // Store current chairperson data for idle mode
    const [currentChairperson, setCurrentChairperson] = useState({
        name: '',
        position: '',
        picture: null
    });
    
    // Global timer state that persists across page navigation
    const [globalTimerState, setGlobalTimerState] = useState({
        hours: 0,
        minutes: 0,
        seconds: 0,
        isRunning: false,
        mode: 'countup', // 'countup' or 'countdown'
        initialHours: 0,
        initialMinutes: 0,
        initialSeconds: 0
    });
    const timerIntervalRef = useRef(null);
    const timerStartTimeRef = useRef(null); // When timer was started (for accurate timing)
    const timerBaseElapsedRef = useRef(0); // Elapsed seconds when timer was last started/resumed
    
    // Store broadcast data for restoration when returning to page
    const [broadcastData, setBroadcastData] = useState(null);
    const remoteStateRef = useRef({
        is_active: false,
        mode: 'Idle',
        payload: {}
    });
    const lastRemoteSyncRef = useRef(0);
    const prevIsRunningRef = useRef(globalTimerState.isRunning);

    const pushRemoteState = useCallback((nextState = {}) => {
        const shouldReplacePayload = nextState.replacePayload;
        const payloadPatch = nextState.payload || {};
        const mergedPayload = shouldReplacePayload
            ? payloadPatch
            : { ...remoteStateRef.current.payload, ...payloadPatch };
        const mergedState = {
            is_active: nextState.is_active !== undefined ? nextState.is_active : remoteStateRef.current.is_active,
            mode: nextState.mode !== undefined ? nextState.mode : remoteStateRef.current.mode,
            payload: mergedPayload
        };
        remoteStateRef.current = mergedState;
        fetch(`${API_BASE_URL}/api/broadcast-feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mergedState)
        }).catch(() => { });
    }, []);

    // Send message to broadcast window
    const sendToBroadcast = useCallback((message) => {
        if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            broadcastWindowRef.current.postMessage(message, '*');
        }
    }, []);
    
    // Get elapsed time for broadcast
    // NOTE: globalTimerState now always stores ELAPSED time (even for countdown mode)
    const getElapsedForBroadcast = useCallback(() => {
        const { hours, minutes, seconds } = globalTimerState;
        return { hours, minutes, seconds };
    }, [globalTimerState]);
    
    // Global timer tick - runs independently of page components
    // Uses timestamp-based timing to avoid browser throttling issues when tab is in background
    // NOTE: For countdown mode, globalTimerState stores ELAPSED time (counts up from 0)
    useEffect(() => {
        if (globalTimerState.isRunning && isBroadcasting) {
            if (!timerStartTimeRef.current) {
                timerStartTimeRef.current = Date.now();
            }
            timerIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const elapsedSinceStart = Math.floor((now - timerStartTimeRef.current) / 1000);
                const totalElapsed = timerBaseElapsedRef.current + elapsedSinceStart;
                const newHours = Math.floor(totalElapsed / 3600);
                const newMinutes = Math.floor((totalElapsed % 3600) / 60);
                const newSeconds = totalElapsed % 60;
                setGlobalTimerState(prev => {
                    if (!prev.isRunning) return prev;
                    return { ...prev, hours: newHours, minutes: newMinutes, seconds: newSeconds };
                });
            }, 250);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
            if (timerStartTimeRef.current) {
                const elapsed = Math.floor((Date.now() - timerStartTimeRef.current) / 1000);
                timerBaseElapsedRef.current += elapsed;
                timerStartTimeRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [globalTimerState.isRunning, isBroadcasting]);
    
    // Send timer updates to broadcast window when timer state changes
    useEffect(() => {
        const elapsed = getElapsedForBroadcast();
        if (isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            sendToBroadcast({
                type: 'TIMER_UPDATE',
                hours: elapsed.hours,
                minutes: elapsed.minutes,
                seconds: elapsed.seconds,
                isRunning: globalTimerState.isRunning
            });
        }
        if (isBroadcasting) {
            const now = Date.now();
            const hasRunStateChanged = prevIsRunningRef.current !== globalTimerState.isRunning;
            if (hasRunStateChanged) {
                prevIsRunningRef.current = globalTimerState.isRunning;
            }
            if (hasRunStateChanged || now - lastRemoteSyncRef.current > 900) {
                lastRemoteSyncRef.current = now;
                const elapsedSeconds = getSecondsFromTime(elapsed);
                pushRemoteState({
                    payload: {
                        displayTime: elapsed,
                        displayTimeSeconds: elapsedSeconds,
                        timerTimestamp: now,
                        isPaused: !globalTimerState.isRunning
                    }
                });
            }
        } else {
            prevIsRunningRef.current = globalTimerState.isRunning;
        }
    }, [globalTimerState.hours, globalTimerState.minutes, globalTimerState.seconds, globalTimerState.isRunning, isBroadcasting, getElapsedForBroadcast, sendToBroadcast, pushRemoteState]);
    
    // Start global timer
    const startGlobalTimer = useCallback(() => {
        timerStartTimeRef.current = Date.now();
        setGlobalTimerState(prev => ({ ...prev, isRunning: true }));
    }, []);
    
    // Stop global timer
    const stopGlobalTimer = useCallback(() => {
        // Save elapsed time before stopping AND update state to reflect current elapsed
        if (timerStartTimeRef.current) {
            const elapsed = Math.floor((Date.now() - timerStartTimeRef.current) / 1000);
            const newTotalElapsed = timerBaseElapsedRef.current + elapsed;
            console.log('BroadcastContext stopGlobalTimer: adding', elapsed, 'to timerBaseElapsedRef (was', timerBaseElapsedRef.current, ', becomes', newTotalElapsed, ')');
            timerBaseElapsedRef.current = newTotalElapsed;
            timerStartTimeRef.current = null;
            
            // Update state with current elapsed time so it's correct when paused
            const h = Math.floor(newTotalElapsed / 3600);
            const m = Math.floor((newTotalElapsed % 3600) / 60);
            const s = newTotalElapsed % 60;
            setGlobalTimerState(prev => ({ 
                ...prev, 
                hours: h,
                minutes: m,
                seconds: s,
                isRunning: false 
            }));
        } else {
            console.log('BroadcastContext stopGlobalTimer: no timerStartTimeRef, timerBaseElapsedRef stays at', timerBaseElapsedRef.current);
            setGlobalTimerState(prev => ({ ...prev, isRunning: false }));
        }
    }, []);
    
    // Set global timer state (from page component)
    const setGlobalTimer = useCallback((timerData) => {
        if (timerData.hours !== undefined || timerData.minutes !== undefined || timerData.seconds !== undefined) {
            const newElapsed = (timerData.hours || 0) * 3600 + (timerData.minutes || 0) * 60 + (timerData.seconds || 0);
            console.log('BroadcastContext setGlobalTimer: setting timerBaseElapsedRef from', timerBaseElapsedRef.current, 'to', newElapsed);
            timerBaseElapsedRef.current = newElapsed;
            if (timerData.isRunning) {
                timerStartTimeRef.current = Date.now();
            }
        }
        console.log('BroadcastContext setGlobalTimer: timerData=', timerData, 'timerBaseElapsedRef=', timerBaseElapsedRef.current);
        setGlobalTimerState(prev => ({
            ...prev,
            ...timerData
        }));
    }, []);
    
    // Reset global timer
    const resetGlobalTimer = useCallback((initialData = {}) => {
        timerBaseElapsedRef.current = 0;
        timerStartTimeRef.current = null;
        setGlobalTimerState({
            hours: initialData.hours || 0,
            minutes: initialData.minutes || 0,
            seconds: initialData.seconds || 0,
            isRunning: false,
            mode: initialData.mode || 'countup',
            initialHours: initialData.initialHours || 0,
            initialMinutes: initialData.initialMinutes || 0,
            initialSeconds: initialData.initialSeconds || 0
        });
    }, []);

    const assignInitialPayloadToWindow = useCallback((payload) => {
        if (!payload) return;
        const targetWindow = broadcastWindowRef.current;
        if (targetWindow && !targetWindow.closed) {
            try {
                targetWindow.__BROADCAST_INITIAL_DATA__ = payload;
            } catch (err) {
                console.warn('Unable to assign initial broadcast payload', err);
            }
        }
    }, []);

    // Open broadcast window in idle mode (for auto-start)
    const openIdleBroadcast = useCallback(() => {
        // Don't open if already have a window
        const idlePayload = {
            broadcastMode: 'Idle',
            memberData: null,
            partyTimeData: null,
            memberTimeData: null,
            chairperson: currentChairperson.name,
            chairpersonPosition: currentChairperson.position,
            chairpersonPhoto: currentChairperson.picture,
            billName: '',
            initialTime: { hours: 0, minutes: 0, seconds: 0 }
        };

        if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            setIsBroadcastWindowReady(true);
            assignInitialPayloadToWindow(idlePayload);
            try {
                broadcastWindowRef.current.focus();
            } catch {
                // ignore
            }
            // Push idle state for remote viewers
            pushRemoteState({
                is_active: false,
                mode: 'Idle',
                replacePayload: true,
                payload: {
                    memberData: null,
                    partyTimeData: null,
                    memberTimeData: null,
                    chairperson: currentChairperson.name,
                    chairpersonPosition: currentChairperson.position,
                    chairpersonPhoto: currentChairperson.picture,
                    billName: '',
                    ...buildTimerPayload({ hours: 0, minutes: 0, seconds: 0 }),
                    isPaused: false
                }
            });
            return broadcastWindowRef.current;
        }
        
        // Open broadcast window in idle mode
        const broadcastUrl = `/broadcast`;
        broadcastWindowRef.current = window.open(
            broadcastUrl,
            'BroadcastWindow',
            `fullscreen=yes,width=${screen.availWidth},height=${screen.availHeight},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`
        );
        
        if (broadcastWindowRef.current) {
            setIsBroadcastWindowReady(true);
            assignInitialPayloadToWindow(idlePayload);
            
            // Push idle state for remote viewers
            pushRemoteState({
                is_active: false,
                mode: 'Idle',
                replacePayload: true,
                payload: {
                    memberData: null,
                    partyTimeData: null,
                    memberTimeData: null,
                    chairperson: currentChairperson.name,
                    chairpersonPosition: currentChairperson.position,
                    chairpersonPhoto: currentChairperson.picture,
                    billName: '',
                    ...buildTimerPayload({ hours: 0, minutes: 0, seconds: 0 }),
                    isPaused: false
                }
            });
            
            // Try to maximize
            setTimeout(() => {
                try {
                    broadcastWindowRef.current.moveTo(0, 0);
                    broadcastWindowRef.current.resizeTo(screen.availWidth, screen.availHeight);
                } catch { /* ignore */ }
            }, 100);
            
            // Monitor window close
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
            checkIntervalRef.current = setInterval(() => {
                if (!broadcastWindowRef.current || broadcastWindowRef.current.closed) {
                    clearInterval(checkIntervalRef.current);
                    checkIntervalRef.current = null;
                    broadcastWindowRef.current = null;
                    setIsBroadcastWindowReady(false);
                    setIsBroadcasting(false);
                    setBroadcastType(null);
                    setBroadcastData(null);
                }
            }, 500);
        }
        
        return broadcastWindowRef.current;
    }, [pushRemoteState, currentChairperson, assignInitialPayloadToWindow]);
    
    // Start broadcast for a specific type (called when timer starts on ZH/MS/BD pages)
    // This switches from idle mode to active broadcast mode
    const startBroadcastType = useCallback((data) => {
        // If no broadcast window, don't do anything (broadcast must be opened from dashboard first)
        if (!broadcastWindowRef.current || broadcastWindowRef.current.closed) {
            console.log('No broadcast window open - broadcast must be opened from Dashboard first');
            return false;
        }
        
        // Update current chairperson
        if (data.chairperson) {
            setCurrentChairperson({
                name: data.chairperson,
                position: data.chairpersonPosition || '',
                picture: data.chairpersonPhoto || null
            });
        }
        
        // Store broadcast data
        setBroadcastData(data);
        
        // Send data to existing broadcast window
        broadcastWindowRef.current.postMessage({
            type: 'START_BROADCAST',
            broadcastType: data.type,
            billName: data.billName || '',
            memberData: data.memberData,
            chairperson: data.chairperson || '',
            chairpersonPosition: data.chairpersonPosition || '',
            partyTimeData: data.partyTimeData,
            memberTimeData: data.memberTimeData,
            initialTime: data.initialTime,
            timerDuration: data.timerDuration || 3, // Default 3 minutes for ZH
            customHeading: data.customHeading || ''
        }, '*');
        
        setIsBroadcasting(true);
        setBroadcastType(data.type);
        
        // Initialize global timer
        const timerMode = data.type === 'Zero Hour' ? 'countdown' : 'countup';
        const zhDuration = data.timerDuration || 3; // Minutes
        // Set base elapsed to initial time (so timer starts from there, e.g., resuming a member's previous total)
        const initialH = data.initialTime?.hours || 0;
        const initialM = data.initialTime?.minutes || 0;
        const initialS = data.initialTime?.seconds || 0;
        timerBaseElapsedRef.current = initialH * 3600 + initialM * 60 + initialS;
        timerStartTimeRef.current = null;
        setGlobalTimerState({
            hours: initialH,
            minutes: initialM,
            seconds: initialS,
            isRunning: false,
            mode: timerMode,
            initialHours: 0,
            initialMinutes: timerMode === 'countdown' ? zhDuration : 0,
            initialSeconds: 0
        });
        
        pushRemoteState({
            is_active: true,
            mode: data.type || 'Idle',
            replacePayload: true,
            payload: {
                memberData: data.memberData || null,
                partyTimeData: data.partyTimeData || null,
                memberTimeData: data.memberTimeData || null,
                chairperson: data.chairperson || '',
                chairpersonPosition: data.chairpersonPosition || '',
                chairpersonPhoto: data.chairpersonPhoto || currentChairperson.picture || null,
                billName: data.billName || '',
                customHeading: data.customHeading || '',
                ...buildTimerPayload(data.initialTime || { hours: 0, minutes: 0, seconds: 0 }),
                zhTimerDuration: data.timerDuration || 3,
                isPaused: false
            }
        });
        
        return true;
    }, [pushRemoteState, currentChairperson]);
    
    // Check if broadcast window is open
    const isBroadcastWindowOpen = useCallback(() => {
        return broadcastWindowRef.current && !broadcastWindowRef.current.closed;
    }, []);

    // Open broadcast window
    const openBroadcast = useCallback((data) => {
        // Store broadcast data for later restoration
        setBroadcastData(data);
        
        // Update current chairperson
        if (data.chairperson) {
            setCurrentChairperson({
                name: data.chairperson,
                position: data.chairpersonPosition || '',
                picture: data.chairpersonPhoto || null
            });
        }
        
        // If already broadcasting, just update the data
        if (isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            // Update the broadcast window with new data
            sendToBroadcast({
                type: 'DATA_UPDATE',
                ...data
            });
            setBroadcastType(data.type);
            return true;
        }

        const buildInitialPayload = () => ({
            broadcastMode: data.type || 'Idle',
            memberData: data.memberData || null,
            partyTimeData: data.partyTimeData || null,
            memberTimeData: data.memberTimeData || null,
            chairperson: data.chairperson || '',
            chairpersonPosition: data.chairpersonPosition || '',
            chairpersonPhoto: data.chairpersonPhoto || null,
            billName: data.billName || '',
            initialTime: data.initialTime || { hours: 0, minutes: 0, seconds: 0 },
            customHeading: data.customHeading || ''
        });

        // Helper to build URL params
        const buildUrlParams = () => {
            const params = new URLSearchParams();
            params.set('type', data.type || '');
            params.set('billName', data.billName || '');
            params.set('chairperson', data.chairperson || '');
            params.set('chairpersonPosition', data.chairpersonPosition || '');
            if (data.memberData) {
                params.set('memberData', encodeURIComponent(JSON.stringify(data.memberData)));
            }
            if (data.partyTimeData) {
                params.set('partyTimeData', encodeURIComponent(JSON.stringify(data.partyTimeData)));
            }
            if (data.memberTimeData) {
                params.set('memberTimeData', encodeURIComponent(JSON.stringify(data.memberTimeData)));
            }
            if (data.initialTime) {
                params.set('initialTime', encodeURIComponent(JSON.stringify(data.initialTime)));
            }
            return params;
        };

        // If window is already open in idle mode, navigate it to the new URL with broadcast data
        if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            setIsBroadcastWindowReady(true);
            // Navigate the existing window to the broadcast URL
            const params = buildUrlParams();
            const broadcastUrl = `/broadcast?${params.toString()}`;
            assignInitialPayloadToWindow(buildInitialPayload());
            broadcastWindowRef.current.location.href = broadcastUrl;
            
            // Request fullscreen after navigation
            setTimeout(() => {
                if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
                    broadcastWindowRef.current.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
                }
            }, 500);
            
            setIsBroadcasting(true);
            setBroadcastType(data.type);
            
            // Initialize global timer
            if (data.initialTime) {
                const mode = data.type === 'Zero Hour' ? 'countdown' : 'countup';
                setGlobalTimerState({
                    hours: data.initialTime.hours || 0,
                    minutes: data.initialTime.minutes || 0,
                    seconds: data.initialTime.seconds || 0,
                    isRunning: false,
                    mode: mode,
                    initialHours: mode === 'countdown' ? 0 : 0,
                    initialMinutes: mode === 'countdown' ? 3 : 0,
                    initialSeconds: mode === 'countdown' ? 0 : 0
                });
            }
            
            // Monitor for window close
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
            checkIntervalRef.current = setInterval(() => {
                if (!broadcastWindowRef.current || broadcastWindowRef.current.closed) {
                    clearInterval(checkIntervalRef.current);
                    checkIntervalRef.current = null;
                    setIsBroadcasting(false);
                    setIsBroadcastWindowReady(false);
                    broadcastWindowRef.current = null;
                }
            }, 500);
            
            return true;
        }

        // Open new window - maximized fullscreen
        const params = buildUrlParams();
        const broadcastUrl = `/broadcast?${params.toString()}`;
        broadcastWindowRef.current = window.open(
            broadcastUrl,
            'BroadcastWindow',
            `fullscreen=yes,width=${screen.availWidth},height=${screen.availHeight},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`
        );

        if (broadcastWindowRef.current) {
            setIsBroadcasting(true);
            setBroadcastType(data.type);
            setIsBroadcastWindowReady(true);
            assignInitialPayloadToWindow(buildInitialPayload());
            
            // Initialize global timer with the initial time from broadcast data
            if (data.initialTime) {
                const mode = data.type === 'Zero Hour' ? 'countdown' : 'countup';
                setGlobalTimerState({
                    hours: data.initialTime.hours || 0,
                    minutes: data.initialTime.minutes || 0,
                    seconds: data.initialTime.seconds || 0,
                    isRunning: false,
                    mode: mode,
                    initialHours: mode === 'countdown' ? 0 : 0,
                    initialMinutes: mode === 'countdown' ? 3 : 0,
                    initialSeconds: mode === 'countdown' ? 0 : 0
                });
            }

            // Try to maximize the window and request fullscreen after it loads
            setTimeout(() => {
                try {
                    broadcastWindowRef.current.moveTo(0, 0);
                    broadcastWindowRef.current.resizeTo(screen.availWidth, screen.availHeight);
                    // Request fullscreen
                    broadcastWindowRef.current.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
                } catch { /* ignore */ }
            }, 500);

            // Clear any existing interval
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }

            // Monitor window close
            checkIntervalRef.current = setInterval(() => {
                if (!broadcastWindowRef.current || broadcastWindowRef.current.closed) {
                    clearInterval(checkIntervalRef.current);
                    checkIntervalRef.current = null;
                    setIsBroadcasting(false);
                    setBroadcastType(null);
                    setBroadcastData(null);
                    setIsBroadcastWindowReady(false);
                    broadcastWindowRef.current = null;
                    // Stop global timer when broadcast closes
                    setGlobalTimerState(prev => ({ ...prev, isRunning: false }));
                }
            }, 500);

            return true;
        }
        return false;
    }, [isBroadcasting, sendToBroadcast, assignInitialPayloadToWindow]);

    // Close broadcast window (but keep window open in idle mode with chairperson)
    const closeBroadcast = useCallback((closeWindow = false) => {
        if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        
        // Navigate back to idle mode instead of closing
        if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            if (closeWindow) {
                broadcastWindowRef.current.close();
                broadcastWindowRef.current = null;
                setIsBroadcastWindowReady(false);
            } else {
                // Send BROADCAST_END message first with chairperson data
                // This avoids URL length issues with base64 photo
                broadcastWindowRef.current.postMessage({
                    type: 'BROADCAST_END',
                    chairperson: currentChairperson.name,
                    chairpersonPosition: currentChairperson.position,
                    chairpersonPhoto: currentChairperson.picture
                }, '*');
                
                // Send message to request fullscreen after a short delay
                setTimeout(() => {
                    if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
                        broadcastWindowRef.current.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
                    }
                }, 300);
                setIsBroadcastWindowReady(true);
            }
        } else {
            setIsBroadcastWindowReady(false);
        }
        
        setIsBroadcasting(false);
        setBroadcastType(null);
        setBroadcastData(null);
        // Reset timer state and refs
        timerBaseElapsedRef.current = 0;
        timerStartTimeRef.current = null;
        setGlobalTimerState({
            hours: 0,
            minutes: 0,
            seconds: 0,
            isRunning: false,
            mode: 'countup',
            initialHours: 0,
            initialMinutes: 0,
            initialSeconds: 0
        });
        pushRemoteState({
            is_active: false,
            mode: 'Idle',
            replacePayload: true,
            payload: {
                memberData: null,
                partyTimeData: null,
                memberTimeData: null,
                chairperson: currentChairperson.name,
                chairpersonPosition: currentChairperson.position,
                chairpersonPhoto: currentChairperson.picture,
                billName: '',
                ...buildTimerPayload({ hours: 0, minutes: 0, seconds: 0 }),
                zhTimerDuration: 3,
                isPaused: false
            }
        });
    }, [currentChairperson, pushRemoteState]);

    // Update broadcast data (member, chairperson, etc.)
    const updateBroadcastData = useCallback((data) => {
        console.log('updateBroadcastData called:', { 
            isBroadcasting, 
            hasWindow: !!broadcastWindowRef.current, 
            isClosed: broadcastWindowRef.current?.closed,
            data 
        });
        if (isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            console.log('Sending DATA_UPDATE to broadcast window');
            sendToBroadcast({
                type: 'DATA_UPDATE',
                ...data
            });
            const payloadPatch = {};
            if (data.memberData !== undefined) payloadPatch.memberData = data.memberData;
            if (data.partyTimeData !== undefined) payloadPatch.partyTimeData = data.partyTimeData;
            if (data.memberTimeData !== undefined) payloadPatch.memberTimeData = data.memberTimeData;
            if (data.chairperson !== undefined) payloadPatch.chairperson = data.chairperson;
            if (data.chairpersonPosition !== undefined) payloadPatch.chairpersonPosition = data.chairpersonPosition;
            if (data.billName !== undefined) payloadPatch.billName = data.billName;
            if (data.customHeading !== undefined) payloadPatch.customHeading = data.customHeading;
            if (data.timerDuration !== undefined) payloadPatch.zhTimerDuration = data.timerDuration;
            if (Object.keys(payloadPatch).length > 0) {
                pushRemoteState({ payload: payloadPatch });
            }
        } else {
            console.log('Cannot send: conditions not met');
        }
    }, [isBroadcasting, sendToBroadcast, pushRemoteState]);
    
    // Update idle window chairperson (when not broadcasting)
    const updateIdleChairperson = useCallback((chairpersonData) => {
        // Update local broadcast window
        if (!isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            sendToBroadcast({
                type: 'DATA_UPDATE',
                chairperson: chairpersonData.name,
                chairpersonPosition: chairpersonData.position,
                chairpersonPhoto: chairpersonData.picture
            });
        }
        // Also push to backend for remote viewers
        pushRemoteState({
            is_active: false,
            mode: 'Idle',
            replacePayload: true,
            payload: {
                memberData: null,
                partyTimeData: null,
                memberTimeData: null,
                chairperson: chairpersonData.name || '',
                chairpersonPosition: chairpersonData.position || '',
                chairpersonPhoto: chairpersonData.picture || null,
                billName: '',
                ...buildTimerPayload({ hours: 0, minutes: 0, seconds: 0 }),
                isPaused: false
            }
        });
    }, [isBroadcasting, sendToBroadcast, pushRemoteState]);

    // Update timer display
    const updateTimer = useCallback((timeData) => {
        if (isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            sendToBroadcast({
                type: 'TIMER_UPDATE',
                ...timeData
            });
        }
    }, [isBroadcasting, sendToBroadcast]);

    // Sync timer (initial sync)
    const syncTimer = useCallback((timeData) => {
        if (isBroadcasting && broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            sendToBroadcast({
                type: 'TIMER_SYNC',
                ...timeData
            });
        }
    }, [isBroadcasting, sendToBroadcast]);

    // Set current chairperson (for external use, e.g., when chairperson changes)
    const setChairpersonData = useCallback((chairpersonData) => {
        const normalized = {
            name: chairpersonData.name || '',
            position: chairpersonData.position || '',
            picture: chairpersonData.picture || null
        };
        setCurrentChairperson(normalized);
        
        // If window is open (either broadcasting or idle), update it
        if (broadcastWindowRef.current && !broadcastWindowRef.current.closed) {
            sendToBroadcast({
                type: 'DATA_UPDATE',
                chairperson: normalized.name,
                chairpersonPosition: normalized.position,
                chairpersonPhoto: normalized.picture
            });
        }
        
        // Always push to backend for remote viewers
        pushRemoteState({
            payload: {
                chairperson: normalized.name,
                chairpersonPosition: normalized.position,
                chairpersonPhoto: normalized.picture
            }
        });
    }, [sendToBroadcast, pushRemoteState]);

    // Push message broadcast state (Obituary/Birthday) for LAN broadcast
    // This updates the remoteStateRef to stay in sync with direct API calls
    const pushMessageState = useCallback((messageType, messageData, isActive = true) => {
        pushRemoteState({
            is_active: isActive,
            mode: isActive ? messageType : 'Idle',
            replacePayload: true,
            payload: isActive ? {
                messageData: messageData,
                broadcastType: messageType,
                memberData: null,
                partyTimeData: null,
                memberTimeData: null,
                chairperson: currentChairperson.name || '',
                chairpersonPosition: currentChairperson.position || '',
                chairpersonPhoto: currentChairperson.picture || null,
                displayTime: { hours: 0, minutes: 0, seconds: 0 },
                displayTimeSeconds: 0,
                isPaused: false
            } : {
                messageData: null,
                memberData: null,
                partyTimeData: null,
                memberTimeData: null,
                chairperson: currentChairperson.name || '',
                chairpersonPosition: currentChairperson.position || '',
                chairpersonPhoto: currentChairperson.picture || null,
                displayTime: { hours: 0, minutes: 0, seconds: 0 },
                displayTimeSeconds: 0,
                isPaused: false
            }
        });
    }, [pushRemoteState, currentChairperson]);

    // Set message broadcast state (for Obituary/Birthday) - sets broadcast type without timer setup
    const setMessageBroadcastActive = useCallback((messageType, isActive) => {
        setIsBroadcasting(isActive);
        setBroadcastType(isActive ? messageType : null);
    }, []);

    return (
        <BroadcastContext.Provider value={{
            isBroadcasting,
            broadcastType,
            broadcastData,
            isBroadcastWindowReady,
            openBroadcast,
            closeBroadcast,
            openIdleBroadcast,
            startBroadcastType,
            isBroadcastWindowOpen,
            updateBroadcastData,
            updateIdleChairperson,
            updateTimer,
            syncTimer,
            sendToBroadcast,
            setChairpersonData,
            currentChairperson,
            // Message broadcasting (Obituary/Birthday)
            pushMessageState,
            setMessageBroadcastActive,
            // Global timer controls
            globalTimerState,
            startGlobalTimer,
            stopGlobalTimer,
            setGlobalTimer,
            resetGlobalTimer,
            getElapsedForBroadcast
        }}>
            {children}
        </BroadcastContext.Provider>
    );
}

export function useBroadcast() {
    const context = useContext(BroadcastContext);
    if (!context) {
        throw new Error('useBroadcast must be used within a BroadcastProvider');
    }
    return context;
}

