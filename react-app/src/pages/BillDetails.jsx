import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { FilePlus, FileText, Clock, Plus, Trash2, Save, X, Check, Edit, Eye, User, ChevronDown, ChevronUp, Search, Archive, History, Printer } from 'lucide-react';
import { useBroadcast } from '../context/BroadcastContext';

export default function BillDetails() {
    const { isBroadcasting, broadcastType, updateBroadcastData } = useBroadcast();
    const [activeTab, setActiveTab] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // New Bill Form State
    const [billName, setBillName] = useState('');
    const [partyAllocations, setPartyAllocations] = useState([]);
    const [othersTime, setOthersTime] = useState({ hours: 0, minutes: 0, members: [] });
    const [showPartySelector, setShowPartySelector] = useState(false);
    const [bills, setBills] = useState([]);
    const [editingBill, setEditingBill] = useState(null);

    // Details Modal State
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedBillDetails, setSelectedBillDetails] = useState(null);
    const [consumedTimeData, setConsumedTimeData] = useState({});
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsViewMode, setDetailsViewMode] = useState('partyMembers'); // 'partyOnly' or 'partyMembers'

    // Member allocation state
    const [allMembers, setAllMembers] = useState([]);
    const [expandedPartyIndex, setExpandedPartyIndex] = useState(null);
    const [memberSearchTerm, setMemberSearchTerm] = useState('');
    const [showAddMemberModal, setShowAddMemberModal] = useState(null); // index of party for modal or 'others'
    const [newMemberData, setNewMemberData] = useState({ member: null, hours: 0, minutes: 0 });
    const [customPartyName, setCustomPartyName] = useState('');

    // Party list extracted from members database
    const [allParties, setAllParties] = useState([]);
    const [pastBills, setPastBills] = useState([]);
    const [loadingPast, setLoadingPast] = useState(false);
    const [pastBillLogs, setPastBillLogs] = useState({});
    const [expandedPastBillId, setExpandedPastBillId] = useState(null);
    const [loadingPastLogs, setLoadingPastLogs] = useState({});
    const [movingBillId, setMovingBillId] = useState(null);
    const [pendingEditBillId, setPendingEditBillId] = useState(null);

    // Fetch all members for member allocation
    useEffect(() => {
        fetchAllMembers();
    }, []);

    useEffect(() => {
        const storedEditId = localStorage.getItem('billDetails_edit_id');
        if (storedEditId) {
            setPendingEditBillId(Number(storedEditId));
            setActiveTab('current');
            localStorage.removeItem('billDetails_edit_id');
        }
    }, []);

    useEffect(() => {
        if (!pendingEditBillId || bills.length === 0) return;
        const match = bills.find(bill => Number(bill.id) === Number(pendingEditBillId));
        if (match) {
            handleEditBill(match);
            setPendingEditBillId(null);
        }
    }, [pendingEditBillId, bills]);

    const fetchAllMembers = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/members');
            const data = await response.json();
            if (data.success) {
                const members = data.data.filter(m => m.name && m.name !== 'VACANT');
                setAllMembers(members);
                
                // Extract unique parties from members database
                const uniqueParties = [...new Set(members.map(m => m.party).filter(p => p && p.trim() !== ''))];
                // Sort parties alphabetically, but keep common ones at top
                const priorityParties = [
                    'BJP',
                    'INC',
                    'AAP',
                    'TMC',
                    'TMC(M)',
                    'DMK',
                    'SP',
                    'NCP',
                    'NCP-SCP',
                    'RLD',
                    'RLSP',
                    'NPP',
                    'MNF',
                    'KC(M)',
                    'UPP(L)',
                    'RPI(A)',
                    'SS-UBT',
                    'MNM'
                ];
                const sortedParties = uniqueParties.sort((a, b) => {
                    const aIndex = priorityParties.indexOf(a);
                    const bIndex = priorityParties.indexOf(b);
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return a.localeCompare(b);
                });
                setAllParties(sortedParties);
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        }
    };

    // Get members by party
    const getMembersByParty = (party) => {
        return allMembers.filter(m => m.party === party);
    };

    // Get filtered members for search
    const getFilteredMembers = (party) => {
        const partyMembers = getMembersByParty(party);
        if (!memberSearchTerm) return partyMembers;
        return partyMembers.filter(m => 
            m.name.toLowerCase().includes(memberSearchTerm.toLowerCase())
        );
    };

    const getOthersMembers = () => othersTime.members || [];

    const getEligibleMembersForOthers = () => {
        const allocatedParties = partyAllocations.map(a => (a.party || '').trim());
        return allMembers.filter(member => {
            const partyName = (member.party || '').trim();
            return !allocatedParties.includes(partyName);
        });
    };

    const getFilteredOthersMembers = () => {
        const baseList = getEligibleMembersForOthers();
        if (!memberSearchTerm) return baseList;
        return baseList.filter(m =>
            m.name.toLowerCase().includes(memberSearchTerm.toLowerCase())
        );
    };

    const getOthersMembersAllocatedMins = () => {
        return getOthersMembers().reduce((total, member) => {
            return total + ((member.hours || 0) * 60 + (member.minutes || 0));
        }, 0);
    };

    const getOthersRemainingMins = () => {
        const total = (othersTime.hours || 0) * 60 + (othersTime.minutes || 0);
        return total - getOthersMembersAllocatedMins();
    };

    const isMemberInOthers = (seatNo) => {
        return getOthersMembers().some(member => String(member.seat_no) === String(seatNo));
    };

    // Send allocation updates to broadcast whenever partyAllocations changes
    useEffect(() => {
        if (isBroadcasting && broadcastType === 'Bill Discussion' && (partyAllocations.length > 0 || getOthersMembers().length > 0)) {
            // Build allocation map for all members
            const allMemberAllocations = {};
            partyAllocations.forEach(pa => {
                (pa.members || []).forEach(m => {
                    const allocation = {
                        allocated: (m.hours || 0) * 3600 + (m.minutes || 0) * 60,
                        isAllocated: true
                    };
                    allMemberAllocations[String(m.seat_no)] = allocation;
                    allMemberAllocations[Number(m.seat_no)] = allocation;
                });
            });
            getOthersMembers().forEach(m => {
                const allocation = {
                    allocated: (m.hours || 0) * 3600 + (m.minutes || 0) * 60,
                    isAllocated: true
                };
                allMemberAllocations[String(m.seat_no)] = allocation;
                allMemberAllocations[Number(m.seat_no)] = allocation;
            });
            
            if (Object.keys(allMemberAllocations).length > 0) {
                console.log('Live allocation update:', allMemberAllocations);
                updateBroadcastData({
                    memberAllocationsUpdated: allMemberAllocations
                });
            }
        }
    }, [partyAllocations, othersTime, isBroadcasting, broadcastType, updateBroadcastData]);

    useEffect(() => {
        if (activeTab === 'current') {
            fetchBills('current');
        } else if (activeTab === 'past') {
            fetchBills('past');
        }
    }, [activeTab]);

    const fetchBills = async (status = 'current') => {
        const normalizedStatus = (status || 'current').toLowerCase();
        const isPast = normalizedStatus === 'past';
        if (isPast) {
            setLoadingPast(true);
        } else {
        setLoading(true);
        }
        try {
            const response = await fetch(`http://localhost:5000/api/bill-details?status=${normalizedStatus}`);
            const data = await response.json();
            if (data.success) {
                if (isPast) {
                    setPastBills(data.data);
                } else {
                setBills(data.data);
                }
            }
        } catch (error) {
            console.error('Error fetching bills:', error);
        } finally {
            if (isPast) {
                setLoadingPast(false);
            } else {
            setLoading(false);
            }
        }
    };

    // Fetch consumed time for a specific bill
    const fetchBillConsumedTime = async (bill) => {
        setLoadingDetails(true);
        try {
            const response = await fetch(`http://localhost:5000/api/bill-consumed-time/${bill.id}`);
            const data = await response.json();
            if (data.success) {
                setConsumedTimeData(data.data);
            } else {
                setConsumedTimeData({});
            }
        } catch (error) {
            console.error('Error fetching consumed time:', error);
            setConsumedTimeData({});
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleViewDetails = async (bill) => {
        setSelectedBillDetails(bill);
        setShowDetailsModal(true);
        await fetchBillConsumedTime(bill);
    };

    // Get available parties (not already allocated)
    const getAvailableParties = () => {
        const allocatedParties = partyAllocations.map(a => a.party);
        return allParties.filter(p => !allocatedParties.includes(p));
    };

    const addPartyAllocation = (party) => {
        if (!party) return;
        const normalizedParty = party.trim();
        if (!normalizedParty) return;
        if (partyAllocations.find(a => a.party === normalizedParty)) {
        setShowPartySelector(false);
            setCustomPartyName('');
            return;
        }
        setPartyAllocations([...partyAllocations, { party: normalizedParty, hours: 0, minutes: 0, members: [] }]);
        setAllParties(prev => prev.includes(normalizedParty) ? prev : [...prev, normalizedParty]);
        setShowPartySelector(false);
        setCustomPartyName('');
    };

    const handleAddCustomParty = () => {
        addPartyAllocation(customPartyName.toUpperCase());
    };

    const removePartyAllocation = (index) => {
        setPartyAllocations(partyAllocations.filter((_, i) => i !== index));
        if (expandedPartyIndex === index) {
            setExpandedPartyIndex(null);
        }
    };

    const updatePartyTime = (index, field, value) => {
        const updated = [...partyAllocations];
        updated[index][field] = parseInt(value) || 0;
        setPartyAllocations(updated);
    };

    // Toggle party expansion for member allocation
    const togglePartyExpansion = (index) => {
        setExpandedPartyIndex(expandedPartyIndex === index ? null : index);
        setMemberSearchTerm('');
        setShowMemberSelector(null);
    };

    // Open add member modal
    const openAddMemberModal = (partyIndex) => {
        setShowAddMemberModal(partyIndex);
        setNewMemberData({ member: null, hours: 0, minutes: 0 });
        setMemberSearchTerm('');
    };

    // Close add member modal
    const closeAddMemberModal = () => {
        setShowAddMemberModal(null);
        setNewMemberData({ member: null, hours: 0, minutes: 0 });
        setMemberSearchTerm('');
    };

    // Add member to party allocation from modal
    const confirmAddMember = () => {
        if (!newMemberData.member || showAddMemberModal === null) return;
        
        if (showAddMemberModal === 'others') {
            if (isMemberInOthers(newMemberData.member.seat_no)) {
                closeAddMemberModal();
                return;
            }
            setOthersTime(prev => ({
                ...prev,
                members: [
                    ...getOthersMembers(),
                    {
                        seat_no: newMemberData.member.seat_no,
                        name: newMemberData.member.name,
                        hours: newMemberData.hours,
                        minutes: newMemberData.minutes
                    }
                ]
            }));
            closeAddMemberModal();
            return;
        }
        
        const partyIndex = showAddMemberModal;
        const updated = partyAllocations.map((pa, idx) => {
            if (idx === partyIndex) {
                const existingMembers = pa.members || [];
                if (existingMembers.find(m => m.seat_no === newMemberData.member.seat_no)) {
                    return pa;
                }
                return {
                    ...pa,
                    members: [
                        ...existingMembers,
                        {
                            seat_no: newMemberData.member.seat_no,
                            name: newMemberData.member.name,
                            hours: newMemberData.hours,
                            minutes: newMemberData.minutes
                        }
                    ]
                };
            }
            return pa;
        });
        
        setPartyAllocations(updated);
        closeAddMemberModal();
    };

    // Remove member from party allocation
    const removeMemberFromParty = (partyIndex, memberIndex) => {
        const updated = partyAllocations.map((pa, idx) => {
            if (idx === partyIndex) {
                return {
                    ...pa,
                    members: pa.members.filter((_, i) => i !== memberIndex)
                };
            }
            return pa;
        });
        setPartyAllocations(updated);
    };

    const removeMemberFromOthers = (memberIndex) => {
        setOthersTime(prev => ({
            ...prev,
            members: getOthersMembers().filter((_, idx) => idx !== memberIndex)
        }));
    };

    // Update member time
    const updateMemberTime = (partyIndex, memberIndex, field, value) => {
        const updated = partyAllocations.map((pa, idx) => {
            if (idx === partyIndex) {
                return {
                    ...pa,
                    members: pa.members.map((m, mIdx) => {
                        if (mIdx === memberIndex) {
                            return {
                                ...m,
                                [field]: parseInt(value) || 0
                            };
                        }
                        return m;
                    })
                };
            }
            return pa;
        });
        setPartyAllocations(updated);
    };

    const updateOthersMemberTime = (memberIndex, field, value) => {
        setOthersTime(prev => ({
            ...prev,
            members: getOthersMembers().map((member, idx) => {
                if (idx === memberIndex) {
                    return {
                        ...member,
                        [field]: parseInt(value) || 0
                    };
                }
                return member;
            })
        }));
    };

    // Get total allocated time for members in a party
    const getMembersAllocatedTime = (partyIndex) => {
        const members = partyAllocations[partyIndex]?.members || [];
        let totalMins = 0;
        members.forEach(m => {
            totalMins += (m.hours || 0) * 60 + (m.minutes || 0);
        });
        return totalMins;
    };

    // Get remaining party time after member allocations
    const getRemainingPartyTime = (partyIndex) => {
        const allocation = partyAllocations[partyIndex];
        const partyTotalMins = allocation.hours * 60 + allocation.minutes;
        const membersAllocatedMins = getMembersAllocatedTime(partyIndex);
        return partyTotalMins - membersAllocatedMins;
    };

    // Check if member is already allocated in any party
    const isMemberAllocated = (partyIndex, memberSeatNo) => {
        const members = partyAllocations[partyIndex]?.members || [];
        return members.some(m => m.seat_no === memberSeatNo);
    };

    const resetForm = () => {
        setBillName('');
        setPartyAllocations([]);
        setOthersTime({ hours: 0, minutes: 0, members: [] });
        setEditingBill(null);
        setExpandedPartyIndex(null);
        setMemberSearchTerm('');
    };

    const handleSaveBill = async () => {
        if (!billName.trim()) {
            setMessage({ type: 'error', text: 'Please enter a bill name' });
            return;
        }

        if (partyAllocations.length === 0) {
            setMessage({ type: 'error', text: 'Please add at least one party allocation' });
            return;
        }

        setLoading(true);
        try {
            const url = editingBill
                ? `http://localhost:5000/api/bill-details/${editingBill.id}`
                : 'http://localhost:5000/api/bill-details';

            const response = await fetch(url, {
                method: editingBill ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bill_name: billName,
                    party_allocations: partyAllocations,
                    others_time: othersTime
                }),
            });

            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: editingBill ? 'Bill updated!' : 'Bill created!' });
                
                // If broadcasting Bill Discussion, send update with new member time allocations
                if (isBroadcasting && broadcastType === 'Bill Discussion') {
                    // Find all member allocations and notify broadcast (use both string and number keys)
                    const allMemberAllocations = {};
                    partyAllocations.forEach(pa => {
                        (pa.members || []).forEach(m => {
                            const allocation = {
                                allocated: (m.hours || 0) * 3600 + (m.minutes || 0) * 60,
                                isAllocated: true
                            };
                            // Add with both string and number keys for compatibility
                            allMemberAllocations[String(m.seat_no)] = allocation;
                            allMemberAllocations[Number(m.seat_no)] = allocation;
                        });
                    });
                    
                    console.log('Sending member allocations update:', allMemberAllocations);
                    
                    // Send update with member time data for any currently displayed member
                    updateBroadcastData({
                        memberAllocationsUpdated: allMemberAllocations
                    });
                    
                    // Also send multiple times to ensure delivery after URL navigation
                    setTimeout(() => {
                        updateBroadcastData({
                            memberAllocationsUpdated: allMemberAllocations
                        });
                    }, 200);
                    setTimeout(() => {
                        updateBroadcastData({
                            memberAllocationsUpdated: allMemberAllocations
                        });
                    }, 500);
                }
                
                // Refresh bills list
                fetchBills();
                
                // If editing, stay on the same page; if creating new, go back to list
                if (!editingBill) {
                    resetForm();
                }
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to save bill' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBill = async (id) => {
        if (!confirm('Are you sure you want to delete this bill?')) return;

        try {
            const response = await fetch(`http://localhost:5000/api/bill-details/${id}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Bill deleted!' });
                fetchBills();
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to delete bill' });
        }
    };

    const handleMoveBillToPast = async (bill) => {
        if (!bill) return;
        if (!confirm(`Move "${bill.bill_name}" to Past Session Bills?`)) return;
        setMovingBillId(bill.id);
        try {
            const response = await fetch(`http://localhost:5000/api/bill-details/${bill.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'past' })
            });
            const data = await response.json();
            if (data.success) {
                setMessage({ type: 'success', text: `"${bill.bill_name}" moved to Past Session Bills.` });
                fetchBills('current');
                fetchBills('past');
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to update bill status.' });
            }
        } catch (error) {
            console.error('Error updating bill status:', error);
            setMessage({ type: 'error', text: 'Failed to connect to server.' });
        } finally {
            setMovingBillId(null);
        }
    };

    const togglePastBillDetails = (bill) => {
        if (!bill) return;
        if (expandedPastBillId === bill.id) {
            setExpandedPastBillId(null);
            return;
        }
        if (pastBillLogs[bill.id]) {
            setExpandedPastBillId(bill.id);
            return;
        }
        loadPastBillLogs(bill);
    };

    const loadPastBillLogs = async (bill) => {
        if (!bill) return;
        setLoadingPastLogs((prev) => ({ ...prev, [bill.id]: true }));
        try {
            const response = await fetch(`http://localhost:5000/api/activity-logs/bill/${encodeURIComponent(bill.bill_name)}`);
            const data = await response.json();
            if (data.success) {
                setPastBillLogs((prev) => ({ ...prev, [bill.id]: data.data || [] }));
                setExpandedPastBillId(bill.id);
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to load bill logs.' });
            }
        } catch (error) {
            console.error('Error fetching past bill logs:', error);
            setMessage({ type: 'error', text: 'Failed to connect to server.' });
        } finally {
            setLoadingPastLogs((prev) => ({ ...prev, [bill.id]: false }));
        }
    };

    const handlePrintPastBill = (bill) => {
        if (!bill) return;
        const logs = pastBillLogs[bill.id];
        if (!logs || logs.length === 0) {
            setMessage({ type: 'error', text: 'Load bill details before printing.' });
            return;
        }
        const printWindow = window.open('', '_blank', 'width=900,height=650');
        if (!printWindow) return;
        const rowsHtml = logs.map((log, index) => `
            <tr>
                <td style="padding:8px;border:1px solid #ddd;">${index + 1}</td>
                <td style="padding:8px;border:1px solid #ddd;">${log.member_name || '-'}</td>
                <td style="padding:8px;border:1px solid #ddd;">${log.party || '-'}</td>
                <td style="padding:8px;border:1px solid #ddd;">${formatDurationSeconds(log.duration_seconds || 0)}</td>
                <td style="padding:8px;border:1px solid #ddd;">${formatDateTimeReadable(log.start_time)}</td>
            </tr>
        `).join('');
        printWindow.document.write(`
            <html>
                <head>
                    <title>${bill.bill_name} - Past Session Report</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { text-align: center; color: #991b1b; text-transform: uppercase; margin-bottom: 10px; }
                        h2 { text-align: center; color: #991b1b; margin-bottom: 10px; }
                        .generated { text-align: center; color: #991b1b; font-weight: bold; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th { background: #991b1b; color: white; }
                    </style>
                </head>
                <body>
                    <h1>RAJYA SABHA SESSION (BILL DISCUSSION)</h1>
                    <h2>${bill.bill_name}</h2>
                    <p class="generated">Generated on ${formatDateTimeReadable(new Date().toISOString())}</p>
                    <table>
                        <thead>
                            <tr>
                                <th style="padding:8px;border:1px solid #ddd;">#</th>
                                <th style="padding:8px;border:1px solid #ddd;">Member</th>
                                <th style="padding:8px;border:1px solid #ddd;">Party</th>
                                <th style="padding:8px;border:1px solid #ddd;">Spoken</th>
                                <th style="padding:8px;border:1px solid #ddd;">Start Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || '<tr><td colspan="5" style="text-align:center;padding:20px;">No logs available.</td></tr>'}
                        </tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const handlePrintSessionBills = () => {
        if (!bills || bills.length === 0) {
            setMessage({ type: 'error', text: 'No session bills to print.' });
            return;
        }
        const printWindow = window.open('', '_blank', 'width=900,height=650');
        if (!printWindow) return;
        const rowsHtml = bills.map((bill, index) => {
            const parties = (bill.party_allocations || []).map((p) => p.party).join(', ') || '-';
            return `
                <tr>
                    <td style="padding:8px;border:1px solid #ddd;">${index + 1}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${bill.bill_name}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${parties}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${getBillTotalTimeDisplay(bill)}</td>
                </tr>
            `;
        }).join('');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Current Session Bills</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 24px; }
                        h1 { color: #991b1b; text-align: center; text-transform: uppercase; margin-bottom: 10px; }
                        .generated { text-align: center; color: #991b1b; font-weight: bold; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                        th { background: #991b1b; color: #fff; padding: 10px; text-align: left; }
                        td { padding: 8px; border: 1px solid #ddd; }
                    </style>
                </head>
                <body>
                    <h1>RAJYA SABHA SESSION (BILL DISCUSSION)</h1>
                    <p class="generated">Generated on ${formatDateTimeReadable(new Date().toISOString())}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Bill Name</th>
                                <th>Parties</th>
                                <th>Total Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
    };

    const handlePrintBillDetails = () => {
        if (!selectedBillDetails) {
            setMessage({ type: 'error', text: 'Open a bill before printing.' });
            return;
        }

        const bill = selectedBillDetails;
        const allocations = bill.party_allocations || [];
        const others = bill.others_time || { hours: 0, minutes: 0, members: [] };
        const consumed = consumedTimeData || {};

        const getRemainingLabel = (allocatedMinutes, consumedSeconds) => {
            const consumedMins = Math.floor((consumedSeconds || 0) / 60);
            const remainingMins = allocatedMinutes - consumedMins;
            const abs = Math.abs(remainingMins);
            const hours = Math.floor(abs / 60);
            const minutes = abs % 60;
            const formatted = formatTime(hours, minutes);
            return remainingMins < 0 ? `-${formatted}` : formatted;
        };

        const includeMembers = detailsViewMode === 'partyMembers';
        const partyRows = allocations.map((allocation, index) => {
            const allocatedMinutes = (allocation.hours || 0) * 60 + (allocation.minutes || 0);
            const partyConsumed = consumed[allocation.party] || 0;
            const members = allocation.members || [];
            const memberRows = includeMembers ? members.map((member, memberIndex) => {
                const memberMinutes = (member.hours || 0) * 60 + (member.minutes || 0);
                const memberConsumed = consumed[`member_${member.seat_no}`] || 0;
                return `
                    <tr>
                        <td style="padding:8px 8px 8px 32px;border:1px solid #ddd;">
                            ↳ ${member.name} (Seat ${member.seat_no || '-'})
                        </td>
                        <td style="padding:8px;border:1px solid #ddd;">${formatTime(member.hours || 0, member.minutes || 0)}</td>
                        <td style="padding:8px;border:1px solid #ddd;">${formatSecondsToTime(memberConsumed)}</td>
                        <td style="padding:8px;border:1px solid #ddd;">${getRemainingLabel(memberMinutes, memberConsumed)}</td>
                    </tr>
                `;
            }).join('') : '';

            return `
                <tr>
                    <td style="padding:8px;border:1px solid #ddd;font-weight:600;">${allocation.party}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${formatTime(allocation.hours || 0, allocation.minutes || 0)}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${formatSecondsToTime(partyConsumed)}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${getRemainingLabel(allocatedMinutes, partyConsumed)}</td>
                </tr>
                ${memberRows}
            `;
        }).join('');

        const hasOthers = (others.hours || 0) > 0 || (others.minutes || 0) > 0 || (others.members || []).length > 0;
        const othersMinutes = (others.hours || 0) * 60 + (others.minutes || 0);
        const othersConsumed = consumed['Others'] || 0;
        const othersMemberRows = includeMembers ? (others.members || []).map((member) => {
            const memberMinutes = (member.hours || 0) * 60 + (member.minutes || 0);
            const memberConsumed = consumed[`member_${member.seat_no}`] || 0;
            return `
                <tr>
                    <td style="padding:8px 8px 8px 32px;border:1px solid #ddd;">
                        ↳ ${member.name} (Seat ${member.seat_no || '-'})
                    </td>
                    <td style="padding:8px;border:1px solid #ddd;">${formatTime(member.hours || 0, member.minutes || 0)}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${formatSecondsToTime(memberConsumed)}</td>
                    <td style="padding:8px;border:1px solid #ddd;">${getRemainingLabel(memberMinutes, memberConsumed)}</td>
                </tr>
            `;
        }).join('') : '';

        const printWindow = window.open('', '_blank', 'width=900,height=650');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>${bill.bill_name} - Party Allocation Report</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 24px; }
                        h1 { color: #991b1b; text-align: center; text-transform: uppercase; margin-bottom: 10px; }
                        h2 { color: #991b1b; text-align: center; margin-bottom: 10px; }
                        .generated { text-align: center; color: #991b1b; font-weight: bold; margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                        th { background: #991b1b; color: #fff; padding: 10px; text-align: left; }
                        td { padding: 8px; border: 1px solid #ddd; }
                    </style>
                </head>
                <body>
                    <h1>RAJYA SABHA SESSION (BILL DISCUSSION)</h1>
                    <h2>${bill.bill_name}</h2>
                    <p class="generated">Generated on ${formatDateTimeReadable(new Date().toISOString())}</p>
                    <p><strong>Total Allocated Time:</strong> ${getBillTotalTimeDisplay(bill)}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Party / Member</th>
                                <th>Allocated</th>
                                <th>Consumed</th>
                                <th>Remaining</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${partyRows || '<tr><td colspan="4" style="text-align:center;padding:16px;">No party allocations defined.</td></tr>'}
                            ${hasOthers ? `
                                <tr>
                                    <td style="padding:8px;border:1px solid #ddd;font-weight:600;">Others</td>
                                    <td style="padding:8px;border:1px solid #ddd;">${formatTime(others.hours || 0, others.minutes || 0)}</td>
                                    <td style="padding:8px;border:1px solid #ddd;">${formatSecondsToTime(othersConsumed)}</td>
                                    <td style="padding:8px;border:1px solid #ddd;">${getRemainingLabel(othersMinutes, othersConsumed)}</td>
                                </tr>
                                ${othersMemberRows}
                            ` : ''}
                        </tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 300);
    };

    const handleEditBill = (bill) => {
        setEditingBill(bill);
        setBillName(bill.bill_name);
        // Ensure each party allocation has a members array
        const allocations = (bill.party_allocations || []).map(a => ({
            ...a,
            members: a.members || []
        }));
        setPartyAllocations(allocations);
        const others = bill.others_time || { hours: 0, minutes: 0 };
        setOthersTime({
            hours: others.hours || 0,
            minutes: others.minutes || 0,
            members: others.members || []
        });
        setExpandedPartyIndex(null);
        setActiveTab('new');
    };

    const formatTime = (hours, minutes) => {
        return `${hours}h ${minutes}m`;
    };

    const formatSecondsToTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return formatTime(hrs, mins);
    };

    const formatDurationSeconds = (seconds = 0) => {
        const total = Math.max(0, seconds || 0);
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const formatDateTimeReadable = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const time = date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        return `${day}/${month}/${year} ${time}`;
    };

    const getBillTotalTimeDisplay = (bill) => {
        const allocations = bill?.party_allocations || [];
        const others = bill?.others_time || { hours: 0, minutes: 0 };
        let totalMinutes = (others.hours || 0) * 60 + (others.minutes || 0);
        allocations.forEach(a => {
            totalMinutes += ((a.hours || 0) * 60) + (a.minutes || 0);
        });
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return formatTime(hours, mins);
    };

    const getTotalTime = () => {
        let totalMinutes = othersTime.hours * 60 + othersTime.minutes;
        partyAllocations.forEach(a => {
            totalMinutes += a.hours * 60 + a.minutes;
        });
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return formatTime(hours, mins);
    };

    // Details Modal Component
    const DetailsModal = () => {
        const scrollContainerRef = useRef(null);

        // Handle scroll within modal - prevent propagation and ensure scrolling works
        const handleModalWheel = (event) => {
            const el = scrollContainerRef.current;
            if (!el) return;
            
            // Stop propagation to prevent any parent handlers from interfering
            event.stopPropagation();
            
            // If content doesn't overflow, don't prevent default
            if (el.scrollHeight <= el.clientHeight) return;
            
            // Allow scrolling within the container
            const atTop = el.scrollTop <= 0 && event.deltaY < 0;
            const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight && event.deltaY > 0;
            
            // Only prevent default at boundaries to avoid page scroll
            if (atTop || atBottom) {
                event.preventDefault();
            }
        };

        useEffect(() => {
            if (!showDetailsModal) return;
            const el = scrollContainerRef.current;
            if (!el) return;
            
            // Attach wheel handler with non-passive to allow preventDefault
            el.addEventListener('wheel', handleModalWheel, { passive: false });
            return () => el.removeEventListener('wheel', handleModalWheel);
        }, [showDetailsModal, selectedBillDetails?.id]);

        if (!showDetailsModal || !selectedBillDetails) return null;

        const allocations = selectedBillDetails.party_allocations || [];
        const others = selectedBillDetails.others_time || { hours: 0, minutes: 0 };

        return (
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowDetailsModal(false); }}
            >
                <div className="h-full flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
                    <div 
                        className="bg-white rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl relative"
                        style={{ pointerEvents: 'auto', maxHeight: '90vh' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="gradient-primary text-white p-4 flex items-center justify-between rounded-t-2xl gap-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Clock size={24} />
                            <span className="font-bold text-lg">Party Time Details</span>
                        </div>
                            <div className="flex items-center gap-2">
                                <div className="flex bg-white/10 rounded-lg p-1">
                                    <button
                                        onClick={() => setDetailsViewMode('partyOnly')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                            detailsViewMode === 'partyOnly' ? 'bg-white text-red-800' : 'text-white hover:bg-white/10'
                                        }`}
                                    >
                                        Party Details
                                    </button>
                                    <button
                                        onClick={() => setDetailsViewMode('partyMembers')}
                                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                            detailsViewMode === 'partyMembers' ? 'bg-white text-red-800' : 'text-white hover:bg-white/10'
                                        }`}
                                    >
                                        Party & Members
                                    </button>
                                </div>
                                <button
                                    onClick={handlePrintBillDetails}
                                    disabled={loadingDetails}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-2 font-semibold disabled:opacity-50"
                                >
                                    <Printer size={18} />
                                    Print
                                </button>
                        <button onClick={() => setShowDetailsModal(false)}>
                            <X size={24} />
                        </button>
                            </div>
                    </div>

                        <div
                            ref={scrollContainerRef}
                            className="p-6 overflow-y-auto scroll-thin flex-1"
                            style={{ 
                                overscrollBehavior: 'contain', 
                                touchAction: 'pan-y',
                                WebkitOverflowScrolling: 'touch'
                            }}
                            onWheel={handleModalWheel}
                        >
                        <h3 className="text-xl font-bold text-red-800 mb-4">{selectedBillDetails.bill_name}</h3>

                        {loadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <table className="w-full">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold text-gray-700">Party</th>
                                            <th className="px-4 py-3 text-center font-bold text-gray-700">Allocated</th>
                                            <th className="px-4 py-3 text-center font-bold text-gray-700">Consumed</th>
                                            <th className="px-4 py-3 text-center font-bold text-gray-700">Remaining</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allocations.map((allocation, index) => {
                                            const allocatedMins = allocation.hours * 60 + allocation.minutes;
                                            const consumedSeconds = consumedTimeData[allocation.party] || 0;
                                            const consumedMins = Math.floor(consumedSeconds / 60);
                                            const remainingMins = allocatedMins - consumedMins;
                                            const isOvertime = remainingMins < 0;
                                            const hasMembers = allocation.members && allocation.members.length > 0;

                                            return (
                                                <React.Fragment key={index}>
                                                    <tr className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                        <td className="px-4 py-3 font-bold text-red-800">
                                                            {allocation.party}
                                                            {hasMembers && (
                                                                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                                    {allocation.members.length} members
                                                                </span>
                                                            )}
                                                        </td>
                                                    <td className="px-4 py-3 text-center text-gray-700">
                                                        {formatTime(allocation.hours, allocation.minutes)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-blue-600">
                                                        {formatSecondsToTime(consumedSeconds)}
                                                    </td>
                                                    <td className={`px-4 py-3 text-center font-bold ${isOvertime ? 'text-red-600' : 'text-green-600'}`}>
                                                        {isOvertime ? `-${formatTime(Math.floor(Math.abs(remainingMins) / 60), Math.abs(remainingMins) % 60)}` :
                                                            formatTime(Math.floor(remainingMins / 60), remainingMins % 60)}
                                                        </td>
                                                    </tr>
                                                    {/* Member rows */}
                                                    {detailsViewMode === 'partyMembers' && hasMembers && allocation.members.map((member, mIndex) => {
                                                        const memberAllocatedMins = (member.hours || 0) * 60 + (member.minutes || 0);
                                                        const memberConsumedSeconds = consumedTimeData[`member_${member.seat_no}`] || 0;
                                                        const memberConsumedMins = Math.floor(memberConsumedSeconds / 60);
                                                        const memberRemainingMins = memberAllocatedMins - memberConsumedMins;
                                                        const memberOvertime = memberRemainingMins < 0;
                                                        
                                                        return (
                                                            <tr key={`${index}-${mIndex}`} className="bg-blue-50/50 border-b border-blue-100">
                                                                <td className="px-4 py-2 pl-8 text-sm text-gray-700">
                                                                    <span className="text-gray-400">↳</span> {member.name}
                                                                    <span className="text-xs text-gray-400 ml-1">(Seat {member.seat_no})</span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center text-sm text-gray-600">
                                                                    {formatTime(member.hours || 0, member.minutes || 0)}
                                                                </td>
                                                                <td className="px-4 py-2 text-center text-sm font-bold text-blue-600">
                                                                    {formatSecondsToTime(memberConsumedSeconds)}
                                                                </td>
                                                                <td className={`px-4 py-2 text-center text-sm font-bold ${memberOvertime ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {memberOvertime 
                                                                        ? `-${formatTime(Math.floor(Math.abs(memberRemainingMins) / 60), Math.abs(memberRemainingMins) % 60)}`
                                                                        : formatTime(Math.floor(memberRemainingMins / 60), memberRemainingMins % 60)}
                                                    </td>
                                                </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                        {/* Others row */}
                                        {(others.hours > 0 || others.minutes > 0 || (others.members && others.members.length > 0)) && (
                                            <>
                                            <tr className="bg-yellow-50 border-b border-gray-100">
                                                <td className="px-4 py-3 font-bold text-yellow-700">Others</td>
                                                <td className="px-4 py-3 text-center text-gray-700">
                                                    {formatTime(others.hours, others.minutes)}
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-blue-600">
                                                    {formatSecondsToTime(consumedTimeData['Others'] || 0)}
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-green-600">
                                                    {(() => {
                                                        const allocatedMins = others.hours * 60 + others.minutes;
                                                        const consumedMins = Math.floor((consumedTimeData['Others'] || 0) / 60);
                                                        const remaining = allocatedMins - consumedMins;
                                                        return remaining < 0
                                                            ? `-${formatTime(Math.floor(Math.abs(remaining) / 60), Math.abs(remaining) % 60)}`
                                                            : formatTime(Math.floor(remaining / 60), remaining % 60);
                                                    })()}
                                                </td>
                                            </tr>
                                                {detailsViewMode === 'partyMembers' && (others.members || []).map((member, idx) => {
                                                    const memberAllocatedMins = (member.hours || 0) * 60 + (member.minutes || 0);
                                                    const memberConsumedSeconds = consumedTimeData[`member_${member.seat_no}`] || 0;
                                                    const memberConsumedMins = Math.floor(memberConsumedSeconds / 60);
                                                    const memberRemainingMins = memberAllocatedMins - memberConsumedMins;
                                                    const memberOvertime = memberRemainingMins < 0;

                                                    return (
                                                        <tr key={`others-${idx}`} className="bg-yellow-50/60 border-b border-yellow-100">
                                                            <td className="px-4 py-2 pl-8 text-sm text-gray-700">
                                                                <span className="text-gray-400">↳</span> {member.name}
                                                                <span className="text-xs text-gray-400 ml-1">(Seat {member.seat_no})</span>
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-sm text-gray-600">
                                                                {formatTime(member.hours || 0, member.minutes || 0)}
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-sm font-bold text-blue-600">
                                                                {formatSecondsToTime(memberConsumedSeconds)}
                                                            </td>
                                                            <td className={`px-4 py-2 text-center text-sm font-bold ${memberOvertime ? 'text-red-600' : 'text-green-600'}`}>
                                                                {memberOvertime
                                                                    ? `-${formatTime(Math.floor(Math.abs(memberRemainingMins) / 60), Math.abs(memberRemainingMins) % 60)}`
                                                                    : formatTime(Math.floor(memberRemainingMins / 60), memberRemainingMins % 60)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </tbody>
                                </table>

                                {/* Legend */}
                                <div className="flex items-center gap-4 text-sm text-gray-500 pt-2 border-t">
                                    <span><span className="text-blue-600 font-bold">Blue</span> = Time consumed</span>
                                    <span><span className="text-green-600 font-bold">Green</span> = Time remaining</span>
                                    <span><span className="text-red-600 font-bold">Red</span> = Overtime</span>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Show option selection if no tab is active
    if (activeTab === null) {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
                <Header showBack />

                <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full flex flex-col items-center justify-center">
                    {/* Page Title */}
                    <div className="text-center mb-8 animate-fade-in">
                        <div className="inline-flex items-center gap-3 mb-2">
                            <FilePlus size={36} className="text-red-800" />
                            <h2 className="text-3xl md:text-4xl font-bold text-red-800 uppercase">Bill Details</h2>
                        </div>
                    </div>

                    {/* Option Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                        {/* New Bill Entry */}
                        <div
                            onClick={() => setActiveTab('new')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <Plus size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold uppercase">New Bill Details Entry</h3>
                            </div>
                        </div>

                        {/* Current Session Bills */}
                        <div
                            onClick={() => setActiveTab('current')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <FileText size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold uppercase">Current Session Bills</h3>
                            </div>
                        </div>

                        {/* Past Session Bills */}
                        <div
                            onClick={() => setActiveTab('past')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <History size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold uppercase">Past Session Bills</h3>
                            </div>
                        </div>
                    </div>
                </main>

                <Footer />
            </div>
        );
    }

    // New Bill Entry Tab
    if (activeTab === 'new') {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
                <Header showBack />

                <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
                    {/* Page Title with Back */}
                    <div className="flex items-center gap-4 mb-6 animate-fade-in">
                        <button
                            onClick={() => { setActiveTab(null); resetForm(); }}
                            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                        >
                            ← Back
                        </button>
                        <div className="inline-flex items-center gap-3">
                            <Plus size={32} className="text-red-800" />
                            <h2 className="text-2xl md:text-3xl font-bold text-red-800 uppercase">
                                {editingBill ? 'Edit Bill Details' : 'New Bill Details Entry'}
                            </h2>
                        </div>
                    </div>

                    {/* Message */}
                    {message.text && (
                        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                            {message.text}
                            <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto">
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    {/* Bill Entry Form */}
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="gradient-primary text-white p-4 flex items-center gap-2">
                            <FilePlus size={24} />
                            <span className="font-bold text-lg">Bill Information</span>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Bill Name */}
                            <div>
                                <label className="block font-semibold text-gray-700 mb-2">Bill Name *</label>
                                <input
                                    type="text"
                                    value={billName}
                                    onChange={(e) => setBillName(e.target.value)}
                                    placeholder="Enter the name of the bill"
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 text-lg"
                                />
                            </div>

                            {/* Party Time Allocations */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="font-semibold text-gray-700">Party Time Allocations</label>
                                    <button
                                        onClick={() => setShowPartySelector(true)}
                                        className="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-red-200"
                                    >
                                        <Plus size={18} />
                                        Add Party
                                    </button>
                                </div>

                                {/* Party Selector Modal */}
                                {showPartySelector && (
                                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                                        <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-xl font-bold text-gray-800">Select Party</h3>
                                                <button onClick={() => setShowPartySelector(false)}>
                                                    <X size={24} />
                                                </button>
                                            </div>
                                            {getAvailableParties().length > 0 ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                {getAvailableParties().map(party => (
                                                    <button
                                                        key={party}
                                                        onClick={() => addPartyAllocation(party)}
                                                        className="px-4 py-3 bg-gray-100 hover:bg-red-100 rounded-lg font-semibold text-left transition-colors"
                                                    >
                                                        {party}
                                                    </button>
                                                ))}
                                            </div>
                                            ) : (
                                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                                    No parties available from the database. Add a custom party below.
                                                </div>
                                            )}
                                            <div className="border-t border-gray-100 pt-4">
                                                <label className="block font-semibold text-gray-700 mb-2">Add Custom Party</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={customPartyName}
                                                        onChange={(e) => setCustomPartyName(e.target.value.toUpperCase())}
                                                        placeholder="Enter party name"
                                                        className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-red-400"
                                                    />
                                                    <button
                                                        onClick={handleAddCustomParty}
                                                        disabled={!customPartyName.trim()}
                                                        className="px-4 py-2 gradient-primary text-white rounded-lg font-semibold disabled:opacity-50"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Party Allocations List */}
                                <div className="space-y-3">
                                    {partyAllocations.length === 0 ? (
                                        <div className="text-gray-400 text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                                            No parties added yet. Click "Add Party" to allocate time.
                                        </div>
                                    ) : (
                                        partyAllocations.map((allocation, index) => {
                                            const isExpanded = expandedPartyIndex === index;
                                            const membersAllocatedMins = getMembersAllocatedTime(index);
                                            const remainingMins = getRemainingPartyTime(index);
                                            const hasMembers = allocation.members && allocation.members.length > 0;

                                            return (
                                                <div key={index} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                                                    {/* Party Header */}
                                                    <div className="flex items-center gap-4 p-4">
                                                <span className="font-bold text-red-800 min-w-[120px]">{allocation.party}</span>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="24"
                                                        value={allocation.hours}
                                                        onChange={(e) => updatePartyTime(index, 'hours', e.target.value)}
                                                        className="w-16 px-2 py-2 border-2 border-gray-200 rounded-lg text-center"
                                                    />
                                                    <span className="text-gray-600">hrs</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="59"
                                                        value={allocation.minutes}
                                                        onChange={(e) => updatePartyTime(index, 'minutes', e.target.value)}
                                                        className="w-16 px-2 py-2 border-2 border-gray-200 rounded-lg text-center"
                                                    />
                                                    <span className="text-gray-600">mins</span>
                                                </div>
                                                        
                                                        {/* Add Member Button - Opens Popup */}
                                                        <button
                                                            onClick={() => openAddMemberModal(index)}
                                                            className="flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                                            title="Add Member"
                                                        >
                                                            <User size={16} />
                                                            <Plus size={14} />
                                                        </button>

                                                        {/* View Members Button */}
                                                        {hasMembers && (
                                                            <button
                                                                onClick={() => togglePartyExpansion(index)}
                                                                className={`flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                                                                    isExpanded ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                                }`}
                                                                title="View Members"
                                                            >
                                                                <span>{allocation.members.length}</span>
                                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                            </button>
                                                        )}
                                                        
                                                <button
                                                    onClick={() => removePartyAllocation(index)}
                                                    className="ml-auto text-red-500 hover:bg-red-100 p-2 rounded-lg"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>

                                                    {/* Expanded Member List Section */}
                                                    {isExpanded && hasMembers && (
                                                        <div className="border-t border-gray-200 bg-white p-4">
                                                            {/* Member List Header */}
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <User size={18} className="text-blue-600" />
                                                                    <span className="font-semibold text-gray-700">Allocated Members</span>
                                                                    <span className={`text-sm px-2 py-0.5 rounded ${
                                                                        remainingMins >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                        {remainingMins >= 0 ? 'Unallocated' : 'Over'}: {Math.abs(Math.floor(remainingMins / 60))}h {Math.abs(remainingMins % 60)}m
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Allocated Members List */}
                                                            <div className="space-y-2">
                                                                {allocation.members.map((member, memberIndex) => (
                                                                    <div
                                                                        key={memberIndex}
                                                                        className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-100"
                                                                    >
                                                                        <span className="font-medium text-gray-800 flex-1 text-sm">{member.name}</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="24"
                                                                                value={member.hours || 0}
                                                                                onChange={(e) => updateMemberTime(index, memberIndex, 'hours', e.target.value)}
                                                                                className="w-12 px-1 py-1 border border-blue-200 rounded text-center text-sm"
                                                                            />
                                                                            <span className="text-gray-500 text-xs">h</span>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="59"
                                                                                value={member.minutes || 0}
                                                                                onChange={(e) => updateMemberTime(index, memberIndex, 'minutes', e.target.value)}
                                                                                className="w-12 px-1 py-1 border border-blue-200 rounded text-center text-sm"
                                                                            />
                                                                            <span className="text-gray-500 text-xs">m</span>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => removeMemberFromParty(index, memberIndex)}
                                                                            className="text-red-500 hover:bg-red-100 p-1 rounded"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                    )}
                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Add Member Modal */}
                                {showAddMemberModal !== null && (
                                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                                            <div className="gradient-primary text-white p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <User size={24} />
                                                    <span className="font-bold text-lg">
                                                        Add Member - {showAddMemberModal === 'others' ? 'Others' : partyAllocations[showAddMemberModal]?.party}
                                                    </span>
                                                </div>
                                                <button onClick={closeAddMemberModal} className="hover:bg-white/20 p-2 rounded-lg">
                                                    <X size={24} />
                                                </button>
                                            </div>

                                            <div className="p-6 space-y-4">
                                                {/* Member Selection */}
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-2">Select Member *</label>
                                                    <div className="relative mb-2">
                                                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                        <input
                                                            type="text"
                                                            placeholder="Search member by name..."
                                                            value={memberSearchTerm}
                                                            onChange={(e) => setMemberSearchTerm(e.target.value)}
                                                            className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <div className="max-h-40 overflow-auto border border-gray-200 rounded-lg">
                                                        {(showAddMemberModal === 'others' ? getFilteredOthersMembers() : getFilteredMembers(partyAllocations[showAddMemberModal]?.party || '')).length === 0 ? (
                                                            <div className="text-center py-4 text-gray-500">
                                                                No members found
                                                            </div>
                                                        ) : (
                                                            (showAddMemberModal === 'others' ? getFilteredOthersMembers() : getFilteredMembers(partyAllocations[showAddMemberModal]?.party || '')).map((member) => {
                                                                const isAllocated = showAddMemberModal === 'others'
                                                                    ? isMemberInOthers(member.seat_no)
                                                                    : isMemberAllocated(showAddMemberModal, member.seat_no);
                                                                const isSelected = newMemberData.member?.seat_no === member.seat_no;
                                                                return (
                                                                    <button
                                                                        key={member.seat_no}
                                                                        onClick={() => !isAllocated && setNewMemberData({ ...newMemberData, member })}
                                                                        disabled={isAllocated}
                                                                        className={`w-full px-4 py-2 text-left flex items-center justify-between border-b border-gray-100 last:border-b-0 ${
                                                                            isAllocated 
                                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                                                : isSelected
                                                                                    ? 'bg-blue-100 text-blue-800'
                                                                                    : 'hover:bg-blue-50 text-gray-700'
                                                                        }`}
                                                                    >
                                                                        <span>{member.name}</span>
                                                                        {isAllocated && <span className="text-xs text-gray-400">Already added</span>}
                                                                        {isSelected && <Check size={16} className="text-blue-600" />}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Selected Member Display */}
                                                {newMemberData.member && (
                                                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                        <span className="font-semibold text-blue-800">Selected: {newMemberData.member.name}</span>
                                                    </div>
                                                )}

                                                {/* Time Allocation */}
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-2">Allocate Time</label>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="24"
                                                                value={newMemberData.hours}
                                                                onChange={(e) => setNewMemberData({ ...newMemberData, hours: parseInt(e.target.value) || 0 })}
                                                                className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg text-center"
                                                            />
                                                            <span className="text-gray-600">hours</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="59"
                                                                value={newMemberData.minutes}
                                                                onChange={(e) => setNewMemberData({ ...newMemberData, minutes: parseInt(e.target.value) || 0 })}
                                                                className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg text-center"
                                                            />
                                                            <span className="text-gray-600">mins</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Remaining Party Time Info */}
                                                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                                                    <span>Party Time: {partyAllocations[showAddMemberModal]?.hours}h {partyAllocations[showAddMemberModal]?.minutes}m</span>
                                                    <span className="mx-2">|</span>
                                                    <span>Already Allocated: {Math.floor(getMembersAllocatedTime(showAddMemberModal) / 60)}h {getMembersAllocatedTime(showAddMemberModal) % 60}m</span>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex gap-3 pt-2">
                                                    <button
                                                        onClick={closeAddMemberModal}
                                                        className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={confirmAddMember}
                                                        disabled={!newMemberData.member}
                                                        className="flex-1 px-4 py-3 gradient-primary text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        <Plus size={20} />
                                                        Add Member
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Others Time Allocation */}
                            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl shadow-inner">
                                <div className="p-4 flex flex-wrap items-center gap-4">
                                    <div>
                                        <span className="font-bold text-yellow-800">Others</span>
                                        <p className="text-sm text-yellow-600">Time for parties not listed above</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-yellow-200">
                                        <input
                                            type="number"
                                            min="0"
                                            max="24"
                                            value={othersTime.hours}
                                            onChange={(e) => setOthersTime({ ...othersTime, hours: parseInt(e.target.value) || 0 })}
                                            className="w-16 px-2 py-2 border-2 border-yellow-300 rounded-lg text-center"
                                        />
                                        <span className="text-gray-600">hrs</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={othersTime.minutes}
                                            onChange={(e) => setOthersTime({ ...othersTime, minutes: parseInt(e.target.value) || 0 })}
                                            className="w-16 px-2 py-2 border-2 border-yellow-300 rounded-lg text-center"
                                        />
                                        <span className="text-gray-600">mins</span>
                                    </div>
                                    <button
                                        onClick={() => openAddMemberModal('others')}
                                        className="flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                    >
                                        <User size={16} />
                                        <Plus size={14} />
                                    </button>
                                    {getOthersMembers().length > 0 && (
                                        <span className={`text-sm px-2 py-1 rounded ${getOthersRemainingMins() >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {getOthersRemainingMins() >= 0 ? 'Unallocated' : 'Over'}: {Math.abs(Math.floor(getOthersRemainingMins() / 60))}h {Math.abs(getOthersRemainingMins() % 60)}m
                                        </span>
                                    )}
                                </div>
                                {getOthersMembers().length > 0 && (
                                    <div className="border-t border-yellow-200 bg-white p-4 rounded-b-2xl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <User size={18} className="text-blue-600" />
                                            <span className="font-semibold text-gray-700">Allocated Members</span>
                                        </div>
                                        <div className="space-y-2">
                                            {getOthersMembers().map((member, memberIndex) => (
                                                <div
                                                    key={`${member.seat_no}-${memberIndex}`}
                                                    className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-100"
                                                >
                                                    <span className="font-medium text-gray-800 flex-1 text-sm">
                                                        {member.name} <span className="text-gray-500 text-xs">(Seat {member.seat_no})</span>
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="24"
                                                            value={member.hours || 0}
                                                            onChange={(e) => updateOthersMemberTime(memberIndex, 'hours', e.target.value)}
                                                            className="w-12 px-1 py-1 border border-blue-200 rounded text-center text-sm"
                                                        />
                                                        <span className="text-gray-500 text-xs">h</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="59"
                                                            value={member.minutes || 0}
                                                            onChange={(e) => updateOthersMemberTime(memberIndex, 'minutes', e.target.value)}
                                                            className="w-12 px-1 py-1 border border-blue-200 rounded text-center text-sm"
                                                        />
                                                        <span className="text-gray-500 text-xs">m</span>
                                                    </div>
                                                    <button
                                                        onClick={() => removeMemberFromOthers(memberIndex)}
                                                        className="text-red-500 hover:bg-red-100 p-1 rounded"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Total Time */}
                            {partyAllocations.length > 0 && (
                                <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-center justify-between">
                                    <span className="font-bold text-green-800">Total Allocated Time</span>
                                    <span className="text-2xl font-bold text-green-700">{getTotalTime()}</span>
                                </div>
                            )}

                            {/* Save Button */}
                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={() => { setActiveTab(null); resetForm(); }}
                                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveBill}
                                    disabled={loading}
                                    className="px-6 py-3 gradient-primary text-white rounded-xl font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                                >
                                    <Save size={20} />
                                    {loading ? 'Saving...' : (editingBill ? 'Update Bill' : 'Save Bill')}
                                </button>
                            </div>
                        </div>
                    </div>
                </main>

                <Footer />
            </div>
        );
    }

    if (activeTab === 'past') {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
                <Header showBack />

                <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
                    <div className="flex items-center gap-4 mb-6 animate-fade-in">
                        <button
                            onClick={() => setActiveTab(null)}
                            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                        >
                            ← Back
                        </button>
                        <div className="inline-flex items-center gap-3">
                            <History size={32} className="text-red-800" />
                            <h2 className="text-2xl md:text-3xl font-bold text-red-800 uppercase">Past Session Bills</h2>
                        </div>
                    </div>

                    {message.text && (
                        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                            {message.text}
                            <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto">
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="gradient-primary text-white p-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <History size={24} />
                                <span className="font-bold text-lg">Archived Bills</span>
                            </div>
                            <p className="text-sm text-white/80">Printable logs for completed bills</p>
                        </div>

                        {loadingPast ? (
                            <div className="py-12 flex items-center justify-center">
                                <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                            </div>
                        ) : pastBills.length === 0 ? (
                            <div className="py-12 text-center text-gray-500">
                                No bills have been archived yet.
                            </div>
                        ) : (
                            <div>
                                {pastBills.map((bill, index) => {
                                    const isExpanded = expandedPastBillId === bill.id;
                                    const logs = pastBillLogs[bill.id] || [];
                                    return (
                                        <div key={bill.id} className={`p-6 border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <p className="text-xs uppercase text-gray-400">Bill #{index + 1}</p>
                                                    <h3 className="text-2xl font-bold text-red-800">{bill.bill_name}</h3>
                                                    <p className="text-sm text-gray-600">Last Updated: {formatDateTimeReadable(bill.updated_at)}</p>
                                                    <p className="text-sm text-gray-600">Total Allotted Time: {getBillTotalTimeDisplay(bill)}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                    <button
                                                        onClick={() => togglePastBillDetails(bill)}
                                                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-200"
                                                    >
                                                        {isExpanded ? 'Hide Details' : 'View Details'}
                                                    </button>
                                                    <button
                                                        onClick={() => handlePrintPastBill(bill)}
                                                        disabled={!logs || logs.length === 0}
                                                        className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-semibold flex items-center gap-2 hover:bg-green-200 disabled:opacity-50"
                                                    >
                                                        <Printer size={18} />
                                                        Print PDF
                                                    </button>
                                                </div>
                                                {isExpanded && (
                                                    <div className="mt-4">
                                                        {loadingPastLogs[bill.id] ? (
                                                            <div className="py-6 flex items-center justify-center">
                                                                <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
                                                            </div>
                                                        ) : logs.length === 0 ? (
                                                            <div className="py-6 text-center text-gray-500">
                                                                No speaker logs recorded for this bill.
                                                            </div>
                                                        ) : (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-sm">
                                                                    <thead className="bg-gray-100">
                                                                        <tr>
                                                                            <th className="px-4 py-2 text-left font-semibold text-gray-600">#</th>
                                                                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Speaker</th>
                                                                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Party</th>
                                                                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Duration</th>
                                                                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Start Time</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {logs.map((log, idx) => (
                                                                            <tr key={`${bill.id}-log-${idx}`} className="border-b border-gray-100">
                                                                                <td className="px-4 py-2 font-semibold text-gray-500">{idx + 1}</td>
                                                                                <td className="px-4 py-2 font-semibold text-gray-800">{log.member_name || '-'}</td>
                                                                                <td className="px-4 py-2 text-gray-600">{log.party || '-'}</td>
                                                                                <td className="px-4 py-2 text-gray-800">{formatDurationSeconds(log.duration_seconds || 0)}</td>
                                                                                <td className="px-4 py-2 text-gray-600">{formatDateTimeReadable(log.start_time)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </main>

                <Footer />
            </div>
        );
    }

    // Current Session Bills Tab
    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
            <Header showBack />
            <DetailsModal />

            <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
                {/* Page Title with Back */}
                <div className="flex items-center gap-4 mb-6 animate-fade-in">
                    <button
                        onClick={() => setActiveTab(null)}
                        className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                    >
                        ← Back
                    </button>
                    <div className="inline-flex items-center gap-3">
                        <FileText size={32} className="text-red-800" />
                        <h2 className="text-2xl md:text-3xl font-bold text-red-800 uppercase">Current Session Bills</h2>
                    </div>
                </div>

                {/* Message */}
                {message.text && (
                    <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                        {message.text}
                        <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {/* Bills List */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="gradient-primary text-white p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText size={24} />
                            <span className="font-bold text-lg">Session Bills</span>
                        </div>
                        <button
                            onClick={handlePrintSessionBills}
                            className="px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg font-semibold flex items-center gap-2 transition-colors"
                        >
                            <Printer size={18} />
                            Print List
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <div className="max-h-[65vh] overflow-y-auto scroll-thin">
                        <table className="w-full">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-700">#</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-700">Bill Name</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-700">Parties</th>
                                    <th className="px-4 py-3 text-center font-bold text-gray-700">Total Time</th>
                                    <th className="px-4 py-3 text-center font-bold text-gray-700">Details</th>
                                    <th className="px-4 py-3 text-center font-bold text-gray-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8">
                                            <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto" />
                                        </td>
                                    </tr>
                                ) : bills.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-gray-500">
                                            No bills added yet.
                                        </td>
                                    </tr>
                                ) : (
                                    bills.map((bill, index) => {
                                        const allocations = bill.party_allocations || [];
                                        const totalTime = getBillTotalTimeDisplay(bill);

                                        return (
                                            <tr
                                                key={bill.id}
                                                className={`border-b border-gray-100 hover:bg-red-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                            >
                                                <td className="px-4 py-3 font-bold text-gray-500">{index + 1}</td>
                                                <td className="px-4 py-3 font-bold text-red-800">{bill.bill_name}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {allocations.slice(0, 3).map((a, i) => (
                                                            <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                                                                {a.party}
                                                            </span>
                                                        ))}
                                                        {allocations.length > 3 && (
                                                            <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-semibold">
                                                                +{allocations.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-green-700">{totalTime}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => handleViewDetails(bill)}
                                                        className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg"
                                                        title="View Details"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEditBill(bill)}
                                                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleMoveBillToPast(bill)}
                                                            className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg disabled:opacity-50"
                                                            title="Move to Past Session Bills"
                                                            disabled={movingBillId === bill.id}
                                                        >
                                                            {movingBillId === bill.id ? (
                                                                <div className="w-4 h-4 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                                                            ) : (
                                                                <Archive size={18} />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteBill(bill.id)}
                                                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
