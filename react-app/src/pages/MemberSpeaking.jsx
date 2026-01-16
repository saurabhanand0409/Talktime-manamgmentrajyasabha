import { useState, useRef, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Timer from '../components/Timer';
import MemberPanelCompact from '../components/MemberPanelCompact';
import ChairDisplay from '../components/ChairDisplay';
import { useSocket } from '../context/SocketContext';
import { useChairperson } from '../context/ChairpersonContext';
import { useBroadcast } from '../context/BroadcastContext';
import { Mic } from 'lucide-react';
import { getISTNow, formatISTForMySQL, normalizeSeatNo, seatsEqual } from '../utils/timezone';

const MS_TIMER_SNAPSHOT_KEY = 'ms_timer_snapshot';
const MS_HEADINGS_KEY = 'ms_headings';
const MS_SELECTED_HEADING_KEY = 'ms_selected_heading';
const DEFAULT_HEADING = 'Member Speaking';

export default function MemberSpeaking() {
    const { selectedSeat, setSelectedSeat, memberData } = useSocket();
    const { chairperson, selectedChairpersonData } = useChairperson();
    const { setChairpersonData, isBroadcasting, globalTimerState, startBroadcastType, isBroadcastWindowOpen, startGlobalTimer } = useBroadcast();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [headings, setHeadings] = useState([DEFAULT_HEADING]);
    const [selectedHeading, setSelectedHeading] = useState(DEFAULT_HEADING);
    const [showHeadingModal, setShowHeadingModal] = useState(false);
    const [newHeading, setNewHeading] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);
    const prevMemberRef = useRef(null);
    const prevSeatRef = useRef(null);
    const isTimerRunningRef = useRef(false);
    const isInitialMountRef = useRef(true);
    const isBroadcastingRef = useRef(false);
    
    // Flags to control auto-start behavior
    const suppressAutoStartRef = useRef(false);
    const didRestoreFromGlobalRef = useRef(false);
    const hasLoadedHeadingsRef = useRef(false);
    const isResumingFromPauseRef = useRef(false);
    const pausedElapsedRef = useRef(0);
    
    // Refs for heading modal inputs (moved to parent to prevent re-creation)
    const addHeadingInputRef = useRef(null);
    const editHeadingInputRef = useRef(null);
    
    const normalizeHeading = (value = '') => {
        return (value || '').trim().toUpperCase();
    };

    const loadHeadings = () => {
        if (typeof window === 'undefined') return;
        try {
            const storedList = JSON.parse(localStorage.getItem(MS_HEADINGS_KEY) || '[]');
            const normalizedDefault = normalizeHeading(DEFAULT_HEADING);
            const cleaned = storedList
                .map(normalizeHeading)
                .filter(Boolean);
            if (!cleaned.includes(normalizedDefault)) {
                cleaned.unshift(normalizedDefault);
            }
            setHeadings(cleaned);

            const storedSelected = localStorage.getItem(MS_SELECTED_HEADING_KEY);
            const normalizedSelected = normalizeHeading(storedSelected || DEFAULT_HEADING);
            setSelectedHeading(cleaned.includes(normalizedSelected) ? normalizedSelected : normalizedDefault);
        } catch {
            setHeadings([normalizeHeading(DEFAULT_HEADING)]);
            setSelectedHeading(normalizeHeading(DEFAULT_HEADING));
        } finally {
            hasLoadedHeadingsRef.current = true;
        }
    };

    const persistHeadings = (list = [], selected = DEFAULT_HEADING) => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(MS_HEADINGS_KEY, JSON.stringify(list));
        localStorage.setItem(MS_SELECTED_HEADING_KEY, selected);
    };

    // Keep broadcasting ref in sync
    useEffect(() => {
        isBroadcastingRef.current = isBroadcasting;
    }, [isBroadcasting]);

    // Load headings on mount
    useEffect(() => {
        loadHeadings();
    }, []);

    // Get broadcast data for starting broadcast
    const getBroadcastData = () => {
        return {
            type: 'Member Speaking',
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
            customHeading: selectedHeading
        };
    };

    const clearPausedSnapshot = () => {
        if (typeof window === 'undefined') return;
        sessionStorage.removeItem(MS_TIMER_SNAPSHOT_KEY);
        suppressAutoStartRef.current = false;
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
            elapsedSeconds,
            startTime: startTimeRef.current ? startTimeRef.current.toISOString() : null,
            prevMember: prevMemberRef.current,
            prevSeat: prevSeatRef.current,
            selectedSeat
        };
        try {
            sessionStorage.setItem(MS_TIMER_SNAPSHOT_KEY, JSON.stringify(snapshot));
            suppressAutoStartRef.current = true;
        } catch (err) {
            console.warn('Unable to persist Member Speaking snapshot', err);
        }
    };

    // On mount: restore state from global timer (if broadcasting) or from snapshot (if paused)
    useEffect(() => {
        if (!isInitialMountRef.current) return;
        isInitialMountRef.current = false;
        
        // Case 1: Broadcasting and global timer is RUNNING - sync and keep running
        if (isBroadcasting && globalTimerState.isRunning) {
            console.log('MS: Returning with running broadcast, syncing from global');
            const globalElapsed = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
            
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
            
            setTimeout(() => {
                if (timerRef.current) {
                    timerRef.current.setTimeFromGlobal(globalTimerState.hours, globalTimerState.minutes, globalTimerState.seconds);
                    timerRef.current.startSilent();
                }
            }, 50);
            return;
        }
        
        // Case 2: Broadcasting but global timer is PAUSED - sync paused state
        if (isBroadcasting && !globalTimerState.isRunning && 
            (globalTimerState.hours > 0 || globalTimerState.minutes > 0 || globalTimerState.seconds > 0)) {
            console.log('MS: Returning with paused broadcast, syncing from global');
            const globalElapsed = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
            
            setElapsedSeconds(globalElapsed);
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
            
            suppressAutoStartRef.current = true;
            didRestoreFromGlobalRef.current = true;
            isResumingFromPauseRef.current = true;
            pausedElapsedRef.current = globalElapsed;
            
            setTimeout(() => {
                if (timerRef.current) {
                    timerRef.current.hydrateFromSnapshot({
                        hours: globalTimerState.hours,
                        minutes: globalTimerState.minutes,
                        seconds: globalTimerState.seconds,
                        markStarted: true,
                        skipGlobalUpdate: true
                    });
                }
            }, 50);
            return;
        }
        
        // Case 3: Not broadcasting - check for paused snapshot
        const stored = sessionStorage.getItem(MS_TIMER_SNAPSHOT_KEY);
        if (stored) {
            try {
                const snapshot = JSON.parse(stored);
                console.log('MS: Restoring from paused snapshot', snapshot);
                
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
                console.warn('Invalid Member Speaking snapshot, clearing...', err);
                sessionStorage.removeItem(MS_TIMER_SNAPSHOT_KEY);
            }
        }
        
        // Case 4: Fresh start - set prev seat ref
        prevSeatRef.current = normalizeSeatNo(selectedSeat);
    }, []); // Only run once on mount

    // Handle seat change - log previous member if timer was running
    useEffect(() => {
        // Skip on initial mount (handled above)
        if (didRestoreFromGlobalRef.current) {
            didRestoreFromGlobalRef.current = false;
            return;
        }
        
        // Only process if seat actually changed (normalize to handle leading zeros like "01" vs "1")
        if (selectedSeat && !seatsEqual(selectedSeat, prevSeatRef.current) && prevSeatRef.current !== null) {
            console.log('MS: Seat changed from', prevSeatRef.current, 'to', selectedSeat);
            clearPausedSnapshot();
            suppressAutoStartRef.current = false;
            isResumingFromPauseRef.current = false;
            pausedElapsedRef.current = 0;
            
            // Log previous member if timer was started (running OR paused with elapsed time)
            // Get current timer state for paused time (count-up: timer shows elapsed directly)
            const currentTimerState = timerRef.current?.getTime?.();
            const timerElapsed = currentTimerState 
                ? (currentTimerState.hours * 3600 + currentTimerState.minutes * 60 + currentTimerState.seconds)
                : 0;
            const hasElapsedTime = elapsedSeconds > 0 || timerElapsed > 0 || pausedElapsedRef.current > 0;
            
            if (startTimeRef.current && hasElapsedTime) {
                if (prevMemberRef.current && prevMemberRef.current.name && prevMemberRef.current.name.trim() !== '') {
                    const logPreviousMember = async () => {
                        const endTime = getISTNow();
                        // Use timer-tracked time, NOT wall-clock time (which includes paused duration)
                        // Priority: pausedElapsedRef (if paused) > timerElapsed > elapsedSeconds
                        let durationSeconds;
                        if (pausedElapsedRef.current > 0) {
                            // Timer was paused - use the stored paused time
                            durationSeconds = pausedElapsedRef.current;
                        } else if (timerElapsed > 0) {
                            // Timer is running - use current timer elapsed
                            durationSeconds = timerElapsed;
                        } else if (elapsedSeconds > 0) {
                            // Fallback to state-tracked elapsed
                            durationSeconds = elapsedSeconds;
                        } else {
                            // Minimum 1 second if started
                            durationSeconds = 1;
                        }

            try {
                await fetch('http://localhost:5000/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'Member Speaking',
                                    member_name: prevMemberRef.current.name,
                                    chairperson: chairperson || '',
                                    start_time: formatISTForMySQL(startTimeRef.current),
                                    end_time: formatISTForMySQL(endTime),
                                    duration_seconds: durationSeconds,
                                    spoken_seconds: durationSeconds,
                                    seat_no: prevMemberRef.current.seat_no || prevSeatRef.current || '',
                                    party: prevMemberRef.current.party || '',
                                    heading: selectedHeading || '',
                                    notes: 'Seat changed - timer reset'
                                }),
                            });
                            console.log('MS: Logged activity for', prevMemberRef.current.name, 'party:', prevMemberRef.current.party, 'duration:', durationSeconds);
                        } catch (error) {
                            console.error('MS: Error logging activity:', error);
                        }
                    };
                    logPreviousMember();
                }
            }
            
            // Reset timer - MUST stop first, then reset
            if (timerRef.current) {
                // Stop the timer first (this is synchronous for local state)
                if (isTimerRunningRef.current) {
                    timerRef.current.stopSilent();
                }
                // Reset to initial time (0:00 for count-up)
                timerRef.current.setTime(0, 0, 0, { resetElapsed: true });
            }
            isTimerRunningRef.current = false;
            setElapsedSeconds(0);
            startTimeRef.current = null;
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
            
            // Mark that we need to auto-start when memberData is ready
            // Use a small delay to ensure state is clean before auto-start
            setTimeout(() => {
                if (timerRef.current && !suppressAutoStartRef.current && memberData) {
                    timerRef.current.start();
                }
            }, 150);
        }
    }, [selectedSeat, chairperson, elapsedSeconds]);

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
                timerRef.current.setTime(0, 0, 0, { resetElapsed: true });
                setTimeout(() => {
                    if (timerRef.current && !suppressAutoStartRef.current && !isTimerRunningRef.current) {
                        timerRef.current.start();
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
                    },
                    customHeading: selectedHeading
                });
            }
        }
    }, [memberData, selectedSeat, selectedHeading]);

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
                        activity_type: 'Member Speaking',
                        member_name: currentMember.name,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        spoken_seconds: durationSeconds,
                        seat_no: currentMember.seat_no || currentMember.seat || '',
                        party: currentMember.party || '',
                        heading: selectedHeading || '',
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
    }, [chairperson]);

    // Timer event handlers
    const handleTimerStart = () => {
        suppressAutoStartRef.current = false;
        clearPausedSnapshot();
        isTimerRunningRef.current = true;
        
        // Check if we're resuming from a paused state
        if (isResumingFromPauseRef.current && pausedElapsedRef.current > 0) {
            // Resuming: adjust startTimeRef to account for already-elapsed time
            const pausedElapsed = pausedElapsedRef.current;
            startTimeRef.current = new Date(getISTNow().getTime() - pausedElapsed * 1000);
            // Don't reset elapsedSeconds - it was already set during snapshot restoration
            console.log('MS: Resuming from pause, elapsed:', pausedElapsed);
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
        }
        // If already broadcasting, ensure heading is updated
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({ customHeading: selectedHeading });
        }
    };

    const handleTimerTick = (totalElapsed) => {
        setElapsedSeconds(totalElapsed);
    };

    const handleTimerEnd = async () => {
        isTimerRunningRef.current = false;
        clearPausedSnapshot();
        suppressAutoStartRef.current = false;
        
        const memberName = memberData?.name || prevMemberRef.current?.name;
        if (startTimeRef.current && memberName && memberName.trim() !== '') {
            const endTime = getISTNow();
            const durationSeconds = elapsedSeconds > 0 ? elapsedSeconds : Math.floor((endTime - startTimeRef.current) / 1000);

            try {
                await fetch('http://localhost:5000/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'Member Speaking',
                        member_name: memberName,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        spoken_seconds: durationSeconds,
                        seat_no: selectedSeat || prevMemberRef.current?.seat_no || '',
                        party: memberData?.party || prevMemberRef.current?.party || '',
                        heading: selectedHeading || '',
                        notes: 'Speaking session ended'
                    }),
                });
            } catch (error) {
                console.error('Error logging activity:', error);
            }
            }
            startTimeRef.current = null;
        setElapsedSeconds(0);
        setSelectedSeat('');
    };
    
    const handleTimerPause = () => {
        // Mark timer as not running locally
        isTimerRunningRef.current = false;
        // Store current elapsed time for logging on seat change
        // Use totalElapsed which correctly tracks the actual elapsed time
        if (timerRef.current?.getTime) {
            const timeState = timerRef.current.getTime();
            pausedElapsedRef.current = timeState.totalElapsed || (timeState.hours * 3600 + timeState.minutes * 60 + timeState.seconds);
        }
        // Persist snapshot for resume after navigation
        persistPausedSnapshot();
    };

    // Heading modal handlers (moved from nested component to prevent re-creation)
    const handleHeadingSelectChange = (e) => {
        const value = normalizeHeading(e.target.value);
        setSelectedHeading(value);
        persistHeadings(headings, value);
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({ customHeading: value });
        }
    };

    const handleAddHeading = () => {
        const value = normalizeHeading(newHeading);
        if (!value) return;
        if (headings.includes(value)) {
            setSelectedHeading(value);
            setNewHeading('');
            persistHeadings(headings, value);
            return;
        }
        const updated = [...headings, value];
        setHeadings(updated);
        setSelectedHeading(value);
        setNewHeading('');
        persistHeadings(updated, value);
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({ customHeading: value });
        }
    };

    const startHeadingEdit = (idx, current) => {
        setEditingIndex(idx);
        setEditingValue(current);
    };

    const saveHeadingEdit = (idx) => {
        const value = normalizeHeading(editingValue);
        if (!value) return;
        const updated = headings.map((h, i) => i === idx ? value : h);
        setHeadings(updated);
        const nextSelected = idx === headings.findIndex(h => h === selectedHeading) ? value : selectedHeading;
        setSelectedHeading(nextSelected);
        setEditingIndex(null);
        setEditingValue('');
        persistHeadings(updated, nextSelected);
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({ customHeading: nextSelected });
        }
    };

    const handleHeadingDelete = (idx) => {
        if (idx === 0) return; // Default not deletable
        const updated = headings.filter((_, i) => i !== idx);
        const nextSelected = selectedHeading === headings[idx] ? headings[0] : selectedHeading;
        setHeadings(updated);
        setSelectedHeading(nextSelected);
        persistHeadings(updated, nextSelected);
        if (timerRef.current?.isBroadcasting?.()) {
            timerRef.current.updateBroadcastData({ customHeading: nextSelected });
        }
    };

    // Focus input when modal opens or edit mode changes
    useEffect(() => {
        if (showHeadingModal && addHeadingInputRef.current && editingIndex === null) {
            addHeadingInputRef.current.focus();
        }
        if (showHeadingModal && editHeadingInputRef.current && editingIndex !== null) {
            editHeadingInputRef.current.focus();
        }
    }, [showHeadingModal, editingIndex]);

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100 overflow-hidden">
            <Header showBack />
            
            {/* Heading Modal - Inline to prevent flashing */}
            {showHeadingModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] px-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-red-800">Change Heading</h3>
                            <button
                                onClick={() => setShowHeadingModal(false)}
                                className="text-gray-500 hover:text-red-700 font-bold text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700">Select Heading</label>
                            <select
                                value={selectedHeading}
                                onChange={handleHeadingSelectChange}
                                className="w-full border rounded-lg px-3 py-2 font-bold text-red-800 bg-gray-50"
                            >
                                {headings.map((h, idx) => (
                                    <option key={idx} value={h}>{h}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Add New Heading</label>
                            <div className="flex gap-2">
                                <input
                                    ref={addHeadingInputRef}
                                    type="text"
                                    value={newHeading}
                                    onChange={(e) => setNewHeading(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddHeading()}
                                    placeholder="Enter heading (auto uppercased)"
                                    className="flex-1 border rounded-lg px-3 py-2"
                                />
                                <button
                                    onClick={handleAddHeading}
                                    className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Manage Headings</label>
                            <div className="space-y-2 max-h-48 overflow-auto">
                                {headings.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                                        <span className="font-semibold text-red-800 flex-1">
                                            {editingIndex === idx ? (
                                                <input
                                                    ref={editHeadingInputRef}
                                                    className="w-full border rounded px-2 py-1"
                                                    value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && saveHeadingEdit(idx)}
                                                />
                                            ) : (
                                                h
                                            )}
                                        </span>
                                        {idx === 0 ? (
                                            <span className="text-xs text-gray-500 font-semibold">Default</span>
                                        ) : editingIndex === idx ? (
                                            <button
                                                onClick={() => saveHeadingEdit(idx)}
                                                className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg font-semibold"
                                            >
                                                Save
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => startHeadingEdit(idx, h)}
                                                    className="text-sm px-3 py-1 bg-amber-500 text-white rounded-lg font-semibold"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleHeadingDelete(idx)}
                                                    className="text-sm px-3 py-1 bg-red-600 text-white rounded-lg font-semibold"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowHeadingModal(false)}
                                className="px-4 py-2 bg-gray-200 rounded-lg font-semibold text-gray-700 hover:bg-gray-300"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-7xl mx-auto px-4 py-2 w-full flex flex-col gap-3 overflow-hidden">
                {/* Page Title + Heading control */}
                <div className="animate-fade-in flex flex-col items-center gap-3 text-center">
                    <div className="flex items-center gap-3">
                    <Mic size={28} className="text-red-800" />
                        <h2 className="text-2xl md:text-3xl font-bold text-red-800">{selectedHeading}</h2>
                    </div>
                    <button
                        onClick={() => setShowHeadingModal(true)}
                        className="px-4 py-2 bg-red-700 text-white rounded-lg font-semibold hover:bg-red-800"
                    >
                        Change Heading
                    </button>
                </div>

                {/* Timer */}
                <div className="animate-fade-in">
                    <Timer
                        ref={timerRef}
                        mode="countup"
                        initialMinutes={0}
                        initialSeconds={0}
                        onStart={handleTimerStart}
                        onStop={handleTimerPause}
                        onEnd={handleTimerEnd}
                        onTick={handleTimerTick}
                        compact={true}
                        hasEntry={!!memberData}
                    />
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
