import { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { ClipboardList, Calendar, Clock, User, FileText, Trash2, RefreshCw, X, Download, FileSpreadsheet, ArrowLeft, ChevronDown, ChevronUp, Edit2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatISTDateForInput, normalizeSeatNo } from '../utils/timezone';

export default function LogList() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(formatISTDateForInput());
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [showPopup, setShowPopup] = useState(false);
    
    // Bill Discussion specific states
    const [billPopupLevel, setBillPopupLevel] = useState(1); // 1 = bill list, 2 = party-wise details
    const [selectedBill, setSelectedBill] = useState(null);
    const [loadingBillLogs, setLoadingBillLogs] = useState(false);
    const [billDirectory, setBillDirectory] = useState({});
    const [billActionMessage, setBillActionMessage] = useState(null);
    const [billActionLoadingId, setBillActionLoadingId] = useState(null);
    const [expandedMemberRows, setExpandedMemberRows] = useState({});
    const [editingSpeech, setEditingSpeech] = useState(null); // { id, duration_seconds }
    const [editTimeInput, setEditTimeInput] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const [editLoading, setEditLoading] = useState(false);
    const [migrationRunning, setMigrationRunning] = useState(false);
    const [allBillDiscussionLogs, setAllBillDiscussionLogs] = useState([]); // All bill discussion logs (not date filtered)
    const [currentSessionBills, setCurrentSessionBills] = useState([]); // Bills in current session (Running status)
    const [billViewMode, setBillViewMode] = useState('memberDetails'); // 'memberDetails' or 'sequential'
    const navigate = useNavigate();
    const partyData = useMemo(() => buildPartyData(
        selectedBill?.logs || [], 
        selectedBill?.party_allocations || [],
        selectedBill?.others_time || null
    ), [selectedBill?.logs, selectedBill?.party_allocations, selectedBill?.others_time]);
    const aggregatedMemberCount = useMemo(() => {
        return partyData.reduce((sum, party) => sum + party.members.length, 0);
    }, [partyData]);
    
    // Sequential logs sorted by start_time (first speaker first)
    const sequentialLogs = useMemo(() => {
        if (!selectedBill?.logs) return [];
        return [...selectedBill.logs].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [selectedBill?.logs]);

    const categories = [
        { 
            type: 'Zero Hour', 
            icon: Clock, 
            color: 'from-red-700 to-red-900',
            bgColor: 'bg-red-100',
            textColor: 'text-red-800'
        },
        { 
            type: 'Member Speaking', 
            icon: User, 
            color: 'from-red-700 to-red-900',
            bgColor: 'bg-red-100',
            textColor: 'text-red-800'
        },
        { 
            type: 'Bill Discussion', 
            icon: FileText, 
            color: 'from-red-700 to-red-900',
            bgColor: 'bg-red-100',
            textColor: 'text-red-800'
        },
    ];

    useEffect(() => {
        fetchLogs();
    }, [dateFilter]);

    useEffect(() => {
        fetchBillDirectory();
        fetchAllBillDiscussionLogs();
    }, []);

    useEffect(() => {
        if (!billActionMessage) return;
        const timer = setTimeout(() => setBillActionMessage(null), 4000);
        return () => clearTimeout(timer);
    }, [billActionMessage]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const url = dateFilter
                ? `http://localhost:5000/api/activity-logs?date=${dateFilter}`
                : 'http://localhost:5000/api/activity-logs';
            const response = await fetch(url);
            const data = await response.json();
            if (data.success) {
                setLogs(data.data);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBillDirectory = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/bill-details');
            const data = await response.json();
            if (data.success) {
                const directory = {};
                const currentBills = [];
                (data.data || []).forEach(bill => {
                    const key = (bill.bill_name || '').trim().toLowerCase();
                    if (!directory[key]) {
                        directory[key] = [];
                    }
                    directory[key].push(bill);
                    
                    // Track current session bills (Running or Active status)
                    if (bill.status === 'Running' || bill.status === 'Active') {
                        currentBills.push({
                            id: bill.id,
                            bill_name: bill.bill_name,
                            status: bill.status,
                            party_allocations: bill.party_allocations || [],
                            others_time: bill.others_time || { hours: 0, minutes: 0, members: [] }
                        });
                    }
                });
                setBillDirectory(directory);
                setCurrentSessionBills(currentBills);
            }
        } catch (error) {
            console.error('Error fetching bill directory:', error);
        }
    };
    
    // Fetch ALL bill discussion logs (not date filtered) for current session bills
    const fetchAllBillDiscussionLogs = async () => {
        try {
            // Fetch all Bill Discussion logs without date limit
            const response = await fetch('http://localhost:5000/api/activity-logs?activity_type=Bill%20Discussion&all=true');
            const data = await response.json();
            if (data.success) {
                // Filter to only Bill Discussion logs
                const billLogs = (data.data || []).filter(log => log.activity_type === 'Bill Discussion');
                setAllBillDiscussionLogs(billLogs);
            }
        } catch (error) {
            console.error('Error fetching all bill discussion logs:', error);
        }
    };

    const clearLogs = async () => {
        if (!confirm('Are you sure you want to clear all logs?')) return;

        try {
            const response = await fetch('http://localhost:5000/api/activity-logs/clear', {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                setLogs([]);
            }
        } catch (error) {
            console.error('Error clearing logs:', error);
        }
    };

    useEffect(() => {
        if (billPopupLevel !== 2) {
            setExpandedMemberRows({});
        }
    }, [billPopupLevel, showPopup]);

    const deleteLogEntry = async (logId, memberName) => {
        if (!confirm(`Delete entry for "${memberName}"?`)) return;

        try {
            const response = await fetch(`http://localhost:5000/api/activity-log/${logId}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                // Refresh logs after deletion
                fetchLogs();
                // Also update selectedBill if in Bill Discussion view
                if (selectedBill) {
                    const updatedBill = { ...selectedBill };
                    updatedBill.logs = updatedBill.logs.filter(l => l.id !== logId);
                    updatedBill.totalDuration = updatedBill.logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
                    setSelectedBill(updatedBill);
                }
            }
        } catch (error) {
            console.error('Error deleting log entry:', error);
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0m 0s';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m ${secs}s`;
        }
        return `${mins}m ${secs}s`;
    };

    const formatTime = (datetime) => {
        if (!datetime) return '-';
        const date = new Date(datetime);
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    };

    const formatDateDDMMYYYY = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const formatDateTimeReadable = (datetime) => {
        if (!datetime) return '-';
        const date = new Date(datetime);
        if (Number.isNaN(date.getTime())) {
            return datetime;
        }
        return `${formatDateDDMMYYYY(date)} ${formatTime(date)}`;
    };

    const getBillMetaByName = (billName) => {
        if (!billName) return null;
        const key = billName.trim().toLowerCase();
        const matches = billDirectory[key];
        if (!matches || matches.length === 0) return null;
        return matches[0];
    };

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // bill to delete
    
    // Delete all activity logs for a bill (not the bill itself)
    const handleBillLogsDelete = async (event, bill) => {
        event?.stopPropagation();
        // Show confirmation modal instead of window.confirm
        setShowDeleteConfirm(bill);
    };
    
    const confirmDeleteBillLogs = async () => {
        const bill = showDeleteConfirm;
        if (!bill) return;
        
        setBillActionLoadingId(bill.name);
        setShowDeleteConfirm(null);
        
        try {
            // Delete ALL activity logs for this bill (no date filter - deletes all time)
            const params = new URLSearchParams({ bill_name: bill.name });
            // No date filter - delete all logs for this bill
            
            const response = await fetch(`http://localhost:5000/api/activity-logs/by-bill?${params.toString()}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                setBillActionMessage({ 
                    type: 'success', 
                    text: `Deleted ${data.deleted_count || 0} log entries for "${bill.name}".` 
                });
                fetchLogs();
                fetchAllBillDiscussionLogs(); // Refresh bill discussion logs
            } else {
                setBillActionMessage({ type: 'error', text: data.error || 'Unable to delete logs.' });
            }
        } catch (error) {
            console.error('Error deleting bill logs:', error);
            setBillActionMessage({ type: 'error', text: 'Unable to delete logs.' });
        } finally {
            setBillActionLoadingId(null);
        }
    };

    const toggleMemberDetails = (party, seatKey) => {
        const key = `${party}-${seatKey}`;
        setExpandedMemberRows(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };
    
    // Start editing a speech time
    const startEditSpeech = (speech) => {
        const totalSeconds = speech.duration_seconds || 0;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        setEditingSpeech({ id: speech.id, duration_seconds: totalSeconds });
        setEditTimeInput({ hours, minutes, seconds });
    };
    
    // Cancel editing
    const cancelEditSpeech = () => {
        setEditingSpeech(null);
        setEditTimeInput({ hours: 0, minutes: 0, seconds: 0 });
    };
    
    // Save edited speech time
    const saveEditedSpeechTime = async () => {
        if (!editingSpeech) return;
        
        const newSeconds = 
            (parseInt(editTimeInput.hours) || 0) * 3600 + 
            (parseInt(editTimeInput.minutes) || 0) * 60 + 
            (parseInt(editTimeInput.seconds) || 0);
        
        setEditLoading(true);
        try {
            const response = await fetch(`http://localhost:5000/api/activity-log/${editingSpeech.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    spoken_seconds: newSeconds,
                    duration_seconds: newSeconds
                })
            });
            const data = await response.json();
            if (data.success) {
                setBillActionMessage({ type: 'success', text: 'Speech time updated successfully.' });
                // Refresh logs to update the UI
                fetchLogs();
                fetchAllBillDiscussionLogs(); // Refresh bill discussion logs
                // If we're viewing bill details, refresh those too
                if (selectedBill) {
                    fetchBillLogs(selectedBill);
                }
                cancelEditSpeech();
            } else {
                setBillActionMessage({ type: 'error', text: data.error || 'Failed to update speech time.' });
            }
        } catch (error) {
            console.error('Error updating speech time:', error);
            setBillActionMessage({ type: 'error', text: 'Failed to update speech time.' });
        } finally {
            setEditLoading(false);
        }
    };
    
    // Migrate bill_ids - links existing logs to bill_details by name
    const runBillIdMigration = async () => {
        setMigrationRunning(true);
        try {
            const response = await fetch('http://localhost:5000/api/activity-logs/migrate-bill-ids', {
                method: 'POST'
            });
            const data = await response.json();
            if (data.success) {
                setBillActionMessage({ type: 'success', text: data.message });
                fetchLogs();
                fetchAllBillDiscussionLogs(); // Refresh bill discussion logs
            } else {
                setBillActionMessage({ type: 'error', text: data.error || 'Migration failed.' });
            }
        } catch (error) {
            console.error('Error running migration:', error);
            setBillActionMessage({ type: 'error', text: 'Migration failed.' });
        } finally {
            setMigrationRunning(false);
        }
    };
    
    // Merge logs from an old bill name to a target bill
    const mergeBillLogs = async (oldBillName, targetBillId) => {
        if (!oldBillName || !targetBillId) return;
        
        setMigrationRunning(true);
        try {
            const response = await fetch('http://localhost:5000/api/activity-logs/merge-bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    old_bill_name: oldBillName,
                    target_bill_id: targetBillId
                })
            });
            const data = await response.json();
            if (data.success) {
                setBillActionMessage({ type: 'success', text: data.message });
                fetchLogs();
                fetchAllBillDiscussionLogs(); // Refresh bill discussion logs
            } else {
                setBillActionMessage({ type: 'error', text: data.error || 'Merge failed.' });
            }
        } catch (error) {
            console.error('Error merging bills:', error);
            setBillActionMessage({ type: 'error', text: 'Merge failed.' });
        } finally {
            setMigrationRunning(false);
        }
    };

    // Get logs filtered by category
    const getLogsByCategory = (categoryType) => {
        return logs.filter(log => log.activity_type === categoryType);
    };

    // Get total duration for a category
    const getTotalDuration = (categoryType) => {
        const categoryLogs = getLogsByCategory(categoryType);
        return categoryLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0);
    };

    // Get member count for a category
    const getMemberCount = (categoryType) => {
        return getLogsByCategory(categoryType).length;
    };

    // Open popup with category details
    const openCategoryPopup = (category) => {
        setSelectedCategory(category);
        setShowPopup(true);
        if (category.type === 'Bill Discussion') {
            setBillPopupLevel(1);
            setSelectedBill(null);
        }
    };

    // Fetch ALL logs for a specific bill (NOT date filtered - shows all time)
    const fetchBillLogs = async (billInfo) => {
        if (!billInfo) return;
        
        const billName = typeof billInfo === 'string'
            ? billInfo
            : (billInfo?.name || billInfo?.bill_name || '');
        const billId = typeof billInfo === 'object'
            ? (billInfo?.bill_id || billInfo?.id || null)
            : null;
        
        if (!billName && !billId) return;
        
        setLoadingBillLogs(true);
        try {
            // NO date filter - fetch ALL logs for this bill
            let endpoint = '';
            
            if (billId) {
                endpoint = `http://localhost:5000/api/activity-logs/by-bill-id/${billId}`;
            } else {
                endpoint = `http://localhost:5000/api/activity-logs/bill/${encodeURIComponent(billName)}`;
            }
            
            const response = await fetch(endpoint);
            const data = await response.json();
            if (data.success) {
                // Calculate total duration from ALL logs (all time)
                const totalDuration = data.data.reduce((sum, log) => sum + (log.duration_seconds || 0), 0);

                const resolvedBillId = billId || data.data[0]?.bill_id || null;
                const resolvedBillName = data.data[0]?.current_bill_name || billName;

                // Pull latest allocations from bill details so updates reflect immediately
                let latestBillData = null;
                try {
                    const billDetailsResponse = await fetch('http://localhost:5000/api/bill-details');
                    const billDetailsData = await billDetailsResponse.json();
                    if (billDetailsData.success) {
                        latestBillData = (billDetailsData.data || []).find(b =>
                            (resolvedBillId && b.id === resolvedBillId) ||
                            b.bill_name?.trim().toLowerCase() === resolvedBillName.trim().toLowerCase()
                        );
                    }
                } catch (err) {
                    console.error('Error fetching latest bill details:', err);
                }

                const fallbackBillData = currentSessionBills.find(b =>
                    (resolvedBillId && b.id === resolvedBillId) ||
                    b.bill_name?.trim().toLowerCase() === resolvedBillName.trim().toLowerCase()
                );

                const allocationSource = latestBillData || fallbackBillData || {};

                setSelectedBill({
                    name: resolvedBillName,
                    bill_id: resolvedBillId,
                    logs: data.data,
                    totalDuration: totalDuration,
                    dateContext: null, // No date context - shows all time
                    party_allocations: allocationSource.party_allocations || [],
                    others_time: allocationSource.others_time || { hours: 0, minutes: 0, members: [] }
                });
            }
        } catch (error) {
            console.error('Error fetching all-time bill logs:', error);
        } finally {
            setLoadingBillLogs(false);
        }
    };

    // Get unique bills from ALL Bill Discussion logs (not date filtered)
    // Only shows bills that are in current session (Running/Active status)
    const getUniqueBills = () => {
        // Use ALL bill discussion logs, not date-filtered ones
        const billLogs = allBillDiscussionLogs;
        const billMap = {};
        
        // Create a set of current session bill IDs and names for quick lookup
        const currentBillIds = new Set(currentSessionBills.map(b => b.id));
        const currentBillNames = new Set(currentSessionBills.map(b => b.bill_name?.toLowerCase()));
        
        billLogs.forEach(log => {
            // Check if this log belongs to a current session bill
            const logBillId = log.bill_id;
            const logBillName = (log.bill_name || '').toLowerCase();
            
            // Skip if bill is not in current session
            const isCurrentSession = 
                (logBillId && currentBillIds.has(logBillId)) || 
                (!logBillId && currentBillNames.has(logBillName));
            
            if (!isCurrentSession && currentSessionBills.length > 0) {
                return; // Skip logs for past session bills
            }
            
            // Use bill_id as the key if available, otherwise fall back to bill_name
            const key = log.bill_id ? `id_${log.bill_id}` : `name_${log.bill_name || 'Unknown Bill'}`;
            const billName = log.bill_name || 'Unknown Bill';
            
            if (!billMap[key]) {
                billMap[key] = {
                    name: billName,
                    bill_id: log.bill_id || null,
                    logs: [],
                    totalDuration: 0,
                    oldNames: new Set() // Track if there are logs with different names
                };
            }
            billMap[key].logs.push(log);
            billMap[key].totalDuration += log.duration_seconds || 0;
            
            // Track different bill names under the same bill_id
            if (log.bill_name && log.bill_name !== billMap[key].name) {
                billMap[key].oldNames.add(log.bill_name);
            }
        });
        
        // Convert Set to Array for easier handling
        return Object.values(billMap).map(bill => ({
            ...bill,
            oldNames: Array.from(bill.oldNames)
        }));
    };

    // Build aggregated party/member dataset with individual speech history and allocations
    function buildPartyData(billLogs = [], partyAllocations = [], othersTime = null) {
        const partyMap = {};
        
        // Build allocation lookup maps
        const partyAllocationMap = {}; // party name -> { hours, minutes, totalSeconds }
        const memberAllocationMap = {}; // seat_no -> { hours, minutes, totalSeconds }
        
        (partyAllocations || []).forEach(pa => {
            const totalSeconds = (pa.hours || 0) * 3600 + (pa.minutes || 0) * 60;
            partyAllocationMap[pa.party?.toUpperCase()] = { 
                hours: pa.hours || 0, 
                minutes: pa.minutes || 0,
                totalSeconds 
            };
            (pa.members || []).forEach(m => {
                const memberTotal = (m.hours || 0) * 3600 + (m.minutes || 0) * 60;
                const seatKey = normalizeSeatNo(m.seat_no);
                memberAllocationMap[seatKey] = {
                    hours: m.hours || 0,
                    minutes: m.minutes || 0,
                    totalSeconds: memberTotal
                };
            });
        });
        
        // Others allocation
        if (othersTime) {
            const othersTotal = (othersTime.hours || 0) * 3600 + (othersTime.minutes || 0) * 60;
            partyAllocationMap['OTHERS'] = { 
                hours: othersTime.hours || 0, 
                minutes: othersTime.minutes || 0,
                totalSeconds: othersTotal 
            };
            (othersTime.members || []).forEach(m => {
                const memberTotal = (m.hours || 0) * 3600 + (m.minutes || 0) * 60;
                const seatKey = normalizeSeatNo(m.seat_no);
                memberAllocationMap[seatKey] = {
                    hours: m.hours || 0,
                    minutes: m.minutes || 0,
                    totalSeconds: memberTotal
                };
            });
        }

        billLogs.forEach(log => {
            const partyName = log.party || 'Others';
            if (!partyMap[partyName]) {
                partyMap[partyName] = {
                    party: partyName,
                    totalDuration: 0,
                    memberTotals: {}
                };
            }

            // Normalize seat numbers to handle "01" vs "1" as same member
            const normalizedSeat = log.seat_no ? normalizeSeatNo(log.seat_no) : '';
            const seatKey = normalizedSeat || `${log.member_name || 'Unknown'}-${partyName}`;
            if (!partyMap[partyName].memberTotals[seatKey]) {
                const memberAlloc = memberAllocationMap[normalizedSeat] || null;
                partyMap[partyName].memberTotals[seatKey] = {
                    seat_no: normalizedSeat,
                    member_name: log.member_name || '-',
                    totalDuration: 0,
                    allottedSeconds: memberAlloc?.totalSeconds || 0,
                    speeches: [],
                    first_start_time: log.start_time || null,
                    seatKey
                };
            }

            const entry = partyMap[partyName].memberTotals[seatKey];
            const durationSeconds = log.duration_seconds || 0;
            entry.totalDuration += durationSeconds;
            entry.speeches.push({
                id: log.id || `${seatKey}-${entry.speeches.length}`,
                duration_seconds: durationSeconds,
                start_time: log.start_time,
                end_time: log.end_time,
                notes: log.notes || ''
            });
            if (log.start_time) {
                if (!entry.first_start_time || new Date(log.start_time) < new Date(entry.first_start_time)) {
                    entry.first_start_time = log.start_time;
                }
            }

            partyMap[partyName].totalDuration += durationSeconds;
        });

        return Object.values(partyMap)
            .sort((a, b) => {
                if (a.party === 'Others') return 1;
                if (b.party === 'Others') return -1;
                return a.party.localeCompare(b.party);
            })
            .map(party => {
                const partyAlloc = partyAllocationMap[party.party?.toUpperCase()] || null;
                return {
                    party: party.party,
                    totalDuration: party.totalDuration,
                    allottedSeconds: partyAlloc?.totalSeconds || 0,
                    members: Object.values(party.memberTotals)
                        .sort((a, b) => b.totalDuration - a.totalDuration)
                };
            });
    }

    // Export bill party-wise data to Excel
    const exportBillToExcel = () => {
        if (!selectedBill) return;
        
        const partyData = buildPartyData(selectedBill.logs || [], selectedBill.party_allocations || [], selectedBill.others_time || null);
        const headers = ['Party', 'S.No', 'Seat No', 'Member Name', '# Speeches', 'Aggregate Duration', 'Speech Detail', 'Speech Duration'];
        
        let csvContent = `Bill: ${selectedBill.name}\nDate: ${dateFilter}\n\n`;
        csvContent += headers.join(',') + '\n';
        
        partyData.forEach(party => {
            party.members.forEach((member, index) => {
                const row = [
                    index === 0 ? `"${party.party}"` : '',
                    index + 1,
                    `"${member.seat_no || '-'}"`,
                    `"${member.member_name || '-'}"`,
                    member.speeches.length,
                    `"${formatDuration(member.totalDuration)}"`,
                    '',
                    ''
                ];
                csvContent += row.join(',') + '\n';
                member.speeches.forEach((speech, speechIndex) => {
                    const speechRow = [
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        `"Speech ${speechIndex + 1} - ${formatDateTimeReadable(speech.start_time)}"`,
                        `"${formatDuration(speech.duration_seconds)}"`
                    ];
                    csvContent += speechRow.join(',') + '\n';
                });
            });
            // Party total row
            const totalRow = ['', '', '', `"${party.party} Total:"`, '', `"${formatDuration(party.totalDuration)}"`, '', ''];
            csvContent += totalRow.join(',') + '\n';
            csvContent += '\n';
        });
        
        // Grand total
        const grandTotal = partyData.reduce((sum, p) => sum + p.totalDuration, 0);
        csvContent += `\n,,,"Grand Total:","${formatDuration(grandTotal)}"\n`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Bill_Discussion_${selectedBill.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateFilter}.csv`;
        link.click();
    };

    // Export bill data to PDF (respects current view)
    const exportBillToPDF = () => {
        if (!selectedBill) return;
        
        const partyData = buildPartyData(selectedBill.logs || [], selectedBill.party_allocations || [], selectedBill.others_time || null);
        const grandTotal = partyData.reduce((sum, p) => sum + p.totalDuration, 0);
        const sequentialRows = sequentialLogs;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Bill Discussion - ${selectedBill.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #991b1b; text-align: center; text-transform: uppercase; }
                    h2 { color: #991b1b; margin-bottom: 10px; text-align: center; }
                    .generated { text-align: center; font-weight: bold; color: #991b1b; margin-bottom: 20px; }
                    .party-section { margin-bottom: 30px; }
                    .party-header { background: #991b1b; color: white; padding: 10px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f3f4f6; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .party-total { font-weight: bold; background: #fee2e2 !important; }
                    .grand-total { font-weight: bold; background: #fef3c7; font-size: 18px; padding: 15px; text-align: right; margin-top: 20px; }
                    .header { background: #991b1b; color: white; }
                </style>
            </head>
            <body>
                <h1>RAJYA SABHA SESSION (BILL DISCUSSION)</h1>
                <h2>${selectedBill.name}</h2>
                <p class="generated">Generated on ${formatDateTimeReadable(new Date())}</p>
                
                ${billViewMode === 'sequential' ? `
                    <table>
                        <thead class="header">
                            <tr>
                                <th>S.No</th>
                                <th>Seat</th>
                                <th>Member Name</th>
                                <th>Party</th>
                                <th>Start Time</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sequentialRows.map((log, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${log.seat_no || '-'}</td>
                                    <td>${log.member_name || '-'}</td>
                                    <td>${log.party || '-'}</td>
                                    <td>${formatDateTimeReadable(log.start_time)}</td>
                                    <td>${formatDuration(log.duration_seconds || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="grand-total">Grand Total: ${formatDuration(grandTotal)}</div>
                ` : `
                    ${partyData.map(party => `
                        <div class="party-section">
                            <div class="party-header">${party.party} (${party.members.length} members)</div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>S.No</th>
                                        <th>Seat No</th>
                                        <th>Member Name</th>
                                        <th>Speeches</th>
                                        <th>Allocated</th>
                                        <th>Aggregate Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${party.members.map((member, index) => `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>${member.seat_no || '-'}</td>
                                            <td>${member.member_name || '-'}</td>
                                            <td>${member.speeches.length}</td>
                                            <td>${formatDuration(member.allottedSeconds || 0)}</td>
                                            <td>${formatDuration(member.totalDuration)}</td>
                                        </tr>
                                    `).join('')}
                                    <tr class="party-total">
                                        <td colspan="5" style="text-align: right;">${party.party} Total:</td>
                                        <td>${formatDuration(party.totalDuration)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    `).join('')}
                    
                    <div class="grand-total">
                        Grand Total: ${formatDuration(grandTotal)}
                    </div>
                `}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    // Export to Excel (CSV format)
    const exportToExcel = () => {
        if (!selectedCategory) return;
        
        const categoryLogs = getLogsByCategory(selectedCategory.type);
        let headers;
        if (selectedCategory.type === 'Member Speaking') {
            headers = ['S.No', 'Time', 'Member Name', 'Heading', 'Chairperson', 'Duration', 'Notes'];
        } else if (selectedCategory.type === 'Zero Hour') {
            headers = ['S.No', 'Time', 'Member Name', 'Party', 'Chairperson', 'Allotted', 'Duration', 'Notes'];
        } else {
            headers = ['S.No', 'Time', 'Member Name', 'Chairperson', 'Duration', 'Notes'];
        }
        
        let csvContent = headers.join(',') + '\n';
        
        categoryLogs.forEach((log, index) => {
            let row;
            if (selectedCategory.type === 'Member Speaking') {
                row = [
                    index + 1,
                    `"${formatTime(log.start_time)}"`,
                    `"${log.member_name || '-'}"`,
                    `"${log.heading || '-'}"`,
                    `"${log.chairperson || '-'}"`,
                    `"${formatDuration(log.duration_seconds)}"`,
                    `"${log.notes || '-'}"`
                ];
            } else if (selectedCategory.type === 'Zero Hour') {
                row = [
                    index + 1,
                    `"${formatTime(log.start_time)}"`,
                    `"${log.member_name || '-'}"`,
                    `"${log.party || '-'}"`,
                    `"${log.chairperson || '-'}"`,
                    `"${formatDuration(log.allotted_seconds || 180)}"`,
                    `"${formatDuration(log.duration_seconds)}"`,
                    `"${log.notes || '-'}"`
                ];
            } else {
                row = [
                    index + 1,
                    `"${formatTime(log.start_time)}"`,
                    `"${log.member_name || '-'}"`,
                    `"${log.chairperson || '-'}"`,
                    `"${formatDuration(log.duration_seconds)}"`,
                    `"${log.notes || '-'}"`
                ];
            }
            csvContent += row.join(',') + '\n';
        });
        
        // Add total row
        const totalColSpan = selectedCategory.type === 'Zero Hour' ? 6 : (selectedCategory.type === 'Member Speaking' ? 5 : 4);
        const emptyColsForTotal = ','.repeat(totalColSpan - 1);
        csvContent += `\n${emptyColsForTotal}Total:,"${formatDuration(getTotalDuration(selectedCategory.type))}",\n`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${selectedCategory.type.replace(' ', '_')}_${dateFilter}.csv`;
        link.click();
    };

    // Export to PDF (opens print dialog)
    const exportToPDF = () => {
        if (!selectedCategory) return;
        
        const categoryLogs = getLogsByCategory(selectedCategory.type);
        const totalDuration = getTotalDuration(selectedCategory.type);
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>${selectedCategory.type} - Activity Log</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #991b1b; text-align: center; text-transform: uppercase; }
                    .date { text-align: center; color: #991b1b; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; }
                    .generated { text-align: center; font-weight: bold; color: #991b1b; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th { background: #991b1b; color: white; }
                    tr:nth-child(even) { background: #f9f9f9; }
                    .total { font-weight: bold; background: #fef3c7 !important; }
                </style>
            </head>
            <body>
                <h1>RAJYA SABHA SESSION LOG (${selectedCategory.type.toUpperCase()})</h1>
                <p class="date">ON DATE: ${formatDateDDMMYYYY(dateFilter)}</p>
                <p class="generated">Generated on ${formatDateTimeReadable(new Date())}</p>
                
                <table>
                    <thead>
                        <tr>
                            <th>S.No</th>
                            <th>Time</th>
                            <th>Member Name</th>
                            ${selectedCategory.type === 'Member Speaking' ? '<th>Heading</th>' : ''}
                            <th>Party</th>
                            <th>Chairperson</th>
                            ${selectedCategory.type === 'Zero Hour' ? '<th>Allotted</th>' : ''}
                            <th>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryLogs.map((log, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${formatTime(log.start_time)}</td>
                                <td>${log.member_name || '-'}</td>
                                ${selectedCategory.type === 'Member Speaking' ? `<td>${log.heading || '-'}</td>` : ''}
                                <td>${log.party || '-'}</td>
                                <td>${log.chairperson || '-'}</td>
                                ${selectedCategory.type === 'Zero Hour' ? `<td>${formatDuration(log.allotted_seconds || 180)}</td>` : ''}
                                <td>${formatDuration(log.duration_seconds)}</td>
                            </tr>
                        `).join('')}
                        <tr class="total">
                            <td colspan="${selectedCategory.type === 'Member Speaking' ? 6 : (selectedCategory.type === 'Zero Hour' ? 6 : 5)}" style="text-align: right;">Total Duration:</td>
                            <td>${formatDuration(totalDuration)}</td>
                        </tr>
                    </tbody>
                </table>
                
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
            <Header showBack />

            <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
                {/* Page Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <ClipboardList size={32} className="text-red-800" />
                        <h2 className="text-2xl md:text-3xl font-bold text-red-800">Session Activity Log</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        {/* Date Filter */}
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow">
                            <Calendar size={20} className="text-gray-500" />
                            <input
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="border-none outline-none font-semibold"
                            />
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchLogs}
                            className="bg-white p-3 rounded-xl shadow hover:bg-gray-50 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw size={20} className="text-gray-600" />
                        </button>

                        {/* Clear Button */}
                        <button
                            onClick={clearLogs}
                            className="bg-red-100 text-red-700 p-3 rounded-xl shadow hover:bg-red-200 transition-colors"
                            title="Clear All Logs"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                    </div>
                ) : (
                    /* Category Cards */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {categories.map((category) => {
                            const Icon = category.icon;
                            
                            // For Bill Discussion, show ALL current session bills count and total time across ALL bills
                            if (category.type === 'Bill Discussion') {
                                // Use currentSessionBills for count (ALL bills, not just ones with logs)
                                const billCount = currentSessionBills.length;
                                // Calculate total time from bills that have logs
                                const uniqueBills = getUniqueBills();
                                const totalBillTime = uniqueBills.reduce((sum, bill) => sum + (bill.totalDuration || 0), 0);
                                
                                return (
                                    <div
                                        key={category.type}
                                        onClick={() => openCategoryPopup(category)}
                                        className={`bg-gradient-to-br ${category.color} rounded-2xl p-6 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl`}
                                    >
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="bg-white/20 p-3 rounded-xl">
                                                <Icon size={32} />
                                            </div>
                                            <h3 className="text-xl font-bold">{category.type}</h3>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-white/80">Total Current Bills:</span>
                                                <span className="text-2xl font-bold">{billCount}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-white/80">Total Time:</span>
                                                <span className="text-2xl font-bold">{formatDuration(totalBillTime)}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-4 pt-4 border-t border-white/20 text-center">
                                            <span className="text-sm text-white/70">Click to view details →</span>
                                        </div>
                                    </div>
                                );
                            }
                            
                            // For Zero Hour and Member Speaking, show member count
                            const totalSeconds = getTotalDuration(category.type);
                            const memberCount = getMemberCount(category.type);
                            
                            return (
                                <div
                                    key={category.type}
                                    onClick={() => openCategoryPopup(category)}
                                    className={`bg-gradient-to-br ${category.color} rounded-2xl p-6 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl`}
                                >
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="bg-white/20 p-3 rounded-xl">
                                            <Icon size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold">{category.type}</h3>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-white/80">Total Members:</span>
                                            <span className="text-2xl font-bold">{memberCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-white/80">Total Time:</span>
                                            <span className="text-2xl font-bold">{formatDuration(totalSeconds)}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4 pt-4 border-t border-white/20 text-center">
                                        <span className="text-sm text-white/70">Click to view details →</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            </main>

            {/* Detail Popup - Zero Hour & Member Speaking */}
            {showPopup && selectedCategory && selectedCategory.type !== 'Bill Discussion' && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-fade-in">
                        {/* Popup Header */}
                        <div className={`bg-gradient-to-r ${selectedCategory.color} text-white p-4 flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <selectedCategory.icon size={28} />
                                <div>
                                    <h3 className="text-xl font-bold">{selectedCategory.type}</h3>
                                    <p className="text-sm text-white/80">Date: {dateFilter}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPopup(false)} 
                                className="hover:bg-white/20 p-2 rounded-lg transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        {/* Popup Content */}
                        <div className="overflow-auto max-h-[60vh]">
                        <table className="w-full">
                                <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">S.No</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Seat No</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Time</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Member Name</th>
                                        {selectedCategory.type === 'Member Speaking' && (
                                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Heading</th>
                                        )}
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Party</th>
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Chairperson</th>
                                        {selectedCategory.type === 'Zero Hour' && (
                                            <th className="px-4 py-3 text-center font-semibold text-gray-700">Allotted</th>
                                        )}
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Duration</th>
                                        <th className="px-4 py-3 text-center font-semibold text-gray-700 w-16">Delete</th>
                                </tr>
                            </thead>
                            <tbody>
                                    {getLogsByCategory(selectedCategory.type).length === 0 ? (
                                    <tr>
                                        <td colSpan={selectedCategory.type === 'Member Speaking' ? 9 : (selectedCategory.type === 'Zero Hour' ? 10 : 8)} className="text-center py-8 text-gray-500">
                                                No entries for {selectedCategory.type} on this date.
                                        </td>
                                    </tr>
                                ) : (
                                        getLogsByCategory(selectedCategory.type).map((log, index) => (
                                        <tr
                                            key={log.id}
                                                className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-red-50 group`}
                                        >
                                                <td className="px-4 py-3 font-semibold text-gray-600">{index + 1}</td>
                                                <td className="px-4 py-3 font-bold text-blue-600">{log.seat_no || '-'}</td>
                                                <td className="px-4 py-3 font-mono text-gray-700">{formatTime(log.start_time)}</td>
                                            <td className="px-4 py-3 font-semibold">{log.member_name || '-'}</td>
                                            {selectedCategory.type === 'Member Speaking' && (
                                                <td className="px-4 py-3 text-gray-600">{log.heading || '-'}</td>
                                            )}
                                            <td className="px-4 py-3 text-gray-600">{log.party || '-'}</td>
                                            <td className="px-4 py-3 text-gray-600">{log.chairperson || '-'}</td>
                                            {selectedCategory.type === 'Zero Hour' && (
                                                <td className="px-4 py-3 text-center font-mono font-semibold text-blue-700">
                                                    {formatDuration(log.allotted_seconds || 180)}
                                                </td>
                                            )}
                                            <td className="px-4 py-3 text-center font-mono font-bold text-red-800">
                                                {formatDuration(log.duration_seconds)}
                                            </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => deleteLogEntry(log.id, log.member_name)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-100 p-1.5 rounded-lg transition-colors opacity-50 group-hover:opacity-100"
                                                        title="Delete entry"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                        {/* Popup Footer */}
                        <div className="p-4 bg-gray-50 border-t">
                            <div className="flex items-center justify-between mb-4">
                        <span className="text-gray-600">
                                    Total Entries: <strong>{getMemberCount(selectedCategory.type)}</strong>
                        </span>
                                <span className="text-xl font-bold text-red-800">
                                    Total: {formatDuration(getTotalDuration(selectedCategory.type))}
                        </span>
                            </div>
                            
                            {/* Export Buttons */}
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={exportToExcel}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    <FileSpreadsheet size={20} />
                                    Export to Excel
                                </button>
                                <button
                                    onClick={exportToPDF}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    <Download size={20} />
                                    Export to PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bill Discussion Popup - Level 1: Bill List */}
            {showPopup && selectedCategory?.type === 'Bill Discussion' && billPopupLevel === 1 && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-fade-in">
                        {/* Popup Header */}
                        <div className="bg-gradient-to-r from-red-700 to-red-900 text-white p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText size={28} />
                                <div>
                                    <h3 className="text-xl font-bold">Bill Discussion - Current Session</h3>
                                    <p className="text-sm text-white/80">All time data for running bills • Select a bill to view party-wise details</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={runBillIdMigration}
                                    disabled={migrationRunning}
                                    className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                    title="Link logs to bill IDs (run after bill name changes)"
                                >
                                    <RefreshCw size={16} className={migrationRunning ? 'animate-spin' : ''} />
                                </button>
                                <button 
                                    onClick={() => setShowPopup(false)} 
                                    className="hover:bg-white/20 p-2 rounded-lg transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        
                        {/* Bill List Content */}
                        <div className="overflow-auto max-h-[60vh] p-4 space-y-3">
                            {billActionMessage && (
                                <div
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                                        billActionMessage.type === 'success'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-700'
                                    }`}
                                >
                                    {billActionMessage.text}
                                </div>
                            )}
                            {currentSessionBills.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No current session bills found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Show ALL current session bills, merging with log data if available */}
                                    {currentSessionBills.map((sessionBill, index) => {
                                        // Find matching log data for this bill
                                        const billsWithLogs = getUniqueBills();
                                        const logData = billsWithLogs.find(b => 
                                            b.bill_id === sessionBill.id || 
                                            b.name?.toLowerCase() === sessionBill.bill_name?.toLowerCase()
                                        );
                                        const totalDuration = logData?.totalDuration || 0;
                                        const logs = logData?.logs || [];
                                        const uniqueMembers = new Set(logs.map(l => l.seat_no || l.member_name)).size;
                                        const actionBusy = billActionLoadingId === sessionBill.id;
                                        
                                        return (
                                            <div
                                                key={sessionBill.id || index}
                                                onClick={() => {
                                                    setSelectedBill({
                                                        name: sessionBill.bill_name,
                                                        bill_id: sessionBill.id,
                                                        logs: [],
                                                        totalDuration: 0,
                                                        dateContext: dateFilter || null
                                                    });
                                                    setExpandedMemberRows({});
                                                    setBillPopupLevel(2);
                                                    fetchBillLogs({ name: sessionBill.bill_name, bill_id: sessionBill.id, id: sessionBill.id });
                                                }}
                                                className={`bg-gradient-to-r ${totalDuration > 0 ? 'from-green-50 to-green-100 border-green-200' : 'from-gray-50 to-gray-100 border-gray-200'} border-2 rounded-xl p-4 cursor-pointer hover:border-green-400 hover:shadow-lg transition-all`}
                                            >
                                                <div className="flex items-center justify-between flex-wrap gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <FileText size={24} className={totalDuration > 0 ? 'text-green-600' : 'text-gray-400'} />
                                                        <div>
                                                            <h4 className={`font-bold ${totalDuration > 0 ? 'text-green-800' : 'text-gray-600'}`}>{sessionBill.bill_name}</h4>
                                                            <p className="text-sm text-gray-600">
                                                                {uniqueMembers} unique members • {logs.length} speeches
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-xl font-bold ${totalDuration > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                                                            {formatDuration(totalDuration)}
                                                        </div>
                                                        <div className="text-sm text-gray-500">Total Time (All Dates)</div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                                                    <button
                                                        onClick={(e) => handleBillLogsDelete(e, { name: sessionBill.bill_name, bill_id: sessionBill.id })}
                                                        disabled={actionBusy}
                                                        className="flex items-center gap-1 border border-red-500 text-red-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <Trash2 size={14} />
                                                        {actionBusy ? 'Deleting…' : 'Delete Logs'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div className="p-4 bg-gray-50 border-t">
                            <div className="text-center text-gray-600">
                                Click on a bill to view party-wise breakdown
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bill Discussion Popup - Level 2: Party-wise Details */}
            {showPopup && selectedCategory?.type === 'Bill Discussion' && billPopupLevel === 2 && selectedBill && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden animate-fade-in">
                        {/* Popup Header */}
                        <div className="bg-gradient-to-r from-red-700 to-red-900 text-white p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        setBillPopupLevel(1);
                                        setSelectedBill(null);
                                        setBillViewMode('memberDetails');
                                    }}
                                    className="hover:bg-white/20 p-2 rounded-lg transition-colors"
                                >
                                    <ArrowLeft size={24} />
                                </button>
                                <div>
                                    <h3 className="text-xl font-bold">{selectedBill.name}</h3>
                                    <p className="text-sm text-white/80">
                                        {billViewMode === 'memberDetails' ? 'Member Details' : 'Sequential Order'} • All Time (Current Session) • Unique Members: {aggregatedMemberCount} • Speeches Logged: {selectedBill.logs?.length || 0}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* View Mode Toggle */}
                                <div className="flex bg-white/20 rounded-lg p-1">
                                    <button
                                        onClick={() => setBillViewMode('memberDetails')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                            billViewMode === 'memberDetails' ? 'bg-white text-red-800' : 'text-white hover:bg-white/10'
                                        }`}
                                    >
                                        Member Details
                                    </button>
                                    <button
                                        onClick={() => setBillViewMode('sequential')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                            billViewMode === 'sequential' ? 'bg-white text-red-800' : 'text-white hover:bg-white/10'
                                        }`}
                                    >
                                        Sequential
                                    </button>
                                </div>
                                <button 
                                    onClick={() => {
                                        setShowPopup(false);
                                        setBillPopupLevel(1);
                                        setSelectedBill(null);
                                        setBillViewMode('memberDetails');
                                    }} 
                                    className="hover:bg-white/20 p-2 rounded-lg transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        
                        {/* Content Area */}
                        <div className="overflow-auto max-h-[55vh] p-4">
                            {loadingBillLogs ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                                </div>
                            ) : (selectedBill?.logs?.length || 0) === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No entries recorded for this bill.
                                </div>
                            ) : billViewMode === 'sequential' ? (
                                /* Sequential View - Shows speeches in chronological order */
                                <div>
                                    <table className="w-full border border-gray-200 rounded-xl overflow-hidden">
                                        <thead className="bg-gradient-to-r from-red-700 to-red-800 text-white">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-sm font-semibold w-12">S.No</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold w-16">Seat</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold">Member Name</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold w-28">Party</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold w-40">Start Time</th>
                                                <th className="px-4 py-3 text-center text-sm font-semibold w-28">Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sequentialLogs.map((log, index) => (
                                                <tr
                                                    key={`seq-${log.id || index}`}
                                                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100 hover:bg-red-50`}
                                                >
                                                    <td className="px-4 py-3 text-sm font-semibold text-gray-600">{index + 1}</td>
                                                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{log.seat_no || '-'}</td>
                                                    <td className="px-4 py-3 font-semibold text-gray-800">{log.member_name || '-'}</td>
                                                    <td className="px-4 py-3 text-sm">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                            log.party === 'BJP' ? 'bg-orange-100 text-orange-700' :
                                                            log.party === 'INC' ? 'bg-blue-100 text-blue-700' :
                                                            log.party === 'AAP' ? 'bg-cyan-100 text-cyan-700' :
                                                            log.party === 'DMK' ? 'bg-red-100 text-red-700' :
                                                            log.party === 'SP' ? 'bg-green-100 text-green-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {log.party || 'Unknown'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600">{formatDateTimeReadable(log.start_time)}</td>
                                                    <td className="px-4 py-3 text-center font-mono font-bold text-green-700">
                                                        {formatDuration(log.duration_seconds || 0)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* Member Details View - Shows party and member details with allocations */
                                partyData.map((partyInfo, partyIndex) => (
                                    <div key={`${partyInfo.party}-${partyIndex}`} className="mb-6">
                                        {/* Party Header */}
                                        <div
                                            className={`p-3 rounded-t-xl font-bold text-white flex items-center justify-between ${
                                                partyInfo.party === 'BJP'
                                                    ? 'bg-orange-500'
                                                    : partyInfo.party === 'INC'
                                                    ? 'bg-blue-500'
                                                    : partyInfo.party === 'AAP'
                                                    ? 'bg-cyan-500'
                                                    : partyInfo.party === 'DMK'
                                                    ? 'bg-red-500'
                                                    : partyInfo.party === 'SP'
                                                    ? 'bg-green-500'
                                                    : partyInfo.party === 'Others'
                                                    ? 'bg-purple-500'
                                                    : 'bg-gray-500'
                                            }`}
                                        >
                                            <span>
                                                {partyInfo.party} ({partyInfo.members.length} members)
                                            </span>
                                            <span className="flex items-center gap-3">
                                                <span className="text-white/90 text-sm font-semibold">
                                                    Allocated: {formatDuration(partyInfo.allottedSeconds || 0)}
                                                </span>
                                                <span>{formatDuration(partyInfo.totalDuration)}</span>
                                            </span>
                                        </div>

                                        <table className="w-full border border-gray-200">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600 w-12">S.No</th>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600 w-16">Seat No</th>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600">Member Name</th>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600 w-20">Speeches</th>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600 w-28">Allotted</th>
                                                    <th className="px-3 py-2 text-left text-sm font-semibold text-gray-600 w-32">Aggregate Time</th>
                                                    <th className="px-3 py-2 text-center text-sm font-semibold text-gray-600 w-16">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {partyInfo.members.map((member, index) => {
                                                    const rowKey = `${partyInfo.party}-${member.seatKey || index}`;
                                                    const isExpanded = expandedMemberRows[rowKey];
                                                    return (
                                                        <>
                                                            <tr
                                                                key={rowKey}
                                                                className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}
                                                            >
                                                                <td className="px-3 py-2 text-sm text-gray-600">{index + 1}</td>
                                                                <td className="px-3 py-2 text-sm font-bold text-blue-600">
                                                                    {member.seat_no || '-'}
                                                                </td>
                                                                <td className="px-3 py-2 font-semibold">{member.member_name || '-'}</td>
                                                                <td className="px-3 py-2 text-sm text-gray-700">{member.speeches.length}</td>
                                                                <td className="px-3 py-2 font-mono font-semibold text-gray-600">
                                                                    {formatDuration(member.allottedSeconds || 0)}
                                                                </td>
                                                                <td className="px-3 py-2 font-mono font-bold text-green-700">
                                                                    {formatDuration(member.totalDuration)}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <button
                                                                        onClick={() => toggleMemberDetails(partyInfo.party, member.seatKey || index)}
                                                                        className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
                                                                    >
                                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan={7} className="bg-white">
                                                                        <div className="p-3 bg-gray-50 rounded-b-xl space-y-2 text-sm text-gray-700">
                                                                            {member.speeches.map((speech, speechIndex) => (
                                                                                <div
                                                                                    key={`${rowKey}-speech-${speechIndex}`}
                                                                                    className="flex items-center gap-3 justify-between"
                                                                                >
                                                                                    <span className="font-medium text-gray-600 min-w-[90px]">
                                                                                        Speech {speechIndex + 1}:
                                                                                    </span>
                                                                                    <span className="flex-1">{formatDateTimeReadable(speech.start_time)}</span>
                                                                                    {editingSpeech?.id === speech.id ? (
                                                                                        <div className="flex items-center gap-1">
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                max="23"
                                                                                                value={editTimeInput.hours}
                                                                                                onChange={(e) => setEditTimeInput(prev => ({ ...prev, hours: e.target.value }))}
                                                                                                className="w-10 px-1 py-0.5 text-center border border-gray-300 rounded text-sm"
                                                                                                placeholder="H"
                                                                                            />
                                                                                            <span>:</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                max="59"
                                                                                                value={editTimeInput.minutes}
                                                                                                onChange={(e) => setEditTimeInput(prev => ({ ...prev, minutes: e.target.value }))}
                                                                                                className="w-10 px-1 py-0.5 text-center border border-gray-300 rounded text-sm"
                                                                                                placeholder="M"
                                                                                            />
                                                                                            <span>:</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                min="0"
                                                                                                max="59"
                                                                                                value={editTimeInput.seconds}
                                                                                                onChange={(e) => setEditTimeInput(prev => ({ ...prev, seconds: e.target.value }))}
                                                                                                className="w-10 px-1 py-0.5 text-center border border-gray-300 rounded text-sm"
                                                                                                placeholder="S"
                                                                                            />
                                                                                            <button
                                                                                                onClick={saveEditedSpeechTime}
                                                                                                disabled={editLoading}
                                                                                                className="text-green-600 hover:text-green-800 hover:bg-green-100 p-1 rounded-lg transition-colors disabled:opacity-50"
                                                                                                title="Save"
                                                                                            >
                                                                                                <Check size={14} />
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={cancelEditSpeech}
                                                                                                disabled={editLoading}
                                                                                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1 rounded-lg transition-colors disabled:opacity-50"
                                                                                                title="Cancel"
                                                                                            >
                                                                                                <X size={14} />
                                                                                            </button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <>
                                                                                            <span className="font-mono text-green-700">
                                                                                                {formatDuration(speech.duration_seconds)}
                        </span>
                                                                                            {speech.id && (
                                                                                                <>
                                                                                                    <button
                                                                                                        onClick={() => startEditSpeech(speech)}
                                                                                                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 p-1 rounded-lg transition-colors"
                                                                                                        title="Edit time"
                                                                                                    >
                                                                                                        <Edit2 size={14} />
                                                                                                    </button>
                                                                                                    <button
                                                                                                        onClick={() => deleteLogEntry(speech.id, member.member_name)}
                                                                                                        className="text-red-500 hover:text-red-700 hover:bg-red-100 p-1 rounded-lg transition-colors"
                                                                                                        title="Delete this entry"
                                                                                                    >
                                                                                                        <Trash2 size={14} />
                                                                                                    </button>
                                                                                                </>
                                                                                            )}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ))
                            )}
                        </div>
                        
                        {/* Footer with Grand Total and Export */}
                        <div className="p-4 bg-gray-50 border-t">
                            <div className="flex items-center justify-between mb-4">
                        <span className="text-gray-600">
                                    Unique Members: <strong>{aggregatedMemberCount}</strong>
                                </span>
                                <span className="text-xl font-bold text-green-700">
                                    Grand Total: {formatDuration(selectedBill.totalDuration)}
                        </span>
                    </div>
                            
                            {/* Export and Back Buttons */}
                            <div className="flex gap-4 justify-center">
                                <button
                                    onClick={() => {
                                        setBillPopupLevel(1);
                                        setSelectedBill(null);
                                    }}
                                    className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    <ArrowLeft size={20} />
                                    Back to Bills
                                </button>
                                <button
                                    onClick={exportBillToExcel}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    <FileSpreadsheet size={20} />
                                    Export to Excel
                                </button>
                                <button
                                    onClick={exportBillToPDF}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition-colors"
                                >
                                    <Download size={20} />
                                    Export to PDF
                                </button>
                </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Delete</h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete <strong>ALL</strong> log entries for <strong>"{showDeleteConfirm.name}"</strong>?
                            <span className="block mt-2 text-sm text-amber-600">
                                (This will delete logs from all dates for this bill)
                            </span>
                        </p>
                        <p className="text-sm text-red-600 mb-6">
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteBillLogs}
                                className="px-4 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700"
                            >
                                Delete All Logs
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
}
