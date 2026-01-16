import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Timer from '../components/Timer';
import MemberPanelCompact from '../components/MemberPanelCompact';
import ChairDisplay from '../components/ChairDisplay';
import { useSocket } from '../context/SocketContext';
import { useChairperson } from '../context/ChairpersonContext';
import { useBroadcast } from '../context/BroadcastContext';
import { FileText, Clock } from 'lucide-react';
import { getISTNow, formatISTForMySQL, normalizeSeatNo, seatsEqual } from '../utils/timezone';

export default function BillDiscussions() {
    const LOCAL_STORAGE_KEY = 'bd_selected_bill_id';
    const BD_SESSION_KEY = 'bd_active_session'; // Session storage for active broadcast session
    const { selectedSeat, setSelectedSeat, memberData } = useSocket();
    const { chairperson, selectedChairpersonData } = useChairperson();
    const { setChairpersonData, isBroadcasting, globalTimerState, startBroadcastType, isBroadcastWindowOpen, startGlobalTimer, setGlobalTimer } = useBroadcast();
    const [bills, setBills] = useState([]);
    const [selectedBill, setSelectedBill] = useState(null);
    const [loading, setLoading] = useState(true);
    const [consumedTime, setConsumedTime] = useState({});
    const [currentElapsed, setCurrentElapsed] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [memberSpokenTotals, setMemberSpokenTotals] = useState({});
    const [memberTotalsFetchedForSeat, setMemberTotalsFetchedForSeat] = useState(null); // Track which seat the totals are for
    const [activeBillSession, setActiveBillSession] = useState(null); // Snapshot of bill used for current timer session

    const incrementPartyConsumed = useCallback((partyName, additionalSeconds) => {
        if (!partyName || !additionalSeconds || additionalSeconds <= 0) return;
        // Update ref SYNCHRONOUSLY first (this is read by buildPartyTimeDataPayload)
        const newTotal = (consumedTimeRef.current[partyName] || 0) + additionalSeconds;
        consumedTimeRef.current = {
            ...consumedTimeRef.current,
            [partyName]: newTotal
        };
        console.log('BD incrementPartyConsumed:', partyName, '+', additionalSeconds, '= new total:', newTotal);
        // Also update state for React
        setConsumedTime(prev => ({
            ...prev,
            [partyName]: newTotal
        }));
    }, []);
    const billHydratedRef = useRef(false);
    
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);
    const prevMemberRef = useRef(null);
    const prevSeatRef = useRef(null);
    const isTimerRunningRef = useRef(false);
    const selectedBillRef = useRef(null); // Track current bill for cleanup
    const isInitialMountRef = useRef(true); // Track if this is initial mount
    const isBroadcastingRef = useRef(false); // Track broadcasting state for cleanup
    const memberBaseSpokenRef = useRef(0); // Accumulated spoken time before current stint
    const sessionStartBaseRef = useRef(0); // Base spoken time at the START of current session (locked, won't change during run)
    const isEndingRef = useRef(false); // Guard flag to prevent auto-start during end operation
    const pausedElapsedRef = useRef(0); // Store elapsed time when paused for logging on seat change
    const memberSpokenTotalsRef = useRef({}); // Ref to track member totals synchronously (avoids React state timing issues)
    const consumedTimeRef = useRef({}); // Ref to track party consumed time synchronously
    
    // Persist BD session state to sessionStorage (survives navigation)
    const persistBDSession = useCallback(() => {
        if (!isBroadcastingRef.current) return;
        const sessionData = {
            startTime: startTimeRef.current ? startTimeRef.current.toISOString() : null,
            sessionStartBase: sessionStartBaseRef.current,
            memberBase: memberBaseSpokenRef.current,
            prevMember: prevMemberRef.current,
            prevSeat: prevSeatRef.current,
            memberSpokenTotals: memberSpokenTotalsRef.current,
            consumedTime: consumedTimeRef.current
        };
        try {
            sessionStorage.setItem(BD_SESSION_KEY, JSON.stringify(sessionData));
            console.log('BD: Persisted session state:', sessionData);
        } catch (e) {
            console.warn('BD: Failed to persist session state', e);
        }
    }, []);
    
    // Restore BD session state from sessionStorage
    const restoreBDSession = useCallback(() => {
        try {
            const saved = sessionStorage.getItem(BD_SESSION_KEY);
            if (!saved) return null;
            const sessionData = JSON.parse(saved);
            console.log('BD: Restored session state:', sessionData);
            return sessionData;
        } catch (e) {
            console.warn('BD: Failed to restore session state', e);
            return null;
        }
    }, []);
    
    // Clear BD session state
    const clearBDSession = useCallback(() => {
        try {
            sessionStorage.removeItem(BD_SESSION_KEY);
            console.log('BD: Cleared session state');
        } catch (e) {
            console.warn('BD: Failed to clear session state', e);
        }
    }, []);
    
    // Keep broadcasting ref in sync
    useEffect(() => {
        isBroadcastingRef.current = isBroadcasting;
    }, [isBroadcasting]);
    
    // Sync isTimerRunningRef when timer resumes (transitions from paused to running)
    // This ensures seat change logic correctly detects running state after pause/resume
    // Also clear pausedElapsedRef so current timer elapsed is used, not stale paused value
    const wasRunningRef = useRef(false);
    useEffect(() => {
        const currentlyRunning = globalTimerState.isRunning || isTimerRunning;
        if (currentlyRunning && !wasRunningRef.current) {
            // Timer just resumed from pause - sync the running ref
            console.log('BD: Timer resumed, setting isTimerRunningRef = true');
            isTimerRunningRef.current = true;
            if (pausedElapsedRef.current > 0) {
                console.log('BD: Clearing pausedElapsedRef (was:', pausedElapsedRef.current, ')');
                pausedElapsedRef.current = 0;
            }
        } else if (!currentlyRunning && wasRunningRef.current) {
            // Timer just stopped/paused - sync the running ref
            console.log('BD: Timer stopped/paused, setting isTimerRunningRef = false');
            isTimerRunningRef.current = false;
        }
        wasRunningRef.current = currentlyRunning;
    }, [globalTimerState.isRunning, isTimerRunning]);

    // Get member's individual time allocation from bill
    const getMemberTimeAllocation = (seatNo) => {
        const workingBill = selectedBill || activeBillSession;
        if (!workingBill?.party_allocations) return null;
        
        // Convert seatNo to both string and number for comparison
        const seatNoStr = String(seatNo);
        const seatNoNum = parseInt(seatNo);
        
        for (const allocation of workingBill.party_allocations) {
            const members = allocation.members || [];
            // Compare with both string and number versions
            const member = members.find(m => 
                String(m.seat_no) === seatNoStr || 
                parseInt(m.seat_no) === seatNoNum
            );
            if (member) {
                console.log('Found member allocation:', member, 'for seat:', seatNo);
                return {
                    hours: member.hours || 0,
                    minutes: member.minutes || 0,
                    totalSeconds: (member.hours || 0) * 3600 + (member.minutes || 0) * 60
                };
            }
        }
        const othersMembers = (
            workingBill?.others_time?.members ||
            selectedBillRef.current?.others_time?.members ||
            []
        );
        const othersMatch = othersMembers.find(m =>
            String(m.seat_no) === seatNoStr ||
            parseInt(m.seat_no) === seatNoNum
        );
        if (othersMatch) {
            return {
                hours: othersMatch.hours || 0,
                minutes: othersMatch.minutes || 0,
                totalSeconds: (othersMatch.hours || 0) * 3600 + (othersMatch.minutes || 0) * 60
            };
        }
        console.log('No allocation found for seat:', seatNo, 'in allocations:', selectedBill?.party_allocations);
        return null;
    };

    // Fetch member totals from backend - MUST be declared before useEffects that use it
    const fetchMemberTotals = useCallback(async (billId, forSeat = null) => {
        if (!billId) {
            setMemberSpokenTotals({});
            memberSpokenTotalsRef.current = {}; // Also clear ref
            setMemberTotalsFetchedForSeat(null);
            return;
        }
        try {
            // Fetch total spoken time for ALL sessions (no date filter)
            const response = await fetch(`http://localhost:5000/api/bill-member-totals/${billId}`);
            const data = await response.json();
            if (data.success) {
                console.log('BD: Raw API response for member totals:', data.data);
                // Normalize seat numbers in the response data
                // SUM values when "1" and "01" both exist (they're the same member)
                // IMPORTANT: Convert to numbers - API returns strings!
                const normalizedData = {};
                for (const [key, value] of Object.entries(data.data || {})) {
                    const normalizedKey = normalizeSeatNo(key);
                    const numValue = parseInt(value, 10) || 0;
                    normalizedData[normalizedKey] = (normalizedData[normalizedKey] || 0) + numValue;
                }
                
                // CRITICAL: MERGE with existing ref data instead of REPLACE
                // This preserves our synchronous updates that may not be in DB yet
                // For each seat, use the HIGHER value (DB might have older data)
                const mergedData = { ...memberSpokenTotalsRef.current };
                for (const [seat, dbValue] of Object.entries(normalizedData)) {
                    const refValue = mergedData[seat] || 0;
                    // Use the higher value - our sync update should be >= DB value
                    mergedData[seat] = Math.max(refValue, dbValue);
                }
                
                setMemberSpokenTotals(mergedData);
                memberSpokenTotalsRef.current = mergedData;
                console.log('BD: Merged member totals (ref preserved):', mergedData);
                // Track that we fetched totals - if forSeat provided, mark it ready (normalized)
                if (forSeat) {
                    setMemberTotalsFetchedForSeat(normalizeSeatNo(forSeat));
                }
            } else {
                // Don't clear on error - keep existing ref data
                if (forSeat) setMemberTotalsFetchedForSeat(normalizeSeatNo(forSeat));
            }
        } catch (error) {
            console.error('Error fetching member totals:', error);
            // Don't clear on error - keep existing ref data
            if (forSeat) setMemberTotalsFetchedForSeat(normalizeSeatNo(forSeat));
        }
    }, []);

    // Get broadcast data for starting broadcast
    const getBroadcastData = () => {
        const sessionBill = selectedBill || activeBillSession;
        // Get party time data - currentParty is the effective party for allocation (may be "Others")
        const currentParty = getCurrentMemberParty();
        const partyTimeData = buildPartyTimeDataPayload(currentParty);
        
        // Add the effective party name to partyTimeData so broadcast knows which allocation is being used
        if (partyTimeData) {
            partyTimeData.effectiveParty = currentParty;
        }
        
        // Get member's individual time allocation
        const memberTimeAlloc = getMemberTimeAllocation(selectedSeat);
        // Timer now starts from the member's base, so spokenBase for broadcast is 0
        // (the timer display IS the total spoken time)
        
        // Get member's base spoken time for initial timer value
        const baseSpoken = memberBaseSpokenRef.current || 0;
        const h = Math.floor(baseSpoken / 3600);
        const m = Math.floor((baseSpoken % 3600) / 60);
        const s = baseSpoken % 60;
        
        return {
            type: 'Bill Discussion',
            billName: sessionBill?.bill_name || '',
            memberData: memberData ? {
                name: memberData.name,
                name_hindi: memberData.name_hindi,
                party: memberData.party,
                state: memberData.state,
                seat_no: selectedSeat,
                picture: memberData.picture
            } : null,
            partyTimeData,
            memberTimeData: memberTimeAlloc ? {
                allocated: memberTimeAlloc.totalSeconds,
                isAllocated: true,
                spokenBase: 0  // Timer starts from base, so no additional base needed
            } : {
                allocated: 0,
                isAllocated: false,
                spokenBase: 0
            },
            chairperson: selectedChairpersonData?.name || '',
            chairpersonPosition: selectedChairpersonData?.position || '',
            chairpersonPhoto: selectedChairpersonData?.picture || null,
            initialTime: { hours: h, minutes: m, seconds: s }  // Start from member's base
        };
    };

    useEffect(() => {
        fetchBills();
        
        // Re-fetch bills when window regains focus or becomes visible (to catch edits made in Bill Details)
        const handleRefresh = () => {
            console.log('BD: Refreshing bills due to focus/visibility change');
            fetchBills();
            // Also refresh selected bill if it exists
            if (selectedBillRef.current?.id) {
                fetchMemberTotals(selectedBillRef.current.id);
            }
        };
        
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleRefresh();
            }
        };
        
        window.addEventListener('focus', handleRefresh);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Poll for bill updates every 5 seconds (to catch allocation changes made in Bill Details)
        const pollInterval = setInterval(() => {
            if (selectedBillRef.current?.id) {
                fetchBills();
            }
        }, 5000);
        
        return () => {
            window.removeEventListener('focus', handleRefresh);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(pollInterval);
        };
    }, [fetchMemberTotals]);

    // Keep selectedBillRef in sync with selectedBill state
    useEffect(() => {
        selectedBillRef.current = selectedBill || activeBillSession;
    }, [selectedBill, activeBillSession]);

    // Keep active session snapshot synced when the same bill gets updated (e.g., rename)
    useEffect(() => {
        if (!activeBillSession || !selectedBill) return;
        if (activeBillSession.id === selectedBill.id && activeBillSession !== selectedBill) {
            setActiveBillSession(selectedBill);
        }
    }, [selectedBill, activeBillSession]);

    // If bill selection is cleared while no timer is running, drop the active session snapshot
    useEffect(() => {
        if (!selectedBill && !isTimerRunningRef.current) {
            setActiveBillSession(null);
        }
    }, [selectedBill]);

    // Persist selected bill across navigation
    useEffect(() => {
        if (!billHydratedRef.current) return;
        if (selectedBill?.id) {
            localStorage.setItem(LOCAL_STORAGE_KEY, String(selectedBill.id));
        } else {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
    }, [selectedBill]);


    // Handle seat change - Reset timer when new member is loaded (but not when returning to page)
    useEffect(() => {
        if (!selectedBill) return;
        // On initial mount, check if we're returning to an active broadcast
        if (isInitialMountRef.current) {
            isInitialMountRef.current = false;
            
            // If broadcasting is active, try to restore session state
            if (isBroadcasting && (globalTimerState.isRunning || globalTimerState.hours > 0 || globalTimerState.minutes > 0 || globalTimerState.seconds > 0)) {
                console.log('Returning to BillDiscussions with active broadcast');
                const globalElapsed = globalTimerState.hours * 3600 + globalTimerState.minutes * 60 + globalTimerState.seconds;
                
                // Try to restore persisted session state
                const savedSession = restoreBDSession();
                
                if (savedSession && savedSession.startTime) {
                    // RESTORE from persisted session - keep original start time and base
                    console.log('BD: Restoring persisted session state');
                    startTimeRef.current = new Date(savedSession.startTime);
                    sessionStartBaseRef.current = savedSession.sessionStartBase || 0;
                    memberBaseSpokenRef.current = savedSession.memberBase || 0;
                    prevMemberRef.current = savedSession.prevMember || null;
                    prevSeatRef.current = savedSession.prevSeat || null;
                    
                    // Restore refs for member totals and consumed time
                    if (savedSession.memberSpokenTotals) {
                        memberSpokenTotalsRef.current = savedSession.memberSpokenTotals;
                    }
                    if (savedSession.consumedTime) {
                        consumedTimeRef.current = savedSession.consumedTime;
                    }
                    
                    console.log('BD: Restored - startTime:', startTimeRef.current, 'sessionStartBase:', sessionStartBaseRef.current);
                } else {
                    // No persisted session - set current timer value as base (new session segment)
                    console.log('BD: No persisted session, starting new segment');
                    memberBaseSpokenRef.current = globalElapsed;
                    sessionStartBaseRef.current = globalElapsed;
                    startTimeRef.current = getISTNow();
                    prevSeatRef.current = normalizeSeatNo(selectedSeat);
                    if (memberData) {
                        const currentParty = getCurrentMemberPartyFromData(memberData);
                        prevMemberRef.current = { 
                            name: memberData.name, 
                            seat: normalizeSeatNo(selectedSeat), 
                            seat_no: normalizeSeatNo(memberData?.seat_no || selectedSeat),
                            party: currentParty
                        };
                    }
                }
                
                setCurrentElapsed(globalElapsed);
                setIsTimerRunning(globalTimerState.isRunning);
                isTimerRunningRef.current = globalTimerState.isRunning;
                
                if (timerRef.current) {
                    // Use setTimeFromGlobal to avoid resetting global state
                    timerRef.current.setTimeFromGlobal(globalTimerState.hours, globalTimerState.minutes, globalTimerState.seconds);
                    if (globalTimerState.isRunning) {
                        // Start the local timer silently (don't trigger onStart which resets state)
                        timerRef.current.startSilent();
                    }
                }
                return;
            }
            
            // Not broadcasting, just set the previous seat ref
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
            return;
        }
        
        // Normalize to handle leading zeros like "01" vs "1"
        if (selectedSeat && !seatsEqual(selectedSeat, prevSeatRef.current)) {
            console.log('BD: Seat changed from', prevSeatRef.current, 'to', selectedSeat);
            console.log('BD: Timer running ref?', isTimerRunningRef.current, 'Start time?', !!startTimeRef.current);
            console.log('BD: pausedElapsedRef:', pausedElapsedRef.current);
            console.log('BD: Timer actual isRunning?', timerRef.current?.isRunning?.(), 'isPaused?', timerRef.current?.isPaused?.());
            console.log('BD: Previous member?', prevMemberRef.current);
            
            // Log previous member if timer was started (running OR paused with elapsed time)
            // Get current timer state for paused time (count-up: timer shows elapsed directly)
            const currentTimerState = timerRef.current?.getTime?.();
            const timerElapsed = currentTimerState 
                ? ((currentTimerState.hours || 0) * 3600 + (currentTimerState.minutes || 0) * 60 + (currentTimerState.seconds || 0))
                : 0;
            // For BD, we need to subtract session start base to get current stint
            // Use sessionStartBaseRef which was locked at handleTimerStart
            const sessionBase = sessionStartBaseRef.current || 0;
            const currentStintElapsed = Math.max(0, timerElapsed - sessionBase);
            
            // Check if timer was ever active - use multiple signals for robustness
            const timerWasActive = timerRef.current?.isRunning?.() || timerRef.current?.isPaused?.() || isTimerRunningRef.current;
            const hasElapsedTime = currentElapsed > 0 || currentStintElapsed > 0 || pausedElapsedRef.current > 0 || timerElapsed > 0;
            
            console.log('BD seat change DEBUG: currentTimerState=', currentTimerState);
            console.log('BD seat change DEBUG: timerElapsed=', timerElapsed, 'sessionBase=', sessionBase, 
                'currentStintElapsed=', currentStintElapsed, 'pausedElapsedRef=', pausedElapsedRef.current,
                'currentElapsed=', currentElapsed, 'hasElapsedTime=', hasElapsedTime, 'timerWasActive=', timerWasActive);
            
            // Log if: we have a start time AND (timer has elapsed time OR timer was active)
            if (startTimeRef.current && (hasElapsedTime || timerWasActive)) {
                // Only log if there was a VALID previous member (with actual name)
                if (prevMemberRef.current && prevMemberRef.current.name && prevMemberRef.current.name.trim() !== '') {
                    const endTime = getISTNow();
                    // Use timer-tracked time, NOT wall-clock time (which includes paused duration)
                    // Priority: currentStintElapsed (always most accurate) > pausedElapsedRef (if timer glitched) > fallbacks
                    let durationSeconds;
                    if (currentStintElapsed > 0) {
                        // Timer has elapsed time - use current stint elapsed (most accurate)
                        durationSeconds = currentStintElapsed;
                    } else if (pausedElapsedRef.current > 0) {
                        // Timer shows 0 but we have paused elapsed - use it
                        durationSeconds = pausedElapsedRef.current;
                    } else if (currentElapsed > sessionBase) {
                        // Fallback to state-tracked elapsed minus session base
                        durationSeconds = currentElapsed - sessionBase;
                    } else {
                        // Minimum 1 second if started
                        durationSeconds = 1;
                    }
                    const currentParty = prevMemberRef.current.party || 'Others';
                    const prevSeat = prevMemberRef.current.seat_no || prevSeatRef.current || '';
                    const memberAlloc = getMemberTimeAllocation(prevSeat);
                    const memberAllottedSeconds = memberAlloc?.totalSeconds || 0;
                    const normalizedPrevSeat = normalizeSeatNo(prevSeat);
                    
                    console.log('BD seat change: Logging previous member:', prevMemberRef.current.name, 'Duration:', durationSeconds, 'sessionBase:', sessionBase);
                    
                    // CRITICAL: Update refs SYNCHRONOUSLY BEFORE the async API call
                    // This ensures the new member starts with correct base values
                    const newMemberTotal = (memberSpokenTotalsRef.current[normalizedPrevSeat] || 0) + durationSeconds;
                    memberSpokenTotalsRef.current = {
                        ...memberSpokenTotalsRef.current,
                        [normalizedPrevSeat]: newMemberTotal
                    };
                    setMemberSpokenTotals(prev => ({
                        ...prev,
                        [normalizedPrevSeat]: newMemberTotal
                    }));
                    
                    // Update party consumed time synchronously
                    const newPartyTotal = (consumedTimeRef.current[currentParty] || 0) + durationSeconds;
                    consumedTimeRef.current = {
                        ...consumedTimeRef.current,
                        [currentParty]: newPartyTotal
                    };
                    setConsumedTime(prev => ({
                        ...prev,
                        [currentParty]: newPartyTotal
                    }));
                    
                    console.log('BD seat change: Updated totals - member:', normalizedPrevSeat, '=', newMemberTotal, 'party:', currentParty, '=', newPartyTotal);

                    // Now do the API call in the background (fire-and-forget)
                    fetch('http://localhost:5000/api/activity-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            activity_type: 'Bill Discussion',
                            member_name: prevMemberRef.current.name,
                            chairperson: chairperson || '',
                            start_time: formatISTForMySQL(startTimeRef.current),
                            end_time: formatISTForMySQL(endTime),
                            duration_seconds: durationSeconds,
                            spoken_seconds: durationSeconds,
                            allotted_seconds: memberAllottedSeconds,
                            bill_name: selectedBillRef.current?.bill_name || '',
                            bill_id: selectedBillRef.current?.id || null,
                            party: currentParty,
                            seat_no: prevSeat,
                            notes: 'Seat changed - timer reset'
                        }),
                    }).then(response => response.json())
                      .then(result => {
                          console.log('BD seat change: Activity log response:', result);
                          // Fetch from DB to ensure consistency (but refs are already updated)
            fetchConsumedTime();
                          if (selectedBillRef.current?.id) {
                              fetchMemberTotals(selectedBillRef.current.id);
                          }
                      })
                      .catch(error => console.error('BD seat change: Error logging activity:', error));
                } else {
                    console.log('BD: No valid previous member to log');
                }
            } else {
                console.log('BD: Timer was not running or no start time');
            }
            
            // Clear paused elapsed for next member
            pausedElapsedRef.current = 0;
            
            // Reset timer to 0:00 and STOP when new member is loaded
            if (timerRef.current) {
                // Stop the timer silently first (handles both running and paused states)
                // Check all possible running states: ref, actual isRunning(), or isPaused()
                const timerActuallyRunning = timerRef.current.isRunning?.() || false;
                const timerPaused = timerRef.current.isPaused?.() || false;
                if (isTimerRunningRef.current || timerActuallyRunning || timerPaused) {
                    console.log('BD: Stopping timer before seat change - ref:', isTimerRunningRef.current, 'actual:', timerActuallyRunning, 'paused:', timerPaused);
                    timerRef.current.stopSilent();
                }
                // Hard reset to zero; also clears any pause snapshot via resetElapsed
                timerRef.current.setTime(0, 0, 0, { resetElapsed: true, skipGlobalUpdate: false });
                isTimerRunningRef.current = false;
                setIsTimerRunning(false);
            }
            setCurrentElapsed(0);
            sessionStartBaseRef.current = 0;
            memberBaseSpokenRef.current = 0;
            startTimeRef.current = null; // Clear start time
            
            // Clear the fetched-for-seat flag - we need fresh data for the new seat
            setMemberTotalsFetchedForSeat(null);
            
            // Refresh member totals from DB for the new seat (pass seat so auto-start knows when ready)
            if (selectedBillRef.current?.id) {
                fetchMemberTotals(selectedBillRef.current.id, selectedSeat);
            }
            
            prevSeatRef.current = normalizeSeatNo(selectedSeat);
        }
    }, [selectedSeat, chairperson, isBroadcasting, globalTimerState, selectedBill, fetchMemberTotals, incrementPartyConsumed]);

    // Sync memberBaseSpokenRef when memberSpokenTotals changes (from DB fetch)
    // Only update if timer is NOT running - when running, base is already set correctly
    useEffect(() => {
        if (selectedSeat && memberSpokenTotals && !isTimerRunningRef.current) {
            const seatKey = normalizeSeatNo(selectedSeat);
            const dbValue = memberSpokenTotals[seatKey] || 0;
            // Only update if we have actual data from DB (not empty object)
            if (Object.keys(memberSpokenTotals).length > 0) {
                memberBaseSpokenRef.current = dbValue;
                console.log('BD: Updated memberBaseSpokenRef from DB:', memberBaseSpokenRef.current, 'for seat:', selectedSeat);
            }
        }
    }, [memberSpokenTotals, selectedSeat]);

    // Update member reference when memberData changes
    useEffect(() => {
        if (!selectedBill) return;
        if (memberData && selectedSeat) {
            // Note: prevMemberRef is set in handleTimerStart to ensure correct timing
            
            // Update base spoken for this member from persisted totals (synced from DB)
            memberBaseSpokenRef.current = getMemberBaseSpoken(selectedSeat);
            
            // Update broadcast window if broadcasting
            if (timerRef.current?.isBroadcasting?.()) {
                const currentParty = getCurrentMemberPartyFromData(memberData);
                const partyTimePayload = buildPartyTimeDataPayload(currentParty);
                // Add the effective party name so broadcast knows if using "Others" allocation
                if (partyTimePayload) {
                    partyTimePayload.effectiveParty = currentParty;
                }
                // Get member's individual time allocation
                const memberTimeAlloc = getMemberTimeAllocation(selectedSeat);
                // Timer starts from base, so spokenBase for broadcast is 0
                
                timerRef.current.updateBroadcastData({
                    billName: selectedBill?.bill_name || '',
                    memberData: {
                        name: memberData.name,
                        name_hindi: memberData.name_hindi,
                        party: memberData.party,
                        state: memberData.state,
                        seat_no: selectedSeat,
                        picture: memberData.picture
                    },
                    partyTimeData: partyTimePayload,
                    memberTimeData: memberTimeAlloc ? {
                        allocated: memberTimeAlloc.totalSeconds,
                        isAllocated: true,
                        spokenBase: 0  // Timer starts from base, no additional base needed
                    } : {
                        allocated: 0,
                        isAllocated: false,
                        spokenBase: 0
                    }
                });
            }
        }

        // Auto-start timer when a member loads (matches ZH/MS behavior)
        // Skip if we're in the ending phase (prevents race condition restart)
        // Wait for memberSpokenTotals to be fetched for THIS seat so timer can start from correct base
        const isTotalsReadyForSeat = normalizeSeatNo(memberTotalsFetchedForSeat) === normalizeSeatNo(selectedSeat);
        if (
            !isEndingRef.current &&
            selectedBill &&
            memberData &&
            selectedSeat &&
            isTotalsReadyForSeat && // Ensure DB totals are loaded for THIS seat
            timerRef.current &&
            typeof timerRef.current.isRunning === 'function' &&
            typeof timerRef.current.start === 'function'
        ) {
            const alreadyRunning = timerRef.current.isRunning();
            const isPaused = typeof timerRef.current.isPaused === 'function' && timerRef.current.isPaused();
            // Only auto-start if not running AND not paused (don't interfere with pause/resume)
            if (!alreadyRunning && !isPaused) {
                // Small delay to ensure all state updates have propagated
                setTimeout(() => {
                    // Double-check guard flag inside setTimeout too
                    const stillPaused = typeof timerRef.current?.isPaused === 'function' && timerRef.current.isPaused();
                    if (
                        !isEndingRef.current &&
                        !stillPaused &&
                        timerRef.current &&
                        typeof timerRef.current.isRunning === 'function' &&
                        !timerRef.current.isRunning() &&
                        typeof timerRef.current.start === 'function'
                    ) {
                        timerRef.current.start();
                    }
                }, 100);
            }
        }
    }, [memberData, selectedSeat, selectedBill, consumedTime, isTimerRunning, memberSpokenTotals, memberTotalsFetchedForSeat]);

    useEffect(() => {
        if (!selectedSeat) {
            memberBaseSpokenRef.current = 0;
            return;
        }
        memberBaseSpokenRef.current = getMemberBaseSpoken(selectedSeat);
    }, [selectedSeat, memberSpokenTotals]);

    // Update broadcast window when chairperson changes
    useEffect(() => {
        if (selectedChairpersonData) {
            // Update the BroadcastContext with new chairperson
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

    // Update broadcast when bill changes (e.g., bill name updated in Bill Details)
    useEffect(() => {
        if (timerRef.current?.isBroadcasting?.() && selectedBill) {
            timerRef.current.updateBroadcastData({
                billName: selectedBill.bill_name || ''
            });
        }
    }, [selectedBill]);

    // Cleanup: Log activity when user navigates away while timer is running
    // Note: Don't log if broadcasting is active (timer continues in background)
    useEffect(() => {
        return () => {
            // If broadcasting is active, persist session state before unmounting
            if (isBroadcastingRef.current && startTimeRef.current) {
                persistBDSession();
            }
            
            // If broadcasting, the global timer keeps running, so don't log here
            if (isTimerRunningRef.current && startTimeRef.current && !isBroadcastingRef.current) {
                const currentMember = prevMemberRef.current;
                if (currentMember && currentMember.name && currentMember.name.trim() !== '') {
                    const endTime = getISTNow();
                    const durationSeconds = Math.floor((endTime - startTimeRef.current) / 1000);
                    
                    const memberSeat = currentMember.seat_no || currentMember.seat || '';
                    const memberAlloc = getMemberTimeAllocation(memberSeat);
                    const memberAllottedSeconds = memberAlloc?.totalSeconds || 0;
                    const logData = JSON.stringify({
                        activity_type: 'Bill Discussion',
                        member_name: currentMember.name,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        spoken_seconds: durationSeconds,
                        allotted_seconds: memberAllottedSeconds,
                        bill_name: selectedBillRef.current?.bill_name || '',
                        bill_id: selectedBillRef.current?.id || null,
                        party: currentMember.party || 'Others',
                        seat_no: memberSeat,
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

    useEffect(() => {
        const effectiveBillId = selectedBill?.id || activeBillSession?.id;
        if (effectiveBillId) {
            fetchConsumedTime(effectiveBillId);
        } else {
            setConsumedTime({});
        }
    }, [selectedBill, activeBillSession]);

    const fetchBills = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/bill-details?status=current');
            const data = await response.json();
            if (data.success) {
                const list = data.data || [];
                setBills(list);
                const savedId = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (savedId && !selectedBillRef.current) {
                    const match = list.find(bill => String(bill.id) === savedId);
                    if (match) {
                        setSelectedBill(match);
                    } else {
                        localStorage.removeItem(LOCAL_STORAGE_KEY);
                    }
                } else if (selectedBillRef.current) {
                    // Check if current bill still exists
                    const updatedBill = list.find(bill => bill.id === selectedBillRef.current.id);
                    if (updatedBill) {
                        // Update selected bill with fresh data (e.g., if bill name or allocations changed)
                        setSelectedBill(updatedBill);
                    } else {
                        // Bill was archived or deleted
                        selectedBillRef.current = null;
                        setSelectedBill(null);
                        localStorage.removeItem(LOCAL_STORAGE_KEY);
                    }
                }
                billHydratedRef.current = true;
            }
        } catch (error) {
            console.error('Error fetching bills:', error);
        } finally {
            billHydratedRef.current = true;
            setLoading(false);
        }
    };

    // Get member's previously spoken time from database-synced state
    const getMemberBaseSpoken = (seat) => {
        if (!seat) return 0;
        const seatKey = normalizeSeatNo(seat);
        // Read from ref first (synchronously updated), fall back to state
        const refValue = memberSpokenTotalsRef.current[seatKey] || 0;
        const stateValue = memberSpokenTotals[seatKey] || 0;
        const result = refValue || stateValue;
        console.log('BD getMemberBaseSpoken: seat=', seat, 'seatKey=', seatKey, 'refValue=', refValue, 'stateValue=', stateValue, 'result=', result);
        return result;
    };

    const fetchConsumedTime = async (billIdOverride = null) => {
        const targetBillId = billIdOverride || selectedBill?.id || activeBillSession?.id;
        if (!targetBillId) return;
        try {
            // Fetch total consumed time across ALL days for this bill
            const response = await fetch(`http://localhost:5000/api/bill-consumed-time/${targetBillId}`);
            const data = await response.json();
            if (data.success) {
                const dbData = data.data || {};
                // CRITICAL: MERGE with existing ref data instead of REPLACE
                // This preserves our synchronous updates that may not be in DB yet
                const mergedData = { ...consumedTimeRef.current };
                for (const [party, dbValue] of Object.entries(dbData)) {
                    const refValue = mergedData[party] || 0;
                    // Use the higher value - our sync update should be >= DB value
                    mergedData[party] = Math.max(refValue, dbValue);
                }
                setConsumedTime(mergedData);
                consumedTimeRef.current = mergedData;
                console.log('BD fetchConsumedTime: Merged consumedTimeRef:', mergedData);
            }
        } catch (error) {
            console.error('Error fetching consumed time:', error);
            // Don't clear on error - keep existing ref data
        }
    };

    // Get current member's party from memberData (mapped to allocated party or Others)
    const getCurrentMemberPartyFromData = (member) => {
        if (!member?.party) return 'Others';
        const allocations = selectedBillRef.current?.party_allocations || selectedBill?.party_allocations || [];
        const memberParty = member.party.trim().toUpperCase();
        
        for (const allocation of allocations) {
            const allocParty = allocation.party.trim().toUpperCase();
            if (allocParty === memberParty) {
                return allocation.party;
            }
        }
        return 'Others';
    };

    // Get current member's party (mapped to allocated party or Others)
    const getCurrentMemberParty = () => {
        if (!memberData?.party) return 'Others';
        const workingBill = selectedBill || activeBillSession;
        const allocations = workingBill?.party_allocations || [];
        // Normalize party names for comparison (trim and compare)
        const memberParty = memberData.party.trim().toUpperCase();

        // Find matching party (case-insensitive)
        for (const allocation of allocations) {
            const allocParty = allocation.party.trim().toUpperCase();
            if (allocParty === memberParty) {
                return allocation.party; // Return original party name from allocations
            }
        }
        return 'Others';
    };

    // Get allocated time for a party (in minutes)
    const getAllocatedTime = (partyName) => {
        if (partyName === 'Others') {
            const others = selectedBill?.others_time || { hours: 0, minutes: 0 };
            return others.hours * 60 + others.minutes;
        }
        const allocations = selectedBill?.party_allocations || [];
        // Case-insensitive match
        const partyUpper = partyName.trim().toUpperCase();
        for (const allocation of allocations) {
            if (allocation.party.trim().toUpperCase() === partyUpper) {
            return allocation.hours * 60 + allocation.minutes;
            }
        }
        return 0;
    };

    const buildPartyTimeDataPayload = (partyName) => {
        if (!partyName) return null;
        const allocatedSeconds = getAllocatedTime(partyName) * 60;
        // Read from ref first (synchronously updated), fall back to state
        const consumedSeconds = consumedTimeRef.current[partyName] || consumedTime[partyName] || 0;
        // The timer shows member's cumulative time (base + currentSession)
        // consumedSeconds from DB includes all logged speeches (including current member's previous speeches)
        // To get correct party consumed:
        // - Subtract current member's base (already in consumedSeconds) to avoid double-counting
        // - The broadcast page will add the timer value (base + currentSession)
        // Final: (consumedSeconds - memberBase) + timer = consumedSeconds + currentSession
        // 
        // Use sessionStartBaseRef which is locked at timer start and won't change during run
        const memberBase = sessionStartBaseRef.current || 0;
        const adjustedConsumed = Math.max(0, consumedSeconds - memberBase);
        console.log('BD buildPartyTimeDataPayload:', { partyName, consumedSeconds, memberBase, adjustedConsumed });
        return {
            allocated: allocatedSeconds,
            consumed: adjustedConsumed,
            remaining: Math.max(0, allocatedSeconds - adjustedConsumed),
            overage: adjustedConsumed > allocatedSeconds ? adjustedConsumed - allocatedSeconds : 0
        };
    };

    // Log activity when timer starts
    const handleTimerStart = () => {
        if (!selectedBill) return;
        startTimeRef.current = getISTNow();
        setIsTimerRunning(true);
        isTimerRunningRef.current = true;
        
        // Clear paused elapsed when timer starts/resumes - current timer value is now the source of truth
        pausedElapsedRef.current = 0;
        
        // Load base spoken for this member (prior stints) - this is where timer will start
        const baseSpoken = getMemberBaseSpoken(selectedSeat);
        memberBaseSpokenRef.current = baseSpoken;
        // CRITICAL: Lock in the session start base - this value is used in handleTimerEnd
        // to calculate session duration. It must not change during the timer run.
        sessionStartBaseRef.current = baseSpoken;
        console.log('BD handleTimerStart: seat=', selectedSeat, 'baseSpoken=', baseSpoken, 'sessionStartBase=', sessionStartBaseRef.current);
        console.log('BD handleTimerStart: memberSpokenTotals=', memberSpokenTotals, 'memberSpokenTotalsRef=', memberSpokenTotalsRef.current);
        console.log('BD handleTimerStart: isBroadcasting=', isBroadcasting, 'timerIsBroadcasting=', timerRef.current?.isBroadcasting?.());
        
        // Calculate time components from base
        const h = Math.floor(baseSpoken / 3600);
        const m = Math.floor((baseSpoken % 3600) / 60);
        const s = baseSpoken % 60;
        
        // Set local timer to START from the member's previous total
        setCurrentElapsed(baseSpoken);
        if (timerRef.current?.setTime) {
            timerRef.current.setTime(h, m, s, { skipGlobalUpdate: true, resetElapsed: false });
        }
        
        // Update member reference with current party
        if (memberData) {
            const currentParty = getCurrentMemberParty();
            prevMemberRef.current = { 
                name: memberData.name, 
                seat: selectedSeat,
                seat_no: memberData.seat_no || selectedSeat,
                party: currentParty
            };
        }
        
        // Start broadcast if broadcast window is open and not already active
        if (isBroadcastWindowOpen() && !isBroadcasting) {
            const broadcastData = getBroadcastData();
            startBroadcastType(broadcastData);
            // Set global timer to start from member's base AFTER broadcast is started
            setGlobalTimer({
                hours: h,
                minutes: m,
                seconds: s,
                isRunning: true,
                mode: 'countup'
            });
            startGlobalTimer();
        } else if (isBroadcastWindowOpen() && isBroadcasting) {
            // Already broadcasting - set global timer to member's base and start
            setGlobalTimer({
                hours: h,
                minutes: m,
                seconds: s,
                isRunning: true,
                mode: 'countup'
            });
            startGlobalTimer();
        }
        
        // Persist session state immediately for navigation resilience
        setTimeout(() => {
            persistBDSession();
        }, 100);
    };

    // Called every second while timer is running
    const handleTimerTick = (elapsedSeconds) => {
        setCurrentElapsed(elapsedSeconds);
        // Persist session state every 10 seconds for navigation resilience
        if (elapsedSeconds % 10 === 0 && isBroadcastingRef.current) {
            persistBDSession();
        }
    };

    // Log activity when timer ends (End button pressed)
    const handleTimerEnd = async () => {
        // Set guard flag to prevent auto-start during end operation
        isEndingRef.current = true;
        
        setIsTimerRunning(false);
        isTimerRunningRef.current = false;
        
        // Only log if valid member
        const memberName = memberData?.name || prevMemberRef.current?.name;
        const currentParty = getCurrentMemberParty() || prevMemberRef.current?.party || 'Others';
        
        if (startTimeRef.current && memberName && memberName.trim() !== '') {
            const endTime = getISTNow();
            // currentElapsed is now the TOTAL spoken time (base + session)
            // Session duration = total - sessionStartBase (locked at timer start)
            // IMPORTANT: Use sessionStartBaseRef which was locked at handleTimerStart
            // This prevents any useEffect from modifying the base during the run
            const baseSpoken = sessionStartBaseRef.current || 0;
            const sessionDuration = Math.max(0, currentElapsed - baseSpoken);
            // Fallback to wall-clock duration if session is 0
            const durationSeconds = sessionDuration > 0 ? sessionDuration : Math.floor((endTime - startTimeRef.current) / 1000);
            const seatForLog = selectedSeat || prevMemberRef.current?.seat_no || '';
            const memberAlloc = getMemberTimeAllocation(seatForLog);
            const memberAllottedSeconds = memberAlloc?.totalSeconds || 0;
            
            console.log('BD handleTimerEnd: currentElapsed=', currentElapsed, 'sessionStartBase=', baseSpoken, 'sessionDuration=', sessionDuration, 'durationSeconds=', durationSeconds);

            try {
                await fetch('http://localhost:5000/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'Bill Discussion',
                        member_name: memberName,
                        chairperson: chairperson || '',
                        start_time: formatISTForMySQL(startTimeRef.current),
                        end_time: formatISTForMySQL(endTime),
                        duration_seconds: durationSeconds,
                        spoken_seconds: durationSeconds,
                        allotted_seconds: memberAllottedSeconds,
                        bill_name: selectedBill?.bill_name || '',
                        bill_id: selectedBill?.id || null,
                        party: currentParty,
                        seat_no: seatForLog,
                        notes: `Bill discussion ended - ${currentParty}`
                    }),
                });
                // Refresh consumed time after logging
                incrementPartyConsumed(currentParty, durationSeconds);
                fetchConsumedTime();
                
                // CRITICAL: Update memberSpokenTotals IMMEDIATELY with the logged duration
                // This ensures the next speech starts with the correct base value
                // without waiting for DB fetch (which may have timing issues)
                const normalizedSeat = normalizeSeatNo(seatForLog);
                // Update ref SYNCHRONOUSLY first (this is read by getMemberBaseSpoken)
                const newTotal = (memberSpokenTotalsRef.current[normalizedSeat] || 0) + durationSeconds;
                memberSpokenTotalsRef.current = {
                    ...memberSpokenTotalsRef.current,
                    [normalizedSeat]: newTotal
                };
                // Also update state for React
                setMemberSpokenTotals(prev => ({
                    ...prev,
                    [normalizedSeat]: newTotal
                }));
                console.log('BD handleTimerEnd: Updated memberSpokenTotalsRef for seat', normalizedSeat, 'new total:', newTotal);
                
                // Also fetch from DB to ensure consistency
                if (selectedBill?.id) {
                    await fetchMemberTotals(selectedBill.id, seatForLog);
                }
            } catch (error) {
                console.error('Error logging activity:', error);
            }
            }
            startTimeRef.current = null;
            setCurrentElapsed(0);
        sessionStartBaseRef.current = 0;
        memberBaseSpokenRef.current = 0;
        
        // Clear persisted session state since we're ending properly
        clearBDSession();
        
        // Clear seat number - Timer component handles closeBroadcast() internally
        // (same as ZH and MS behavior)
        setSelectedSeat('');
        
        // Clear guard flag after a short delay to ensure all state updates are processed
        setTimeout(() => {
            isEndingRef.current = false;
        }, 200);
    };

    // Handle timer pause (Pause button pressed) - no logging, just pause
    const handleTimerPause = () => {
        // Timer paused - don't log activity, just pause
        // Activity will be logged when End is pressed or seat changes
        isTimerRunningRef.current = false;
        // Store current stint's elapsed time for logging on seat change
        if (timerRef.current?.getTime) {
            const timeState = timerRef.current.getTime();
            const timerElapsed = timeState.hours * 3600 + timeState.minutes * 60 + timeState.seconds;
            // Store only the current stint's elapsed time (subtract session start base)
            // Use sessionStartBaseRef which was locked at handleTimerStart
            pausedElapsedRef.current = Math.max(0, timerElapsed - sessionStartBaseRef.current);
        }
    };
    
    // Handle timer reset - reset to member's base spoken time (aggregate from previous stints)
    const handleTimerReset = () => {
        const baseSpoken = getMemberBaseSpoken(selectedSeat);
        memberBaseSpokenRef.current = baseSpoken;
        
        // Reset the start time so the next stint logs correctly
        startTimeRef.current = null;
        setCurrentElapsed(baseSpoken);
        setIsTimerRunning(false);
        isTimerRunningRef.current = false;

        // Set timer display to member's base time
        if (timerRef.current?.setTime) {
            const h = Math.floor(baseSpoken / 3600);
            const m = Math.floor((baseSpoken % 3600) / 60);
            const s = baseSpoken % 60;
            timerRef.current.setTime(h, m, s, { skipGlobalUpdate: false, resetElapsed: false });
        }
        
        // Update global timer if broadcasting
        if (isBroadcastWindowOpen()) {
            const h = Math.floor(baseSpoken / 3600);
            const m = Math.floor((baseSpoken % 3600) / 60);
            const s = baseSpoken % 60;
            setGlobalTimer({
                hours: h,
                minutes: m,
                seconds: s,
                isRunning: false,
                mode: 'countup'
            });
        }
    };

    const formatSecondsAsClock = (totalSeconds = 0) => {
        const safeSeconds = Math.max(0, Math.floor(Math.abs(totalSeconds)));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const getPartyTimeDiffSeconds = () => {
        if (!selectedBill || !memberData?.party) return 0;
        const currentParty = getCurrentMemberParty();
        const allocatedSeconds = getAllocatedTime(currentParty) * 60;
        const consumedBase = consumedTime[currentParty] || 0;
        // currentElapsed now includes member's base, so session = currentElapsed - memberBase
        const memberBase = memberBaseSpokenRef.current || 0;
        const currentSession = Math.max(0, currentElapsed - memberBase);
        return allocatedSeconds - (consumedBase + currentSession);
    };

    const getPartyTimeDisplay = () => {
        const diffSeconds = getPartyTimeDiffSeconds();
        const magnitude = formatSecondsAsClock(Math.abs(diffSeconds));
        return {
            signedText: `${diffSeconds < 0 ? '-' : ''}${magnitude}`,
            isOvertime: diffSeconds < 0
        };
    };

    const getMemberTotalSpokenSeconds = () => {
        // Timer now starts from base, so currentElapsed IS the total spoken time
        return currentElapsed;
    };

    const partyTimeDisplay = getPartyTimeDisplay();
    const memberTotalSeconds = getMemberTotalSpokenSeconds();

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100 overflow-hidden">
            <Header showBack />

            <main className="flex-1 min-h-0 max-w-7xl mx-auto px-4 py-2 w-full flex flex-col gap-2 overflow-y-auto">
                {/* Page Title + Bill Selection - Compact Row */}
                <div className="bg-white rounded-xl shadow-lg p-3 animate-fade-in">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <FileText size={24} className="text-red-800" />
                            <h2 className="text-xl font-bold text-red-800">Bill Discussed</h2>
                        </div>
                        <select
                            value={selectedBill ? JSON.stringify(selectedBill) : ''}
                            onChange={(e) => setSelectedBill(e.target.value ? JSON.parse(e.target.value) : null)}
                            disabled={isBroadcasting}
                            className={`flex-1 min-w-[250px] px-3 py-2 border-2 rounded-lg focus:border-red-500 ${
                                isBroadcasting 
                                    ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed' 
                                    : 'border-red-300'
                            }`}
                        >
                            <option value="">Select a Bill</option>
                            {bills.map((bill, index) => (
                                <option key={index} value={JSON.stringify(bill)}>
                                    {bill.bill_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {!selectedBill && (
                        <p className="mt-2 text-sm font-semibold text-red-600">
                            Please select a bill before loading members or starting the timer.
                        </p>
                    )}
                </div>

                {/* Timer + Remaining Time - Same Row */}
                <div className="bg-white rounded-xl shadow-lg p-3 animate-fade-in">
                    <div className="flex items-center justify-center gap-6 flex-wrap">
                        {/* Timer Display */}
                        <Timer
                            ref={timerRef}
                            mode="countup"
                            initialMinutes={0}
                            initialSeconds={0}
                            onStart={handleTimerStart}
                            onStop={handleTimerPause}
                            onEnd={handleTimerEnd}
                            onTick={handleTimerTick}
                            onReset={handleTimerReset}
                            compact={true}
                            inline={true}
                            hasEntry={!!memberData && !!selectedBill}
                        />

                        {/* Current Party Remaining Time - Next to Reset button */}
                        {selectedBill && memberData?.party && (
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${
                                partyTimeDisplay.isOvertime
                                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                                    : 'bg-green-100 text-green-700 border-2 border-green-300'
                            }`}>
                                <Clock size={18} />
                                <span className="text-lg tracking-wide">
                                    {partyTimeDisplay.signedText}
                                </span>
                                <span className="text-xs opacity-70 uppercase">
                                    {partyTimeDisplay.isOvertime ? 'extra' : 'remaining'}
                                </span>
                            </div>
                        )}
                    </div>
                    {selectedBill && memberData && (
                        <div className="w-full text-center text-sm font-semibold text-red-700 mt-2">
                            Total spoken for this bill: {formatSecondsAsClock(memberTotalSeconds)}
                    </div>
                    )}
                </div>

                {/* Member Panel - Compact */}
                <div className="animate-fade-in">
                    <MemberPanelCompact
                        seatNo={selectedSeat}
                        onSeatChange={setSelectedSeat}
                    />
                </div>

                {/* Chair Display with dropdown */}
                <div className="animate-fade-in">
                    <ChairDisplay showDropdown={true} />
                </div>
            </main>

            <Footer />
        </div>
    );
}
