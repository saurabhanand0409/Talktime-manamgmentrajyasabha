import { useState, useRef, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Timer from '../components/Timer';
import MemberPanelCompact from '../components/MemberPanelCompact';
import ChairDisplay from '../components/ChairDisplay';
import { useSocket } from '../context/SocketContext';
import { useChairperson } from '../context/ChairpersonContext';
import { useBroadcast } from '../context/BroadcastContext';
import { Clock } from 'lucide-react';
import { getISTNow, formatISTForMySQL, normalizeSeatNo, seatsEqual } from '../utils/timezone';

const ZH_TIMER_SNAPSHOT_KEY = 'zh_timer_snapshot';
const ZH_TIMER_DURATION_KEY = 'zh_timer_duration';

// Helper to get saved timer duration
const getSavedTimerDuration = () => {
    try {
        const saved = sessionStorage.getItem(ZH_TIMER_DURATION_KEY);
        if (saved) {
            const duration = parseInt(saved, 10);
            if (!isNaN(duration) && duration >= 1 && duration <= 15) {
                return duration;
            }
        }
    } catch (e) {
        console.warn('Error reading timer duration', e);
    }
    return 3; // default
};

export default function ZeroHour() {
    const { selectedSeat, setSelectedSeat, memberData } = useSocket();
    const { chairperson, selectedChairpersonData } = useChairperson();
    const { setChairpersonData, isBroadcasting, globalTimerState, startBroadcastType, isBroadcastWindowOpen, startGlobalTimer, updateBroadcastData, setGlobalTimer, sendToBroadcast } = useBroadcast();
    const [showAlert, setShowAlert] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [timerMinutes, setTimerMinutes] = useState(getSavedTimerDuration);
    const [pendingTimerMinutes, setPendingTimerMinutes] = useState(null);
    const [showTimerConfirm, setShowTimerConfirm] = useState(false);
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);
    const prevMemberRef = useRef(null);
    const prevSeatRef = useRef(null);
    const isTimerRunningRef = useRef(false);
    const isInitialMountRef = useRef(true);
    const isBroadcastingRef = useRef(false);
    const initialTimeSeconds = timerMinutes * 60;
    
    // Flags to control auto-start behavior
    const suppressAutoStartRef = useRef(false);
    const didRestoreFromGlobalRef = useRef(false);
    const isResumingFromPauseRef = useRef(false);
    const pausedElapsedRef = useRef(0);
    
    // Store paused times per seat - when a member is paused and seat is changed,
    // their paused time is stored here so it can be restored when switching back
    const seatPausedTimesRef = useRef({});
    
    // Track if timer is in "paused with time" state - more reliable than checking isTimerRunningRef
    const isPausedWithTimeRef = useRef(false);
    
    // Keep broadcasting ref in sync
    useEffect(() => {
        isBroadcastingRef.current = isBroadcasting;
    }, [isBroadcasting]);
    
    // Sync isTimerRunningRef with actual timer state (handles resume from paused where handleTimerStart isn't called)
    useEffect(() => {
        const timerIsRunning = timerRef.current?.isRunning?.() || globalTimerState.isRunning;
        
        // If timer just started running (transition from not-running to running)
        if (timerIsRunning && !isTimerRunningRef.current) {
            console.log('ZH: Timer started running (detected via state sync)');
            isTimerRunningRef.current = true;
            isPausedWithTimeRef.current = false;
            
            // Clear stored paused time for current seat since timer is now running
            const currentSeatNormalized = normalizeSeatNo(selectedSeat);
            if (currentSeatNormalized && seatPausedTimesRef.current[currentSeatNormalized]) {
                console.log('ZH: Clearing stored paused time for seat', currentSeatNormalized);
                delete seatPausedTimesRef.current[currentSeatNormalized];
            }
            
            // Ensure startTimeRef is set if resuming
            if (!startTimeRef.current && pausedElapsedRef.current > 0) {
                startTimeRef.current = new Date(getISTNow().getTime() - pausedElapsedRef.current * 1000);
            } else if (!startTimeRef.current) {
                startTimeRef.current = getISTNow();
            }
        }
        
        // If timer just stopped (transition from running to not-running)
        if (!timerIsRunning && isTimerRunningRef.current) {
            // Don't set to false here - let handleTimerPause/handleTimerEnd handle it
            // This is just for detecting start, not stop
        }
    }, [globalTimerState.isRunning, selectedSeat]);

    // Get broadcast data for starting broadcast
    const getBroadcastData = () => {
        return {
            type: 'Zero Hour',
            memberData: memberData ? {
                name: memberData.name,
                name_hindi: memberData.name_hindi,
                party: memberData.party,
                state: memberData.state,
                seat_no: selectedSeat,
                picture: memberData.picture
            } : null,
            chairperson: selectedChairpersonData?.name || '',
            chairpersonPosition: selectedChairpersonData?.position || '',
            chairpersonPhoto: selectedChairpersonData?.picture || null,
            initialTime: { hours: 0, minutes: 0, seconds: 0 },
            timerDuration: timerMinutes
        };
    };

    const clearPausedSnapshot = () => {
        if (typeof window === 'undefined') return;
        sessionStorage.removeItem(ZH_TIMER_SNAPSHOT_KEY);
    };

    const persistPausedSnapshot = () => {
        if (typeof window === 'undefined') return;
        if (!timerRef.current?.getTime) return;
        const timeState = timerRef.current.getTime();
        if (!timeState) return;
        const snapshot = {
            hours: timeState.hours ?? 0,
            minutes: timeState.minutes ?? 0,
            seconds: timeState.seconds ?? 0,
            timerMinutes,
            startTime: startTimeRef.current ? startTimeRef.current.toISOString() : null,
            prevMember: prevMemberRef.current,
            prevSeat: prevSeatRef.current,
            elapsedSeconds,
            selectedSeat
        };
        try {
            sessionStorage.setItem(ZH_TIMER_SNAPSHOT_KEY, JSON.stringify(snapshot));
        } catch (err) {
            console.warn('Unable to persist Zero Hour snapshot', err);
        }
    };

    // On mount: restore state from global timer (if broadcasting) or from snapshot (if paused)
    useEffect(() => {
        if (!isInitialMountRef.current) return;
        isInitialMountRef.current = false;
        
        // Case 1: Broadcasting and global timer is RUNNING - sync and keep running
        if (isBroadcasting && globalTimerState.isRunning) {
            console.log('ZH: Returning with running broadcast, syncing from global');
            const globalElapsed = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
            const remaining = Math.max(0, initialTimeSeconds - globalElapsed);
            const remainingMins = Math.floor(remaining / 60);
            const remainingSecs = remaining % 60;
            
            startTimeRef.current = new Date(getISTNow().getTime() - globalElapsed * 1000);
            setElapsedSeconds(globalElapsed);
            isTimerRunningRef.current = true;
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
            prevMemberRef.current = { 
                name: memberData?.name, 
                seat: normalizeSeatNo(selectedSeat), 
                seat_no: normalizeSeatNo(memberData?.seat_no || selectedSeat),
                party: memberData?.party || ''
            };
            
            suppressAutoStartRef.current = true;
            didRestoreFromGlobalRef.current = true;
            
            // Use setTimeout to ensure timerRef is available
            setTimeout(() => {
                if (timerRef.current) {
                    timerRef.current.setTimeFromGlobal(0, remainingMins, remainingSecs);
                    timerRef.current.startSilent();
                }
            }, 50);
            return;
        }
        
        // Case 2: Broadcasting but global timer is PAUSED - sync paused state
        if (isBroadcasting && !globalTimerState.isRunning && 
            (globalTimerState.hours > 0 || globalTimerState.minutes > 0 || globalTimerState.seconds > 0)) {
            console.log('ZH: Returning with paused broadcast, syncing from global');
            const globalElapsed = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
            const remaining = Math.max(0, initialTimeSeconds - globalElapsed);
            const remainingMins = Math.floor(remaining / 60);
            const remainingSecs = remaining % 60;
            
            setElapsedSeconds(globalElapsed);
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
            
            suppressAutoStartRef.current = true;
            didRestoreFromGlobalRef.current = true;
            isResumingFromPauseRef.current = true;
            pausedElapsedRef.current = globalElapsed;
            
            setTimeout(() => {
                if (timerRef.current) {
                    timerRef.current.hydrateFromSnapshot({
                        hours: 0,
                        minutes: remainingMins,
                        seconds: remainingSecs,
                        markStarted: true,
                        skipGlobalUpdate: true
                    });
                }
            }, 50);
            return;
        }
        
        // Case 3: Not broadcasting - check for paused snapshot
        const stored = sessionStorage.getItem(ZH_TIMER_SNAPSHOT_KEY);
        if (stored) {
            try {
                const snapshot = JSON.parse(stored);
                console.log('ZH: Restoring from paused snapshot', snapshot);
                
                if (snapshot.timerMinutes && snapshot.timerMinutes !== timerMinutes) {
                    setTimerMinutes(snapshot.timerMinutes);
                }
                if (snapshot.startTime) {
                    startTimeRef.current = new Date(snapshot.startTime);
                }
                if (snapshot.prevMember) {
                    prevMemberRef.current = snapshot.prevMember;
                }
                if (snapshot.prevSeat) {
                    prevSeatRef.current = normalizeSeatNo(snapshot.prevSeat);
                }
                if (typeof snapshot.elapsedSeconds === 'number') {
                    setElapsedSeconds(snapshot.elapsedSeconds);
                    pausedElapsedRef.current = snapshot.elapsedSeconds;
                }
                if (snapshot.selectedSeat && !seatsEqual(snapshot.selectedSeat, selectedSeat)) {
                    setSelectedSeat(normalizeSeatNo(snapshot.selectedSeat));
                }
                
                suppressAutoStartRef.current = true;
                isResumingFromPauseRef.current = true;
                
                setTimeout(() => {
                    if (timerRef.current) {
                        timerRef.current.hydrateFromSnapshot({
                            hours: snapshot.hours || 0,
                            minutes: snapshot.minutes || 0,
                            seconds: snapshot.seconds || 0,
                            markStarted: true,
                            skipGlobalUpdate: true
                        });
                    }
                }, 50);
                return;
            } catch (err) {
                console.warn('Invalid Zero Hour snapshot, clearing...', err);
                sessionStorage.removeItem(ZH_TIMER_SNAPSHOT_KEY);
            }
        }
        
        // Case 4: Fresh start - set prev seat ref
        prevSeatRef.current = normalizeSeatNo(selectedSeat);
    }, []); // Only run once on mount

    // Handle seat change - Reset timer when new member is loaded
    useEffect(() => {
        // Skip on initial mount (handled above)
        if (didRestoreFromGlobalRef.current) {
            didRestoreFromGlobalRef.current = false;
            return;
        }
        
        // Only process if seat actually changed (normalize to handle leading zeros like "01" vs "1")
        if (selectedSeat && !seatsEqual(selectedSeat, prevSeatRef.current) && prevSeatRef.current !== null) {
            const prevSeatNormalized = normalizeSeatNo(prevSeatRef.current);
            const newSeatNormalized = normalizeSeatNo(selectedSeat);
            console.log('ZH: Seat changed from', prevSeatNormalized, 'to', newSeatNormalized);
            
            // Check if timer was RUNNING (not paused) - only log if running
            // If paused, the time is "held" and stored for later restoration
            // Check both our ref AND the Timer component's internal state for reliability
            const wasTimerRunning = isTimerRunningRef.current || timerRef.current?.isRunning?.();
            const isPaused = timerRef.current?.isPaused?.() || isPausedWithTimeRef.current;
            
            // Get current timer state for elapsed time
            const currentTimerState = timerRef.current?.getTime?.();
            const timerElapsed = currentTimerState?.totalElapsed || 
                (currentTimerState 
                    ? Math.max(0, initialTimeSeconds - (currentTimerState.hours * 3600 + currentTimerState.minutes * 60 + currentTimerState.seconds))
                    : 0);
            const currentPausedElapsed = pausedElapsedRef.current;
            const hasElapsedTime = elapsedSeconds > 0 || timerElapsed > 0 || currentPausedElapsed > 0;
            
            console.log('ZH: Seat change state - wasTimerRunning:', wasTimerRunning, 'isPaused:', isPaused, 'hasElapsedTime:', hasElapsedTime, 'timerElapsed:', timerElapsed, 'currentPausedElapsed:', currentPausedElapsed);
            
            // Only log if timer was RUNNING (not paused) when seat changed
            // If paused, do NOT log - store the paused time for restoration when switching back
            if (wasTimerRunning && !isPaused && startTimeRef.current && hasElapsedTime) {
                // Timer was running - log current member only
                // DON'T clear other stored paused times - they persist until END is pressed
                delete seatPausedTimesRef.current[prevSeatNormalized];
                
                if (prevMemberRef.current && prevMemberRef.current.name && prevMemberRef.current.name.trim() !== '') {
                    const logPreviousMember = async () => {
                        const endTime = getISTNow();
                        let durationSeconds;
                        if (timerElapsed > 0) {
                            durationSeconds = timerElapsed;
                        } else if (elapsedSeconds > 0) {
                            durationSeconds = elapsedSeconds;
                        } else {
                            durationSeconds = 1;
                        }

            try {
                await fetch('http://localhost:5000/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'Zero Hour',
                                    member_name: prevMemberRef.current.name,
                        chairperson: chairperson || '',
                                    start_time: formatISTForMySQL(startTimeRef.current),
                                    end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                                    allotted_seconds: initialTimeSeconds,
                                    spoken_seconds: durationSeconds,
                                    seat_no: prevMemberRef.current.seat_no || prevSeatNormalized || '',
                                    party: prevMemberRef.current.party || '',
                                    notes: 'Seat changed while running - timer reset'
                    }),
                });
                            console.log('ZH: Logged activity for', prevMemberRef.current.name, 'party:', prevMemberRef.current.party, 'duration:', durationSeconds);
            } catch (error) {
                            console.error('ZH: Error logging activity:', error);
            }
                    };
                    logPreviousMember();
                }
                // Note: Other stored paused times are NOT cleared here - they persist until END is pressed
            } else if (isPaused || currentPausedElapsed > 0 || isPausedWithTimeRef.current) {
                // Timer was paused - store the paused elapsed time for this seat
                // Use the most accurate elapsed time available
                const pausedTime = currentPausedElapsed > 0 ? currentPausedElapsed : (timerElapsed > 0 ? timerElapsed : elapsedSeconds);
                if (pausedTime > 0) {
                    // Store full member data for broadcast restoration
                    const fullMemberData = memberData ? {
                        name: memberData.name,
                        name_hindi: memberData.name_hindi,
                        party: memberData.party,
                        state: memberData.state,
                        seat_no: memberData.seat_no || prevSeatNormalized,
                        picture: memberData.picture
                    } : prevMemberRef.current;
                    
                    seatPausedTimesRef.current[prevSeatNormalized] = {
                        elapsed: pausedTime,
                        startTime: startTimeRef.current ? startTimeRef.current.toISOString() : null,
                        member: fullMemberData
                    };
                    console.log('ZH: Timer was paused - storing', pausedTime, 'seconds for seat', prevSeatNormalized, 'member:', fullMemberData?.name);
                }
                // Clear the paused flag since we've stored the time
                isPausedWithTimeRef.current = false;
            }
            
            // Clear snapshot and reset flags
            clearPausedSnapshot();
            suppressAutoStartRef.current = false;
            isResumingFromPauseRef.current = false;
            
            // Check if the NEW seat has stored paused time to restore
            const storedPausedTime = seatPausedTimesRef.current[newSeatNormalized];
            
            if (storedPausedTime && storedPausedTime.elapsed > 0) {
                // Restore paused time for this seat
                console.log('ZH: Restoring paused time for seat', newSeatNormalized, ':', storedPausedTime.elapsed, 'seconds');
                
                const restoredElapsed = storedPausedTime.elapsed;
                const remaining = Math.max(0, initialTimeSeconds - restoredElapsed);
                const remainingMins = Math.floor(remaining / 60);
                const remainingSecs = remaining % 60;
                
                // Convert elapsed to h:m:s for global timer
                const elapsedH = Math.floor(restoredElapsed / 3600);
                const elapsedM = Math.floor((restoredElapsed % 3600) / 60);
                const elapsedS = restoredElapsed % 60;
                
                // Stop timer first
                if (timerRef.current) {
                    timerRef.current.stopSilent();
                }
                
                // Set timer to paused state with remaining time
                isTimerRunningRef.current = false;
                isPausedWithTimeRef.current = true; // Mark as paused with time
                setElapsedSeconds(restoredElapsed);
                pausedElapsedRef.current = restoredElapsed;
                
                // Restore start time if available
                if (storedPausedTime.startTime) {
                    startTimeRef.current = new Date(storedPausedTime.startTime);
                }
                
                // Restore member ref if available
                if (storedPausedTime.member) {
                    prevMemberRef.current = storedPausedTime.member;
                }
                
                prevSeatRef.current = newSeatNormalized;
                
                // Set timer display to remaining time in paused state
                suppressAutoStartRef.current = true;
                isResumingFromPauseRef.current = true;
                
                // Update global timer state with restored elapsed time (paused)
                setGlobalTimer({
                    hours: elapsedH,
                    minutes: elapsedM,
                    seconds: elapsedS,
                    isRunning: false,
                    mode: 'countdown',
                    initialHours: 0,
                    initialMinutes: timerMinutes,
                    initialSeconds: 0
                });
                
                // Send paused state, time, AND member data to broadcast window immediately
                if (isBroadcastingRef.current && updateBroadcastData) {
                    // IMPORTANT: Use the STORED member data (from when they were paused), not current memberData
                    // because memberData might still be the previous member (async fetch not complete)
                    const restoredMemberData = storedPausedTime.member || {};
                    updateBroadcastData({
                        memberData: {
                            name: restoredMemberData.name || '',
                            name_hindi: restoredMemberData.name_hindi || '',
                            party: restoredMemberData.party || '',
                            state: restoredMemberData.state || '',
                            seat_no: restoredMemberData.seat_no || newSeatNormalized,
                            picture: restoredMemberData.picture || null
                        }
                    });
                    sendToBroadcast({
                        type: 'TIMER_UPDATE',
                        hours: elapsedH,
                        minutes: elapsedM,
                        seconds: elapsedS,
                        isRunning: false
                    });
                    sendToBroadcast({
                        type: 'TIMER_PAUSED',
                        isPaused: true
                    });
                }
                
                setTimeout(() => {
                    if (timerRef.current) {
                        timerRef.current.hydrateFromSnapshot({
                            hours: 0,
                            minutes: remainingMins,
                            seconds: remainingSecs,
                            markStarted: true,
                            skipGlobalUpdate: true
                        });
                    }
                }, 50);
            } else {
                // No stored time - fresh start for this seat
                if (timerRef.current) {
                    timerRef.current.stopSilent();
                    timerRef.current.setTime(0, timerMinutes, 0, { resetElapsed: true });
                }
                isTimerRunningRef.current = false;
                isPausedWithTimeRef.current = false; // Clear paused flag for fresh start
                setElapsedSeconds(0);
            startTimeRef.current = null;
                prevSeatRef.current = newSeatNormalized;
                pausedElapsedRef.current = 0;
                
                // Auto-start for fresh seat - also pre-set prevMemberRef for reliable logging
                setTimeout(() => {
                    if (timerRef.current && !suppressAutoStartRef.current && memberData) {
                        // Pre-set member ref before starting so it's ready for logging on next seat change
                        prevMemberRef.current = { 
                            name: memberData?.name, 
                            seat: newSeatNormalized, 
                            seat_no: normalizeSeatNo(memberData?.seat_no || selectedSeat),
                            party: memberData?.party || ''
                        };
                        timerRef.current.start();
                        // Ensure running ref is set after start (backup in case handleTimerStart doesn't fire)
                        isTimerRunningRef.current = true;
                    }
                }, 150);
            }
        }
    }, [selectedSeat, chairperson, elapsedSeconds, timerMinutes, initialTimeSeconds]);

    // Auto-start timer when member data is loaded (only for fresh loads, not navigation returns)
    useEffect(() => {
        // Skip if we're resuming from a paused/running state
        if (suppressAutoStartRef.current) {
            return;
        }
        
        if (memberData && selectedSeat) {
            // AUTO-START: When member data is freshly loaded
            // Only check local ref, not async global state
            if (timerRef.current && !isTimerRunningRef.current) {
                timerRef.current.setTime(0, timerMinutes, 0, { resetElapsed: true });
                setTimeout(() => {
                    if (timerRef.current && !suppressAutoStartRef.current && !isTimerRunningRef.current) {
                        // Pre-set member ref for reliable logging on seat change
                        prevMemberRef.current = { 
                            name: memberData?.name, 
                            seat: normalizeSeatNo(selectedSeat), 
                            seat_no: normalizeSeatNo(memberData?.seat_no || selectedSeat),
                            party: memberData?.party || ''
                        };
                        timerRef.current.start();
                        // Ensure running ref is set after start
                        isTimerRunningRef.current = true;
                    }
                }, 100);
            }
            
            // Update broadcast window if broadcasting
            if (timerRef.current?.isBroadcasting?.()) {
                timerRef.current.updateBroadcastData({
                    memberData: {
                        name: memberData.name,
                        name_hindi: memberData.name_hindi,
                        party: memberData.party,
                        state: memberData.state,
                        seat_no: selectedSeat,
                        picture: memberData.picture
                    }
                });
            }
        }
    }, [memberData, selectedSeat, timerMinutes]);

    // Update broadcast window when chairperson changes
    useEffect(() => {
        if (selectedChairpersonData) {
            setChairpersonData({
                name: selectedChairpersonData.name || '',
                position: selectedChairpersonData.position || '',
                picture: selectedChairpersonData.picture || null
            });
        }
        
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({
                chairperson: selectedChairpersonData?.name || '',
                chairpersonPosition: selectedChairpersonData?.position || ''
            });
        }
    }, [selectedChairpersonData, setChairpersonData]);

    // Cleanup on unmount - only log if NOT broadcasting (broadcasting keeps timer running)
    useEffect(() => {
        return () => {
            if (isTimerRunningRef.current && startTimeRef.current && !isBroadcastingRef.current) {
                const currentMember = prevMemberRef.current;
                if (currentMember && currentMember.name && currentMember.name.trim() !== '') {
                    const endTime = getISTNow();
                    const durationSeconds = Math.floor((endTime - startTimeRef.current) / 1000);
                    
                    const logData = JSON.stringify({
                        activity_type: 'Zero Hour',
                        member_name: currentMember.name,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        allotted_seconds: initialTimeSeconds,
                        spoken_seconds: durationSeconds,
                        seat_no: currentMember.seat_no || currentMember.seat || '',
                        party: currentMember.party || '',
                        notes: 'Page navigated away'
                    });
                    
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon(
                            'http://localhost:5000/api/activity-log',
                            new Blob([logData], { type: 'application/json' })
                        );
                    } else {
                        fetch('http://localhost:5000/api/activity-log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: logData,
                            keepalive: true
                        }).catch(() => {});
                    }
                }
            }
        };
    }, [chairperson, initialTimeSeconds]);

    // Timer event handlers
    const handleTimerStart = () => {
        suppressAutoStartRef.current = false;
        clearPausedSnapshot();
        isTimerRunningRef.current = true;
        isPausedWithTimeRef.current = false; // Clear paused flag - timer is now running
        
        // Clear stored paused time for this seat since timer is now running
        const currentSeatNormalized = normalizeSeatNo(selectedSeat);
        if (currentSeatNormalized) {
            delete seatPausedTimesRef.current[currentSeatNormalized];
        }
        
        // Check if we're resuming from a paused state
        if (isResumingFromPauseRef.current && pausedElapsedRef.current > 0) {
            // Resuming: adjust startTimeRef to account for already-elapsed time
            const pausedElapsed = pausedElapsedRef.current;
            startTimeRef.current = new Date(getISTNow().getTime() - pausedElapsed * 1000);
            // Don't reset elapsedSeconds - it was already set during snapshot restoration
            console.log('ZH: Resuming from pause, elapsed:', pausedElapsed);
        } else {
            // Fresh start: reset everything
            startTimeRef.current = getISTNow();
            setElapsedSeconds(0);
        }
        
        // Clear the resume flags
        isResumingFromPauseRef.current = false;
        pausedElapsedRef.current = 0;
        
        prevMemberRef.current = { 
            name: memberData?.name, 
            seat: normalizeSeatNo(selectedSeat), 
            seat_no: normalizeSeatNo(memberData?.seat_no || selectedSeat),
            party: memberData?.party || ''
        };
        
        if (isBroadcastWindowOpen()) {
            const broadcastData = getBroadcastData();
            startBroadcastType(broadcastData);
            startGlobalTimer();
            
            // Also explicitly update member data to ensure broadcast shows correct member
            if (updateBroadcastData && memberData) {
                updateBroadcastData({
                    memberData: {
                        name: memberData.name,
                        name_hindi: memberData.name_hindi,
                        party: memberData.party,
                        state: memberData.state,
                        seat_no: selectedSeat,
                        picture: memberData.picture
                    }
                });
            }
        }
    };

    const handleTimerTick = (remainingSeconds) => {
        const elapsed = initialTimeSeconds - remainingSeconds;
        setElapsedSeconds(elapsed > 0 ? elapsed : 0);
    };

    const handleTimeUp = async () => {
        setShowAlert(true);
        setTimeout(() => setShowAlert(false), 5000);
        setElapsedSeconds(initialTimeSeconds);
    };

    const handleTimerEnd = async () => {
        isTimerRunningRef.current = false;
        isPausedWithTimeRef.current = false; // Clear paused flag
        clearPausedSnapshot();
        suppressAutoStartRef.current = false;
        
        const currentSeatNormalized = normalizeSeatNo(selectedSeat);
        const endTime = getISTNow();
        
        // Get elapsed time from Timer component directly (most accurate)
        let timerElapsed = 0;
        if (timerRef.current?.getTime) {
            const timeState = timerRef.current.getTime();
            timerElapsed = timeState.totalElapsed || 0;
            if (timerElapsed === 0 && timeState) {
                // Fallback: calculate from remaining time
                const remaining = (timeState.hours || 0) * 3600 + (timeState.minutes || 0) * 60 + (timeState.seconds || 0);
                timerElapsed = Math.max(0, initialTimeSeconds - remaining);
            }
        }
        
        // Log current member's time
        const memberName = memberData?.name || prevMemberRef.current?.name;
        // Check for elapsed time from multiple sources
        const hasStartTime = startTimeRef.current !== null;
        const hasElapsedTime = timerElapsed > 0 || pausedElapsedRef.current > 0 || elapsedSeconds > 0;
        
        if ((hasStartTime || hasElapsedTime) && memberName && memberName.trim() !== '') {
            // Use the most accurate elapsed time available
            const timerTracked = timerElapsed > 0 ? timerElapsed : (pausedElapsedRef.current > 0 ? pausedElapsedRef.current : (elapsedSeconds > 0 ? elapsedSeconds : 0));
            const actualDuration = hasStartTime ? Math.floor((endTime - startTimeRef.current) / 1000) : timerTracked;
            const durationSeconds = Math.max(timerTracked, actualDuration, 1);

            try {
                await fetch('http://localhost:5000/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'Zero Hour',
                        member_name: memberName,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        allotted_seconds: initialTimeSeconds,
                        spoken_seconds: durationSeconds,
                        seat_no: selectedSeat || prevMemberRef.current?.seat_no || '',
                        party: memberData?.party || prevMemberRef.current?.party || '',
                        notes: 'Timer ended'
                    }),
                });
                console.log('ZH: Logged current member', memberName, 'party:', memberData?.party, 'duration:', durationSeconds);
            } catch (error) {
                console.error('Error logging activity:', error);
            }
        }
        
        // Delete current seat's stored time if any
        if (currentSeatNormalized) {
            delete seatPausedTimesRef.current[currentSeatNormalized];
        }
        
        // Log ALL stored paused times from other seats - END ends everything
        const storedSeats = Object.keys(seatPausedTimesRef.current);
        for (const storedSeat of storedSeats) {
            const stored = seatPausedTimesRef.current[storedSeat];
            if (stored && stored.member && stored.member.name && stored.member.name.trim() !== '') {
                try {
                    await fetch('http://localhost:5000/api/activity-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            activity_type: 'Zero Hour',
                            member_name: stored.member.name,
                            chairperson: chairperson || '',
                            start_time: stored.startTime ? formatISTForMySQL(new Date(stored.startTime)) : formatISTForMySQL(endTime),
                            end_time: formatISTForMySQL(endTime),
                            duration_seconds: stored.elapsed,
                            allotted_seconds: initialTimeSeconds,
                            spoken_seconds: stored.elapsed,
                            seat_no: stored.member.seat_no || storedSeat || '',
                            party: stored.member.party || '',
                            notes: 'Paused timer ended - END pressed'
                        }),
                    });
                    console.log('ZH: Logged stored paused member', stored.member.name, 'party:', stored.member.party, 'duration:', stored.elapsed);
                } catch (error) {
                    console.error('ZH: Error logging stored paused activity:', error);
                }
            }
        }
        // Clear all stored paused times
        seatPausedTimesRef.current = {};
        
            startTimeRef.current = null;
        setElapsedSeconds(0);
        pausedElapsedRef.current = 0;
        setSelectedSeat('');
    };
    
    const handleTimerPause = () => {
        // Mark timer as not running locally
        isTimerRunningRef.current = false;
        // Store current elapsed time for logging on seat change
        if (timerRef.current?.getTime) {
            const timeState = timerRef.current.getTime();
            // Use totalElapsed if available, otherwise calculate from remaining time (for countdown mode)
            let elapsed = timeState.totalElapsed || 0;
            if (elapsed === 0 && timeState) {
                // Fallback: calculate elapsed from remaining time
                const remaining = (timeState.hours || 0) * 3600 + (timeState.minutes || 0) * 60 + (timeState.seconds || 0);
                elapsed = Math.max(0, initialTimeSeconds - remaining);
            }
            pausedElapsedRef.current = elapsed;
            // Set explicit flag that we're in paused state with time
            if (pausedElapsedRef.current > 0) {
                isPausedWithTimeRef.current = true;
            }
            console.log('ZH: Timer paused, elapsed:', pausedElapsedRef.current);
        }
        // Persist snapshot for resume after navigation
        persistPausedSnapshot();
    };
    
    const handleTimerDurationChange = (minutes) => {
        if (minutes === timerMinutes) return;
        setPendingTimerMinutes(minutes);
        setShowTimerConfirm(true);
    };

    const confirmTimerDurationChange = () => {
        if (pendingTimerMinutes === null) return;
        const newMinutes = pendingTimerMinutes;
        const newTotalSeconds = newMinutes * 60;

        // Determine current elapsed from timerRef if available (totalElapsed accounts for overtime)
        let currentElapsed = elapsedSeconds;
        const timeState = timerRef.current?.getTime?.();
        if (timeState) {
            if (typeof timeState.totalElapsed === 'number') {
                currentElapsed = timeState.totalElapsed;
            } else {
                const remainingSeconds = (timeState.hours || 0) * 3600 + (timeState.minutes || 0) * 60 + (timeState.seconds || 0);
                const derivedElapsed = initialTimeSeconds - remainingSeconds;
                if (!Number.isNaN(derivedElapsed)) {
                    currentElapsed = Math.max(0, derivedElapsed);
                }
            }
        }

        const clampedElapsed = Math.min(currentElapsed, newTotalSeconds);
        pausedElapsedRef.current = clampedElapsed;
        setElapsedSeconds(clampedElapsed);
        setTimerMinutes(newMinutes);

        // Save duration to sessionStorage so it persists across navigation
        try {
            sessionStorage.setItem(ZH_TIMER_DURATION_KEY, String(newMinutes));
        } catch (e) {
            console.warn('Error saving timer duration', e);
        }

        // If timer is not running, reset to the new duration immediately
        if (timerRef.current && !isTimerRunningRef.current) {
            timerRef.current.setTime(0, newMinutes, 0, { resetElapsed: true });
        }

        // Keep global timer elapsed but update the allotted duration for countdown mode
        const elapsedH = Math.floor(clampedElapsed / 3600);
        const elapsedM = Math.floor((clampedElapsed % 3600) / 60);
        const elapsedS = clampedElapsed % 60;
        setGlobalTimer({
            hours: elapsedH,
            minutes: elapsedM,
            seconds: elapsedS,
            isRunning: isTimerRunningRef.current,
            mode: 'countdown',
            initialHours: 0,
            initialMinutes: newMinutes,
            initialSeconds: 0
        });

        // Update broadcast viewers with the new duration
        if (isBroadcastingRef.current && updateBroadcastData) {
            updateBroadcastData({ timerDuration: newMinutes });
        }

        setPendingTimerMinutes(null);
        setShowTimerConfirm(false);
    };

    const cancelTimerDurationChange = () => {
        setPendingTimerMinutes(null);
        setShowTimerConfirm(false);
    };

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100 overflow-hidden">
            <Header showBack />

            <main className="flex-1 max-w-7xl mx-auto px-4 py-2 w-full flex flex-col gap-3 overflow-hidden">
                {/* Timer Duration Confirmation */}
                {showTimerConfirm && pendingTimerMinutes !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in">
                            <h3 className="text-xl font-bold text-red-800 text-center">Change Timer Duration?</h3>
                            <p className="text-center text-gray-700">
                                Update Zero Hour timer from <span className="font-semibold">{timerMinutes} minute{timerMinutes !== 1 ? 's' : ''}</span> to{' '}
                                <span className="font-semibold text-red-700">{pendingTimerMinutes} minute{pendingTimerMinutes !== 1 ? 's' : ''}</span>?
                            </p>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={cancelTimerDurationChange}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmTimerDurationChange}
                                    className="px-5 py-2 rounded-lg bg-red-700 text-white font-semibold shadow hover:bg-red-800"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Time's Up Alert */}
                {showAlert && (
                    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
                        <div className="bg-red-600 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-3">
                            <Clock className="animate-pulse" size={24} />
                            <span className="text-xl font-bold">Time is up!</span>
                            <button
                                onClick={() => setShowAlert(false)}
                                className="ml-4 hover:bg-white/20 p-1 rounded"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* Page Title */}
                <div className="text-center animate-fade-in flex items-center justify-center gap-3">
                    <Clock size={28} className="text-red-800" />
                    <h2 className="text-2xl md:text-3xl font-bold text-red-800">Zero Hour</h2>
                </div>

                {/* Timer with Duration Selector */}
                <div className="animate-fade-in flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow">
                        <span className="text-sm font-semibold text-gray-700">Timer:</span>
                        <select
                            value={pendingTimerMinutes ?? timerMinutes}
                            onChange={(e) => handleTimerDurationChange(parseInt(e.target.value))}
                            className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm font-bold text-red-800"
                        >
                            <option value={1}>1 Min</option>
                            <option value={2}>2 Min</option>
                            <option value={3}>3 Min</option>
                            <option value={4}>4 Min</option>
                            <option value={5}>5 Min</option>
                            <option value={6}>6 Min</option>
                            <option value={7}>7 Min</option>
                            <option value={8}>8 Min</option>
                            <option value={9}>9 Min</option>
                            <option value={10}>10 Min</option>
                            <option value={12}>12 Min</option>
                            <option value={15}>15 Min</option>
                        </select>
                    </div>
                    
                    <div className="flex-1">
                    <Timer
                            ref={timerRef}
                        mode="countdown"
                            initialMinutes={timerMinutes}
                        initialSeconds={0}
                        onTimeUp={handleTimeUp}
                        onStart={handleTimerStart}
                            onStop={handleTimerPause}
                            onEnd={handleTimerEnd}
                            onTick={handleTimerTick}
                        compact={true}
                            hasEntry={!!memberData}
                    />
                    </div>
                </div>

                {/* Member Panel */}
                <div className="animate-fade-in flex-1 min-h-0">
                    <MemberPanelCompact
                        seatNo={selectedSeat}
                        onSeatChange={setSelectedSeat}
                    />
                </div>

                {/* Chair Display */}
                <div className="animate-fade-in">
                    <ChairDisplay showDropdown={true} />
                </div>
            </main>

            <Footer />
        </div>
    );
}
