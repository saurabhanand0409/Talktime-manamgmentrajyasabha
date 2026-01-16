import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Square, RotateCcw, X, Check } from 'lucide-react';
import { useBroadcast } from '../context/BroadcastContext';

// Reset Confirmation Modal Component - rendered via portal
function ResetConfirmModal({ onConfirm, onCancel }) {
    return createPortal(
        <div 
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: 99999 }}
        >
            <div className="absolute inset-0 bg-black/50" onClick={onCancel}></div>
            <div 
                className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Reset</h3>
                <p className="text-gray-600 mb-6">
                    Are you sure you want to reset the timer?
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 flex items-center justify-center gap-2"
                    >
                        <X size={20} />
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-4 py-3 bg-red-800 text-white rounded-xl font-semibold hover:bg-red-900 flex items-center justify-center gap-2"
                    >
                        <Check size={20} />
                        Reset
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

const Timer = forwardRef(function Timer({
    mode = 'countup', // 'countup' or 'countdown'
    initialMinutes = 0,
    initialSeconds = 0,
    initialHours = 0,
    onTimeUp = () => { },
    onStart = () => { },
    onStop = () => { }, // Called on pause
    onEnd = () => { }, // Called on end (stop + log)
    onTick = () => { }, // fires every second with elapsed time
    onReset = null, // Called after reset - parent can set custom reset value
    compact = false,
    autoStart = false, // New: auto-start when mounted
    confirmReset = true, // Show confirmation before reset
    hasEntry = false, // Whether a seat/member is loaded
}, ref) {
    const [localHours, setLocalHours] = useState(initialHours);
    const [localMinutes, setLocalMinutes] = useState(initialMinutes);
    const [localSeconds, setLocalSeconds] = useState(initialSeconds);
    const [isRunning, setIsRunning] = useState(autoStart);
    const [totalElapsed, setTotalElapsed] = useState(0);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [hasTimeUpTriggered, setHasTimeUpTriggered] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const pauseSnapshotRef = useRef(null);
    const didInvokeOnStartRef = useRef(false);
    const hasStartedRef = useRef(false); // Ref to track started state reliably across re-renders
    const isResettingRef = useRef(false); // Flag to prevent race conditions during reset
    const justResetRef = useRef(false); // Flag to force fresh start after setTime({ resetElapsed: true })
    const initialTotalSeconds = useMemo(
        () => initialHours * 3600 + initialMinutes * 60 + initialSeconds,
        [initialHours, initialMinutes, initialSeconds]
    );
    const remainingToElapsed = useCallback((h = 0, m = 0, s = 0) => {
        const remainingSeconds = h * 3600 + m * 60 + s;
        const elapsedSeconds = Math.max(0, initialTotalSeconds - remainingSeconds);
        return {
            hours: Math.floor(elapsedSeconds / 3600),
            minutes: Math.floor((elapsedSeconds % 3600) / 60),
            seconds: elapsedSeconds % 60
        };
    }, [initialTotalSeconds]);

    // Use global broadcast context
    const { 
        isBroadcasting, 
        updateBroadcastData: globalUpdateBroadcastData, 
        globalTimerState,
        startGlobalTimer,
        stopGlobalTimer,
        setGlobalTimer,
        sendToBroadcast,
        closeBroadcast
    } = useBroadcast();
    
    // Update local time when initial props change (e.g., countdown duration changed)
    useEffect(() => {
        if (!isRunning && totalElapsed === 0) {
            setLocalHours(initialHours);
            setLocalMinutes(initialMinutes);
            setLocalSeconds(initialSeconds);
        }
    }, [initialHours, initialMinutes, initialSeconds, isRunning, totalElapsed]);
    
    // Update local time when initial props change (for countdown timer duration changes)
    useEffect(() => {
        if (!isRunning && totalElapsed === 0) {
            setLocalHours(initialHours);
            setLocalMinutes(initialMinutes);
            setLocalSeconds(initialSeconds);
        }
    }, [initialHours, initialMinutes, initialSeconds, isRunning, totalElapsed]);

    // When countdown duration changes while running/paused, recompute remaining from elapsed
    useEffect(() => {
        if (mode !== 'countdown') return;
        const remaining = Math.max(0, initialTotalSeconds - totalElapsed);
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        setLocalHours(h);
        setLocalMinutes(m);
        setLocalSeconds(s);
        if (remaining > 0 && hasTimeUpTriggered) {
            setHasTimeUpTriggered(false);
        }
        // Keep global timer's allotted duration in sync without altering elapsed
        if (isBroadcasting) {
            setGlobalTimer({
                initialHours,
                initialMinutes,
                initialSeconds,
                mode
            });
        }
    }, [initialTotalSeconds, totalElapsed, mode, hasTimeUpTriggered, isBroadcasting, setGlobalTimer, initialHours, initialMinutes, initialSeconds]);
    
    // When broadcasting, derive display time from global timer state
    // For countdown mode: global stores elapsed, display shows remaining
    const getDisplayTime = () => {
        if (isBroadcasting) {
            if (mode === 'countdown') {
                // Global stores elapsed time, we need to show remaining
                const elapsedTotal = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
                const remaining = Math.max(0, initialTotalSeconds - elapsedTotal);
                return {
                    hours: Math.floor(remaining / 3600),
                    minutes: Math.floor((remaining % 3600) / 60),
                    seconds: remaining % 60
                };
            } else {
                // Count up - global stores elapsed directly
                return {
                    hours: globalTimerState.hours,
                    minutes: globalTimerState.minutes,
                    seconds: globalTimerState.seconds
                };
            }
        }
        return { hours: localHours, minutes: localMinutes, seconds: localSeconds };
    };
    
    const displayTime = getDisplayTime();
    const hours = displayTime.hours;
    const minutes = displayTime.minutes;
    const seconds = displayTime.seconds;

    // Styling for Start/Pause toggle (light green for Start, amber for Pause)
    const startPauseClass = isRunning
        ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
        : 'bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600';
    const primaryButtonSizing = isRunning ? 'px-7 py-3.5 text-xl' : 'px-6 py-3 text-lg';
    const compactButtonSizing = isRunning ? 'px-5 py-2.5 text-base' : 'px-4 py-2 text-sm';
    const primaryIconSize = isRunning ? 28 : 24;
    const compactIconSize = isRunning ? 18 : 16;
    
    // End button should be enabled if timer was ever started (use both state and ref for reliability)
    const canEnd = hasEntry && (hasStarted || hasStartedRef.current || didInvokeOnStartRef.current);
    
    // Calculate elapsed time for countdown mode (uses local state for initial value when starting broadcast)
    // MUST be declared before handleStart which uses it
    const getElapsedForBroadcast = useCallback(() => {
        if (mode === 'countdown') {
            return remainingToElapsed(localHours, localMinutes, localSeconds);
        }
        return { hours: localHours, minutes: localMinutes, seconds: localSeconds };
    }, [mode, localHours, localMinutes, localSeconds, remainingToElapsed]);

    // Reset function - MUST be declared before useImperativeHandle which uses it
    const reset = useCallback(() => {
        const initialTime = {
            hours: initialHours,
            minutes: initialMinutes,
            seconds: initialSeconds
        };
        setIsRunning(false);
        setIsPaused(false);
        setLocalHours(initialHours);
        setLocalMinutes(initialMinutes);
        setLocalSeconds(initialSeconds);
        setTotalElapsed(0);
        setShowResetConfirm(false);
        setHasTimeUpTriggered(false);
        setHasStarted(false);
        hasStartedRef.current = false;
        pauseSnapshotRef.current = null;
        didInvokeOnStartRef.current = false;
        isResettingRef.current = false;
        justResetRef.current = false;

        // Reset global timer state so broadcast + remote feeds snap back to start
        stopGlobalTimer();
        setGlobalTimer({
            hours: 0,
            minutes: 0,
            seconds: 0,
            isRunning: false,
            mode,
            initialHours,
            initialMinutes,
            initialSeconds
        });

        if (isBroadcasting) {
            sendToBroadcast({
                type: 'TIMER_RESET',
                initialTime,
                mode
            });
        }
        
        // Call onReset callback so parent can set custom reset value (e.g., member's base time)
        if (onReset) {
            // Use setTimeout to ensure state updates have propagated
            setTimeout(() => onReset(), 50);
        }
    }, [initialHours, initialMinutes, initialSeconds, stopGlobalTimer, setGlobalTimer, isBroadcasting, sendToBroadcast, mode, onReset]);
    
    // Sync isRunning state with global timer when returning to page while broadcasting
    useEffect(() => {
        if (isBroadcasting && globalTimerState.isRunning && !isRunning) {
            setIsRunning(true);
        }
    }, [isBroadcasting, globalTimerState.isRunning, isRunning]);

    // Ensure End button + resume logic stay enabled after navigation away/back while broadcast is active
    useEffect(() => {
        if (!isBroadcasting) return;
        // Skip if we're in the middle of a reset (to avoid race condition with stale state)
        if (isResettingRef.current) return;
        
        const elapsedTotal =
            (globalTimerState.hours || 0) * 3600 +
            (globalTimerState.minutes || 0) * 60 +
            (globalTimerState.seconds || 0);
        const hasActiveSession = globalTimerState.isRunning || elapsedTotal > 0;

        if (hasActiveSession) {
            if (!hasStartedRef.current) {
                hasStartedRef.current = true;
                setHasStarted(true);
            }
            if (!didInvokeOnStartRef.current) {
                didInvokeOnStartRef.current = true;
            }
            setIsPaused(!globalTimerState.isRunning);
        }
    }, [isBroadcasting, globalTimerState.isRunning, globalTimerState.hours, globalTimerState.minutes, globalTimerState.seconds]);

    // Start timer (local + global if broadcasting)
    const handleStart = useCallback(() => {
        // Check if we just reset - if so, force fresh start behavior regardless of state
        const forceReset = justResetRef.current;
        justResetRef.current = false; // Clear the flag
        
        const wasAlreadyStarted = !forceReset && (hasStartedRef.current || hasStarted);
        setIsRunning(true);
        setIsPaused(false);
        if (!didInvokeOnStartRef.current) {
            // Fresh start - onStart callback will set up the timer (including global timer base)
            onStart();
            didInvokeOnStartRef.current = true;
        }
        setHasStarted(true);
        hasStartedRef.current = true;
        // Restore from pause snapshot - must set BOTH local AND global (when broadcasting)
        if (!forceReset && pauseSnapshotRef.current) {
            const snap = pauseSnapshotRef.current;
            
            // For countdown mode in overtime, use saved totalElapsed to restore correctly
            if (snap.isOvertime && mode === 'countdown') {
                // Overtime: totalElapsed > initialTotalSeconds
                // Keep display at 00:00:00 but restore correct totalElapsed
                setLocalHours(0);
                setLocalMinutes(0);
                setLocalSeconds(0);
                setTotalElapsed(snap.totalElapsed);
                
                if (isBroadcasting) {
                    // Global timer stores ELAPSED time, convert totalElapsed to h:m:s
                    const elapsedH = Math.floor(snap.totalElapsed / 3600);
                    const elapsedM = Math.floor((snap.totalElapsed % 3600) / 60);
                    const elapsedS = snap.totalElapsed % 60;
                    setGlobalTimer({
                        hours: elapsedH,
                        minutes: elapsedM,
                        seconds: elapsedS,
                        isRunning: true,
                        mode: mode
                    });
                    startGlobalTimer();
                    sendToBroadcast({ type: 'TIMER_PAUSED', isPaused: false });
                }
            } else {
                // Normal case: restore from display snapshot
                setLocalHours(snap.hours);
                setLocalMinutes(snap.minutes);
                setLocalSeconds(snap.seconds);
                if (mode === 'countdown') {
                    const remainingSeconds = snap.hours * 3600 + snap.minutes * 60 + snap.seconds;
                    setTotalElapsed(initialTotalSeconds - remainingSeconds);
                } else {
                    const total = snap.hours * 3600 + snap.minutes * 60 + snap.seconds;
                    setTotalElapsed(total);
                }
                // When broadcasting, ALSO restore global timer from pause snapshot (display reads from global)
                if (isBroadcasting) {
                    const elapsedPayload = mode === 'countdown'
                        ? remainingToElapsed(snap.hours, snap.minutes, snap.seconds)
                        : { hours: snap.hours, minutes: snap.minutes, seconds: snap.seconds };
                    setGlobalTimer({
                        ...elapsedPayload,
                        isRunning: true,
                        mode: mode
                    });
                    startGlobalTimer();
                    sendToBroadcast({ type: 'TIMER_PAUSED', isPaused: false });
                }
            }
            pauseSnapshotRef.current = null;
        } else if (isBroadcasting && wasAlreadyStarted) {
            // No pause snapshot but was already started - sync from current global state
            const elapsedSeconds = (globalTimerState.hours || 0) * 3600 + (globalTimerState.minutes || 0) * 60 + (globalTimerState.seconds || 0);
            const elapsed = {
                hours: Math.floor(elapsedSeconds / 3600),
                minutes: Math.floor((elapsedSeconds % 3600) / 60),
                seconds: elapsedSeconds % 60
            };
            setGlobalTimer({
                hours: elapsed.hours,
                minutes: elapsed.minutes,
                seconds: elapsed.seconds,
                isRunning: true,
                mode: mode
            });
            startGlobalTimer();
            sendToBroadcast({ type: 'TIMER_PAUSED', isPaused: false });
        } else if (isBroadcasting && !wasAlreadyStarted) {
            // Fresh start while broadcasting - just signal unpause, parent already set timer
            sendToBroadcast({ type: 'TIMER_PAUSED', isPaused: false });
        }
    }, [isBroadcasting, onStart, mode, startGlobalTimer, setGlobalTimer, getElapsedForBroadcast, sendToBroadcast, hasStarted, globalTimerState, initialHours, initialMinutes, initialSeconds]);
    
    // Start timer silently (without triggering onStart callback) - for syncing from global
    const handleStartSilent = useCallback(() => {
        setIsRunning(true);
        // Don't call onStart - used when syncing from global state
    }, []);
    
    // Pause timer (local + global if broadcasting) - doesn't log activity
    const handlePause = useCallback(() => {
        setIsRunning(false);
        setIsPaused(true);
        const snapshot = getDisplayTime();
        // Also save totalElapsed for countdown mode overtime scenarios
        // When countdown goes past allotted time, display shows 00:00:00 but we need actual elapsed
        pauseSnapshotRef.current = {
            ...snapshot,
            totalElapsed: totalElapsed, // Save actual elapsed time
            isOvertime: mode === 'countdown' && totalElapsed > initialTotalSeconds
        };
        onStop();
        if (isBroadcasting) {
            stopGlobalTimer();
            sendToBroadcast({ type: 'TIMER_PAUSED', isPaused: true });
        }
    }, [isBroadcasting, onStop, stopGlobalTimer, sendToBroadcast, getDisplayTime, totalElapsed, mode, initialTotalSeconds]);
    
    // End timer (stop + log activity + return to idle broadcast)
    const handleEnd = useCallback(() => {
        setIsRunning(false);
        setIsPaused(false);
        onEnd();
        // Always stop global timer and close broadcast when End is pressed
        // This ensures we return to idle "In The Chair" mode
        // (closeBroadcast is safe to call even if not actively broadcasting)
        stopGlobalTimer();
        closeBroadcast();
        setHasStarted(false);
        hasStartedRef.current = false;
        didInvokeOnStartRef.current = false;
        pauseSnapshotRef.current = null;
    }, [onEnd, stopGlobalTimer, closeBroadcast]);
    
    // Stop timer silently (without triggering callbacks) - for programmatic use
    const handleStopSilent = useCallback(() => {
        setIsRunning(false);
        setIsPaused(false); // Clear paused state when stopping silently
        if (isBroadcasting) {
            stopGlobalTimer();
        }
    }, [isBroadcasting, stopGlobalTimer]);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        isRunning: () => isRunning || (isBroadcasting && globalTimerState.isRunning),
        isPaused: () => isPaused, // Whether the timer is paused (vs not started)
        getTime: () => ({ hours, minutes, seconds, totalElapsed }),
        start: handleStart,
        startSilent: handleStartSilent, // Start without triggering onStart callback (for syncing)
        pause: handlePause, // Pause without logging
        stop: handlePause, // Alias for pause (backward compatibility)
        end: handleEnd, // End and log activity
        stopSilent: handleStopSilent, // Stop without triggering callbacks
        reset: reset,
        // setTime: update local timer display. skipGlobalUpdate=true when syncing FROM global
        setTime: (h, m, s, options = {}) => {
            let skipGlobalUpdate = false;
            let resetElapsed = false;
            if (typeof options === 'boolean') {
                skipGlobalUpdate = options;
            } else if (options) {
                skipGlobalUpdate = options.skipGlobalUpdate || false;
                resetElapsed = options.resetElapsed || false;
            }
            
            // Set resetting flag to prevent race conditions with stale global state
            if (resetElapsed) {
                isResettingRef.current = true;
                justResetRef.current = true; // Force fresh start in handleStart
            }
            
            setLocalHours(h);
            setLocalMinutes(m);
            setLocalSeconds(s);
            if (resetElapsed) {
                setHasTimeUpTriggered(false);
                setHasStarted(false); // Reset so handleTimerStart is called for new member
                hasStartedRef.current = false;
                pauseSnapshotRef.current = null;
                didInvokeOnStartRef.current = false;
                setIsPaused(false); // Reset paused state so auto-start can work for new member
            }
            const newTotal = resetElapsed
                ? 0
                : mode === 'countdown'
                    ? Math.max(0, initialTotalSeconds - (h * 3600 + m * 60 + s))
                    : h * 3600 + m * 60 + s;
            setTotalElapsed(newTotal);
            // Only update global if broadcasting AND not syncing from global
            if (isBroadcasting && !skipGlobalUpdate) {
                const elapsed = mode === 'countdown' 
                    ? { hours: 0, minutes: 0, seconds: 0 } // Reset elapsed for countdown
                    : { hours: h, minutes: m, seconds: s };
                setGlobalTimer({
                    ...elapsed,
                    mode: mode
                });
            }
            
            // Clear resetting flag after state updates have time to propagate
            if (resetElapsed) {
                setTimeout(() => {
                    isResettingRef.current = false;
                }, 200);
            }
        },
        // Set time from global state (syncing) - only updates local, not global
        setTimeFromGlobal: (h, m, s) => {
            setLocalHours(h);
            setLocalMinutes(m);
            setLocalSeconds(s);
            setTotalElapsed(h * 3600 + m * 60 + s);
        },
        // Reset and keep running (for seat change)
        resetAndContinue: (h, m, s) => {
            setLocalHours(h);
            setLocalMinutes(m);
            setLocalSeconds(s);
            setTotalElapsed(h * 3600 + m * 60 + s);
            // Also update global if broadcasting
            if (isBroadcasting) {
                const elapsed = mode === 'countdown' 
                    ? { hours: 0, minutes: 0, seconds: 0 }
                    : { hours: h, minutes: m, seconds: s };
                setGlobalTimer({
                    ...elapsed,
                    isRunning: true,
                    mode: mode
                });
            }
        },
        hydrateFromSnapshot: ({
            hours: snapHours = 0,
            minutes: snapMinutes = 0,
            seconds: snapSeconds = 0,
            markStarted = false,
            skipGlobalUpdate = false
        } = {}) => {
            setLocalHours(snapHours);
            setLocalMinutes(snapMinutes);
            setLocalSeconds(snapSeconds);
            const displayedTotal = snapHours * 3600 + snapMinutes * 60 + snapSeconds;
            const newElapsed = mode === 'countdown'
                ? Math.max(0, initialTotalSeconds - displayedTotal)
                : displayedTotal;
            setTotalElapsed(newElapsed);
            setIsRunning(false);
            setIsPaused(true);
            setHasTimeUpTriggered(false);
            pauseSnapshotRef.current = { hours: snapHours, minutes: snapMinutes, seconds: snapSeconds };
            if (markStarted) {
                setHasStarted(true);
                hasStartedRef.current = true;
                didInvokeOnStartRef.current = true;
            }
            if (isBroadcasting && !skipGlobalUpdate) {
                const elapsedPayload = mode === 'countdown'
                    ? remainingToElapsed(snapHours, snapMinutes, snapSeconds)
                    : { hours: snapHours, minutes: snapMinutes, seconds: snapSeconds };
                setGlobalTimer({
                    ...elapsedPayload,
                    isRunning: false,
                    mode
                });
            }
        },
        // Update broadcast window with new data (member/chairperson change)
        updateBroadcastData: (newData) => {
            if (isBroadcasting) {
                globalUpdateBroadcastData(newData);
            }
        },
        // Check if broadcasting
        isBroadcasting: () => isBroadcasting
    }), [isRunning, isPaused, isBroadcasting, globalTimerState.isRunning, hours, minutes, seconds, totalElapsed, handleStart, handleStartSilent, handlePause, handleEnd, handleStopSilent, reset, mode, setGlobalTimer, globalUpdateBroadcastData, initialTotalSeconds, remainingToElapsed]);

    // Auto-start if prop is true
    useEffect(() => {
        if (autoStart && !isRunning) {
            setIsRunning(true);
            onStart();
            didInvokeOnStartRef.current = true;
            setHasStarted(true);
        }
    }, [autoStart, isRunning, onStart]);

    const handleResetClick = () => {
        if (confirmReset) {
            setShowResetConfirm(true);
        } else {
            reset();
        }
    };

    const cancelReset = () => {
        setShowResetConfirm(false);
    };

    // Note: We no longer sync local to global on every tick
    // Global timer runs independently in BroadcastContext
    // Local timer only runs when NOT broadcasting

    // Note: We don't close broadcast on unmount anymore - it persists across page navigation

    // Local timer interval - only runs when NOT broadcasting
    // When broadcasting, global timer handles the timing and we derive display from it
    useEffect(() => {
        let interval = null;

        // Don't run local timer when broadcasting - global timer handles it
        if (isRunning && !isBroadcasting) {
            interval = setInterval(() => {
                if (mode === 'countup') {
                    // Count up - use total elapsed for simplicity
                    setTotalElapsed(prev => {
                        const newTotal = prev + 1;
                        const newHours = Math.floor(newTotal / 3600);
                        const newMins = Math.floor((newTotal % 3600) / 60);
                        const newSecs = newTotal % 60;

                        setLocalHours(newHours);
                        setLocalMinutes(newMins);
                        setLocalSeconds(newSecs);

                        // Fire onTick with total elapsed seconds
                        onTick(newTotal);

                        return newTotal;
                    });
                } else {
                    // Count down - update all states together to avoid sync issues
                    setLocalSeconds(prevSec => {
                        let newSec = prevSec;
                        let newMin = localMinutes;
                        let newHrs = localHours;

                        if (newSec > 0) {
                            newSec = prevSec - 1;
                        } else if (newMin > 0) {
                            newSec = 59;
                            newMin = newMin - 1;
                            setLocalMinutes(newMin);
                        } else if (newHrs > 0) {
                            newSec = 59;
                            newMin = 59;
                            newHrs = newHrs - 1;
                            setLocalHours(newHrs);
                            setLocalMinutes(newMin);
                        } else {
                        const remaining = newHrs * 3600 + newMin * 60 + newSec;
                        if (remaining <= 0 && !hasTimeUpTriggered) {
                            onTimeUp();
                            setHasTimeUpTriggered(true);
                        }
                        setLocalHours(0);
                        setLocalMinutes(0);
                        setLocalSeconds(0);
                        const remainingTotal = 0;
                        onTick(remainingTotal);
                            return 0;
                        }

                    // Fire onTick with remaining seconds for countdown mode
                    const remainingTotal = newHrs * 3600 + newMin * 60 + newSec;
                    onTick(remainingTotal);

                        return newSec;
                    });
                }
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [isRunning, isBroadcasting, mode, localMinutes, localHours, onTimeUp, onTick]);
    
    // Fire onTick when global timer updates (during broadcasting)
    // Also keep totalElapsed in sync with globalTimerState when broadcasting
    useEffect(() => {
        if (isBroadcasting) {
            // Always sync totalElapsed with globalTimerState when broadcasting
            const elapsedTotal = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
            setTotalElapsed(elapsedTotal);
            
            if (globalTimerState.isRunning) {
                if (mode === 'countdown') {
                    // For countdown, onTick expects remaining seconds
                    const remaining = Math.max(0, initialTotalSeconds - elapsedTotal);
                    onTick(remaining);

                    // Check if time is up
                    if (remaining <= 0 && !hasTimeUpTriggered) {
                        onTimeUp();
                        setHasTimeUpTriggered(true);
                    }
                } else {
                    // For count up, onTick expects elapsed seconds
                    onTick(elapsedTotal);
                }
            }
        }
    }, [globalTimerState.hours, globalTimerState.minutes, globalTimerState.seconds, isBroadcasting, globalTimerState.isRunning, mode, initialTotalSeconds, initialHours, initialMinutes, initialSeconds, hasTimeUpTriggered, onTick, onTimeUp]);

    const formatTime = (h, m, s) => {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const isTimeUp = mode === 'countdown' && hours === 0 && minutes === 0 && seconds === 0;

    // Compact mode for single-page view
    if (compact) {
        const timerContent = (
            <>
                {/* Timer Display - Smaller */}
                <div className={`timer-font text-3xl md:text-4xl font-bold px-4 py-2 rounded-lg shadow-inner ${isTimeUp
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'bg-gradient-to-br from-red-50 to-red-100 text-red-800'
                    }`}>
                    {formatTime(hours, minutes, seconds)}
                </div>

                {/* Controls - Smaller */}
                <div className="flex gap-2">
                    <button
                        onClick={isRunning ? handlePause : handleStart}
                        disabled={!hasEntry}
                        className={`flex items-center gap-1 ${startPauseClass} disabled:from-gray-400 disabled:to-gray-500 text-white ${compactButtonSizing} rounded-lg font-bold transition-all disabled:cursor-not-allowed`}
                    >
                        {isRunning ? <Pause size={compactIconSize} /> : <Play size={compactIconSize} />}
                        {isRunning ? 'Pause' : 'Start'}
                    </button>

                    {/* End Button */}
                    <button
                        onClick={handleEnd}
                        disabled={!canEnd}
                        className="flex items-center gap-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:cursor-not-allowed"
                    >
                        <Square size={16} />
                        End
                    </button>

                    <button
                        onClick={handleResetClick}
                        disabled={!hasEntry}
                        className="flex items-center gap-1 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white px-3 py-2 rounded-lg font-bold text-sm disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed"
                    >
                        <RotateCcw size={16} />
                        Reset
                    </button>
                </div>
            </>
        );

        // If inline prop is true, return without wrapper
        return (
            <>
            <div className="flex items-center justify-center gap-4">
                {timerContent}
            </div>
                
                {/* Reset Confirmation Modal - Using Portal */}
                {showResetConfirm && (
                    <ResetConfirmModal onConfirm={reset} onCancel={cancelReset} />
                )}
            </>
        );
    }

    // Normal mode
    return (
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10">
                {/* Timer Display */}
                <div className={`timer-font text-5xl md:text-7xl font-bold px-8 py-4 rounded-xl shadow-inner ${isTimeUp
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'bg-gradient-to-br from-red-50 to-red-100 text-red-800'
                    }`}>
                    {formatTime(hours, minutes, seconds)}
                </div>

                {/* Controls */}
                <div className="flex gap-3">
                    <button
                        onClick={isRunning ? handlePause : handleStart}
                        disabled={!hasEntry}
                        className={`flex items-center gap-2 ${startPauseClass} disabled:from-gray-400 disabled:to-gray-500 text-white ${primaryButtonSizing} min-w-[150px] rounded-xl font-bold transition-all hover:-translate-y-1 hover:shadow-lg disabled:hover:translate-y-0 disabled:cursor-not-allowed`}
                    >
                        {isRunning ? <Pause size={primaryIconSize} /> : <Play size={primaryIconSize} />}
                        {isRunning ? 'Pause' : 'Start'}
                    </button>

                    {/* End Button */}
                    <button
                        onClick={handleEnd}
                        disabled={!canEnd}
                        className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-6 py-3 rounded-xl font-bold text-lg transition-all hover:-translate-y-1 hover:shadow-lg disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                        <Square size={24} />
                        End
                    </button>

                    <button
                        onClick={handleResetClick}
                        disabled={!hasEntry}
                        className="flex items-center gap-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white px-6 py-3 rounded-xl font-bold text-lg transition-all hover:-translate-y-1 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500"
                    >
                        <RotateCcw size={24} />
                        Reset
                    </button>
                </div>
            </div>
            
            {/* Reset Confirmation Modal - Using Portal */}
            {showResetConfirm && (
                <ResetConfirmModal onConfirm={reset} onCancel={cancelReset} />
            )}
        </div>
    );
});

export default Timer;
