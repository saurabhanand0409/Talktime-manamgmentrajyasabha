import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useBroadcast } from '../context/BroadcastContext';
import { useSocket } from '../context/SocketContext';
import { Heart, Cake, Plus, Trash2, Edit2, Play, Square, ChevronLeft, ChevronRight, Image } from 'lucide-react';

const STORAGE_KEY_OBITUARY = 'parliament_obituary_entries';
const STORAGE_KEY_BIRTHDAY = 'parliament_birthday_entries';

export default function Message() {
    const navigate = useNavigate();
    const { isBroadcasting, broadcastType, startBroadcastType, sendToBroadcast, isBroadcastWindowOpen, pushMessageState, setMessageBroadcastActive } = useBroadcast();
    const { memberData, setSelectedSeat, selectedSeat } = useSocket();
    
    const [activeTab, setActiveTab] = useState('obituary'); // 'obituary' or 'birthday'
    const [obituaryEntries, setObituaryEntries] = useState([]);
    const [birthdayEntries, setBirthdayEntries] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isMessageBroadcasting, setIsMessageBroadcasting] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const rotationIntervalRef = useRef(null);
    
    // Obituary form state
    const [obituaryForm, setObituaryForm] = useState({
        nameHindi: '',
        nameEnglish: '',
        photo: null,
        birthDate: '',
        deathDate: '',
        terms: [{ start: '', end: '' }]
    });
    
    // Birthday form state - simplified to just seat number and birth date
    const [birthdayForm, setBirthdayForm] = useState({
        seatNo: '',
        birthDate: ''
    });
    const [birthdayMemberData, setBirthdayMemberData] = useState(null);

    // Load entries from localStorage
    useEffect(() => {
        try {
            const savedObituary = localStorage.getItem(STORAGE_KEY_OBITUARY);
            const savedBirthday = localStorage.getItem(STORAGE_KEY_BIRTHDAY);
            if (savedObituary) setObituaryEntries(JSON.parse(savedObituary));
            if (savedBirthday) setBirthdayEntries(JSON.parse(savedBirthday));
        } catch (e) {
            console.error('Error loading message entries:', e);
        }
    }, []);

    // Save entries to localStorage
    const saveObituaryEntries = (entries) => {
        setObituaryEntries(entries);
        localStorage.setItem(STORAGE_KEY_OBITUARY, JSON.stringify(entries));
    };

    const saveBirthdayEntries = (entries) => {
        setBirthdayEntries(entries);
        localStorage.setItem(STORAGE_KEY_BIRTHDAY, JSON.stringify(entries));
    };

    // Handle photo upload
    const handlePhotoUpload = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                if (type === 'obituary') {
                    setObituaryForm(prev => ({ ...prev, photo: base64 }));
                } else {
                    setBirthdayForm(prev => ({ ...prev, photo: base64 }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    // Add term to obituary
    const addTerm = () => {
        setObituaryForm(prev => ({
            ...prev,
            terms: [...prev.terms, { start: '', end: '' }]
        }));
    };

    // Remove term from obituary
    const removeTerm = (idx) => {
        if (obituaryForm.terms.length > 1) {
            setObituaryForm(prev => ({
                ...prev,
                terms: prev.terms.filter((_, i) => i !== idx)
            }));
        }
    };

    // Update term
    const updateTerm = (idx, field, value) => {
        setObituaryForm(prev => ({
            ...prev,
            terms: prev.terms.map((t, i) => i === idx ? { ...t, [field]: value } : t)
        }));
    };

    // Format date for display
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = date.getDate();
        const month = date.toLocaleString('en-US', { month: 'long' }).toUpperCase();
        const year = date.getFullYear();
        const suffix = day === 1 || day === 21 || day === 31 ? 'ST' : 
                      day === 2 || day === 22 ? 'ND' : 
                      day === 3 || day === 23 ? 'RD' : 'TH';
        return `${day}${suffix} ${month} ${year}`;
    };

    // Format date for term display (DD/MM/YYYY)
    const formatTermDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Add obituary entry
    const addObituaryEntry = () => {
        if (!obituaryForm.nameEnglish.trim()) return;
        
        const newEntry = {
            id: Date.now(),
            ...obituaryForm,
            birthDateDisplay: formatDateDisplay(obituaryForm.birthDate),
            deathDateDisplay: formatDateDisplay(obituaryForm.deathDate),
            termsDisplay: obituaryForm.terms.map(t => ({
                start: formatTermDate(t.start),
                end: formatTermDate(t.end)
            })).filter(t => t.start && t.end)
        };
        
        if (editingEntry) {
            const updated = obituaryEntries.map(e => e.id === editingEntry.id ? { ...newEntry, id: editingEntry.id } : e);
            saveObituaryEntries(updated);
            setEditingEntry(null);
        } else {
            saveObituaryEntries([...obituaryEntries, newEntry]);
        }
        
        // Reset form
        setObituaryForm({
            nameHindi: '',
            nameEnglish: '',
            photo: null,
            birthDate: '',
            deathDate: '',
            terms: [{ start: '', end: '' }]
        });
    };

    // Fetch member data when seat number changes for birthday
    const fetchBirthdayMember = async (seatNo) => {
        if (!seatNo) {
            setBirthdayMemberData(null);
            return;
        }
        try {
            const response = await fetch(`http://localhost:5000/api/member/${seatNo}`);
            const data = await response.json();
            if (data.success && data.data) {
                setBirthdayMemberData(data.data);
            } else {
                setBirthdayMemberData(null);
            }
        } catch (error) {
            console.error('Error fetching member:', error);
            setBirthdayMemberData(null);
        }
    };

    // Handle seat number change for birthday
    const handleBirthdaySeatChange = (seatNo) => {
        setBirthdayForm(prev => ({ ...prev, seatNo }));
        fetchBirthdayMember(seatNo);
    };

    // Add birthday entry
    const addBirthdayEntry = () => {
        if (!birthdayMemberData || !birthdayForm.birthDate) return;
        
        const newEntry = {
            id: Date.now(),
            seatNo: birthdayForm.seatNo,
            nameHindi: birthdayMemberData.name_hindi || '',
            nameEnglish: birthdayMemberData.name || '',
            photo: birthdayMemberData.picture || null,
            birthDate: birthdayForm.birthDate,
            birthDateDisplay: formatDateDisplay(birthdayForm.birthDate),
            birthDay: birthdayForm.birthDate ? new Date(birthdayForm.birthDate).getDate() : '',
            birthMonth: birthdayForm.birthDate ? new Date(birthdayForm.birthDate).toLocaleString('en-US', { month: 'long' }).toUpperCase() : ''
        };
        
        if (editingEntry) {
            const updated = birthdayEntries.map(e => e.id === editingEntry.id ? { ...newEntry, id: editingEntry.id } : e);
            saveBirthdayEntries(updated);
            setEditingEntry(null);
        } else {
            saveBirthdayEntries([...birthdayEntries, newEntry]);
        }
        
        // Reset form
        setBirthdayForm({ seatNo: '', birthDate: '' });
        setBirthdayMemberData(null);
    };

    // Edit entry
    const editEntry = (entry, type) => {
        setEditingEntry(entry);
        if (type === 'obituary') {
            setObituaryForm({
                nameHindi: entry.nameHindi || '',
                nameEnglish: entry.nameEnglish || '',
                photo: entry.photo || null,
                birthDate: entry.birthDate || '',
                deathDate: entry.deathDate || '',
                terms: entry.terms?.length ? entry.terms : [{ start: '', end: '' }]
            });
        } else {
            setBirthdayForm({
                seatNo: entry.seatNo || '',
                birthDate: entry.birthDate || ''
            });
            if (entry.seatNo) {
                fetchBirthdayMember(entry.seatNo);
            }
        }
    };

    // Delete entry
    const deleteEntry = (id, type) => {
        if (type === 'obituary') {
            saveObituaryEntries(obituaryEntries.filter(e => e.id !== id));
        } else {
            saveBirthdayEntries(birthdayEntries.filter(e => e.id !== id));
        }
    };

    // Start broadcasting
    const startMessageBroadcast = () => {
        const entries = activeTab === 'obituary' ? obituaryEntries : birthdayEntries;
        if (entries.length === 0) return;
        if (!isBroadcastWindowOpen()) {
            alert('Please open the broadcast window first from the Dashboard.');
            return;
        }
        
        setIsMessageBroadcasting(true);
        setCurrentIndex(0);
        
        const messageType = activeTab === 'obituary' ? 'Obituary' : 'Birthday';
        
        // Set broadcast state in context so Dashboard shows it as active
        setMessageBroadcastActive(messageType, true);
        
        // Send initial broadcast to local window - show selected entry (no auto-rotate)
        const entryToShow = entries[currentIndex] || entries[0];
        sendToBroadcast({
            type: 'START_BROADCAST',
            broadcastType: messageType,
            messageData: entryToShow,
            messageEntries: entries,
            currentIndex: currentIndex
        });
        
        // Push to remote API for LAN broadcast
        pushMessageState(messageType, entryToShow, true);
        
        // No auto-rotation - user can manually navigate with prev/next buttons
    };

    // Stop broadcasting
    const stopMessageBroadcast = () => {
        setIsMessageBroadcasting(false);
        if (rotationIntervalRef.current) {
            clearInterval(rotationIntervalRef.current);
            rotationIntervalRef.current = null;
        }
        
        // Clear broadcast state in context
        setMessageBroadcastActive(null, false);
        
        sendToBroadcast({
            type: 'BROADCAST_END'
        });
        
        // Clear remote state for LAN broadcast
        pushMessageState('Idle', null, false);
    };

    // Navigate entries manually
    const navigateEntry = (direction) => {
        const entries = activeTab === 'obituary' ? obituaryEntries : birthdayEntries;
        if (entries.length === 0) return;
        const messageType = activeTab === 'obituary' ? 'Obituary' : 'Birthday';
        
        setCurrentIndex(prev => {
            const next = direction === 'next' 
                ? (prev + 1) % entries.length 
                : (prev - 1 + entries.length) % entries.length;
            
            if (isMessageBroadcasting) {
                // Send to local broadcast window
                sendToBroadcast({
                    type: 'DATA_UPDATE',
                    messageData: entries[next],
                    currentIndex: next
                });
                // Push to remote API for LAN broadcast
                pushMessageState(messageType, entries[next], true);
            }
            return next;
        });
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rotationIntervalRef.current) {
                clearInterval(rotationIntervalRef.current);
            }
        };
    }, []);

    // Check if another broadcast type is active
    const isOtherBroadcastActive = isBroadcasting && broadcastType && !['Obituary', 'Birthday'].includes(broadcastType);

    const currentEntries = activeTab === 'obituary' ? obituaryEntries : birthdayEntries;

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
            <Header showBack />
            
            <main className="flex-1 max-w-7xl mx-auto px-4 py-4 w-full">
                <h1 className="text-2xl font-bold text-red-800 mb-4">Message Broadcast</h1>
                
                {isOtherBroadcastActive && (
                    <div className="mb-4 p-3 bg-amber-100 border border-amber-400 rounded-lg text-amber-800">
                        ⚠️ Another broadcast ({broadcastType}) is currently active. End it before starting a message broadcast.
                    </div>
                )}
                
                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => { setActiveTab('obituary'); setCurrentIndex(0); }}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${
                            activeTab === 'obituary' 
                                ? 'bg-red-800 text-white shadow-lg' 
                                : 'bg-white text-red-800 border-2 border-red-800 hover:bg-red-50'
                        }`}
                        disabled={isMessageBroadcasting}
                    >
                        <Heart size={20} />
                        Obituary
                        {obituaryEntries.length > 0 && (
                            <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-sm">
                                {obituaryEntries.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => { setActiveTab('birthday'); setCurrentIndex(0); }}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${
                            activeTab === 'birthday' 
                                ? 'bg-red-800 text-white shadow-lg' 
                                : 'bg-white text-red-800 border-2 border-red-800 hover:bg-red-50'
                        }`}
                        disabled={isMessageBroadcasting}
                    >
                        <Cake size={20} />
                        Birthday
                        {birthdayEntries.length > 0 && (
                            <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-sm">
                                {birthdayEntries.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Entry Form */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-lg font-bold text-red-800 mb-4">
                            {editingEntry ? 'Edit Entry' : 'Add New Entry'}
                        </h2>
                        
                        {activeTab === 'obituary' ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Name (Hindi)</label>
                                        <input
                                            type="text"
                                            value={obituaryForm.nameHindi}
                                            onChange={(e) => setObituaryForm(prev => ({ ...prev, nameHindi: e.target.value }))}
                                            placeholder="श्रीमती चन्द्रकला पांडे"
                                            className="w-full border rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Name (English) *</label>
                                        <input
                                            type="text"
                                            value={obituaryForm.nameEnglish}
                                            onChange={(e) => setObituaryForm(prev => ({ ...prev, nameEnglish: e.target.value.toUpperCase() }))}
                                            placeholder="SHRIMATI CHANDRA KALA PANDEY"
                                            className="w-full border rounded-lg px-3 py-2"
                                        />
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date of Birth</label>
                                        <input
                                            type="date"
                                            value={obituaryForm.birthDate}
                                            onChange={(e) => setObituaryForm(prev => ({ ...prev, birthDate: e.target.value }))}
                                            className="w-full border rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date of Death</label>
                                        <input
                                            type="date"
                                            value={obituaryForm.deathDate}
                                            onChange={(e) => setObituaryForm(prev => ({ ...prev, deathDate: e.target.value }))}
                                            className="w-full border rounded-lg px-3 py-2"
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Photo</label>
                                    <div className="flex items-center gap-4">
                                        {obituaryForm.photo ? (
                                            <img 
                                                src={`data:image/jpeg;base64,${obituaryForm.photo}`} 
                                                alt="Preview" 
                                                className="w-20 h-24 object-cover rounded border-2 border-amber-500"
                                            />
                                        ) : (
                                            <div className="w-20 h-24 bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                                                <Image size={24} className="text-gray-400" />
                                            </div>
                                        )}
                                        <label className="cursor-pointer px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-gray-700">
                                            Upload Photo
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={(e) => handlePhotoUpload(e, 'obituary')}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                </div>
                                
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-gray-700">Terms (कार्यकाल)</label>
                                        <button 
                                            onClick={addTerm}
                                            className="text-sm px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                        >
                                            + Add Term
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {obituaryForm.terms.map((term, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    value={term.start}
                                                    onChange={(e) => updateTerm(idx, 'start', e.target.value)}
                                                    className="flex-1 border rounded-lg px-2 py-1 text-sm"
                                                    placeholder="Start"
                                                />
                                                <span className="text-gray-500">to</span>
                                                <input
                                                    type="date"
                                                    value={term.end}
                                                    onChange={(e) => updateTerm(idx, 'end', e.target.value)}
                                                    className="flex-1 border rounded-lg px-2 py-1 text-sm"
                                                    placeholder="End"
                                                />
                                                {obituaryForm.terms.length > 1 && (
                                                    <button
                                                        onClick={() => removeTerm(idx)}
                                                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <button
                                    onClick={addObituaryEntry}
                                    disabled={!obituaryForm.nameEnglish.trim()}
                                    className="w-full py-3 bg-red-700 text-white rounded-lg font-bold hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {editingEntry ? 'Update Entry' : 'Add Entry'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Seat No *</label>
                                        <input
                                            type="text"
                                            value={birthdayForm.seatNo}
                                            onChange={(e) => handleBirthdaySeatChange(e.target.value)}
                                            placeholder="1-250"
                                            className="w-full border rounded-lg px-3 py-2 text-lg font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Date of Birth *</label>
                                        <input
                                            type="date"
                                            value={birthdayForm.birthDate}
                                            onChange={(e) => setBirthdayForm(prev => ({ ...prev, birthDate: e.target.value }))}
                                            className="w-full border rounded-lg px-3 py-2 text-lg font-bold"
                                        />
                                    </div>
                                </div>
                                
                                {/* Member Preview */}
                                {birthdayMemberData && (
                                    <div className="p-4 bg-gray-50 rounded-lg border">
                                        <div className="flex items-center gap-4">
                                            {birthdayMemberData.picture ? (
                                                <img 
                                                    src={`data:image/jpeg;base64,${birthdayMemberData.picture}`}
                                                    alt={birthdayMemberData.name}
                                                    className="w-16 h-20 object-cover rounded border-2 border-red-500"
                                                />
                                            ) : (
                                                <div className="w-16 h-20 bg-gray-200 rounded border-2 border-red-500 flex items-center justify-center">
                                                    <span className="text-gray-400 text-2xl">?</span>
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-lg text-gray-800">{birthdayMemberData.name}</p>
                                                <p className="text-gray-600">{birthdayMemberData.name_hindi}</p>
                                                <p className="text-sm text-gray-500">{birthdayMemberData.party} • {birthdayMemberData.state}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {birthdayForm.seatNo && !birthdayMemberData && (
                                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-700">
                                        No member found for seat {birthdayForm.seatNo}
                                    </div>
                                )}
                                
                                <button
                                    onClick={addBirthdayEntry}
                                    disabled={!birthdayMemberData || !birthdayForm.birthDate}
                                    className="w-full py-3 bg-red-700 text-white rounded-lg font-bold hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {editingEntry ? 'Update Entry' : 'Add Entry'}
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Preview & Entries List */}
                    <div className="space-y-4">
                        {/* Preview */}
                        <div className="bg-white rounded-xl shadow-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-bold text-red-800">Preview</h2>
                                <div className="flex items-center gap-2">
                                    {currentEntries.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => navigateEntry('prev')}
                                                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <span className="text-sm text-gray-600">
                                                {currentIndex + 1} / {currentEntries.length}
                                            </span>
                                            <button
                                                onClick={() => navigateEntry('next')}
                                                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                            >
                                                <ChevronRight size={20} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            {currentEntries.length > 0 ? (
                                activeTab === 'obituary' ? (
                                    <ObituaryPreview entry={currentEntries[currentIndex]} />
                                ) : (
                                    <BirthdayPreview entry={currentEntries[currentIndex]} />
                                )
                            ) : (
                                <div className="h-48 flex items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
                                    No entries yet. Add an entry to see preview.
                                </div>
                            )}
                        </div>
                        
                        {/* Broadcast Controls */}
                        <div className="bg-white rounded-xl shadow-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800">Broadcast Control</h3>
                                    <p className="text-sm text-gray-500">
                                        {currentEntries.length} {activeTab} {currentEntries.length === 1 ? 'entry' : 'entries'}
                                        {currentEntries.length > 1 && ' • Use Previous/Next to navigate'}
                                    </p>
                                </div>
                                {isMessageBroadcasting ? (
                                    <button
                                        onClick={stopMessageBroadcast}
                                        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                                    >
                                        <Square size={20} />
                                        Stop Broadcast
                                    </button>
                                ) : (
                                    <button
                                        onClick={startMessageBroadcast}
                                        disabled={currentEntries.length === 0 || isOtherBroadcastActive}
                                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Play size={20} />
                                        Start Broadcast
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {/* Entries List */}
                        <div className="bg-white rounded-xl shadow-lg p-4">
                            <h2 className="text-lg font-bold text-red-800 mb-3">
                                {activeTab === 'obituary' ? 'Obituary' : 'Birthday'} Entries
                            </h2>
                            
                            {currentEntries.length === 0 ? (
                                <p className="text-gray-500 text-center py-4">No entries yet</p>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-auto">
                                    {currentEntries.map((entry, idx) => (
                                        <div 
                                            key={entry.id} 
                                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                                                idx === currentIndex ? 'border-red-500 bg-red-50' : 'border-gray-200'
                                            }`}
                                        >
                                            {entry.photo ? (
                                                <img 
                                                    src={`data:image/jpeg;base64,${entry.photo}`}
                                                    alt={entry.nameEnglish}
                                                    className="w-12 h-14 object-cover rounded"
                                                />
                                            ) : (
                                                <div className="w-12 h-14 bg-gray-200 rounded flex items-center justify-center">
                                                    <Image size={16} className="text-gray-400" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-800 truncate">{entry.nameEnglish}</p>
                                                <p className="text-sm text-gray-500 truncate">{entry.nameHindi}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => editEntry(entry, activeTab)}
                                                    className="p-2 text-amber-600 hover:bg-amber-50 rounded"
                                                    disabled={isMessageBroadcasting}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => deleteEntry(entry.id, activeTab)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                                                    disabled={isMessageBroadcasting}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
            
            <Footer />
        </div>
    );
}

// Obituary Preview Component - Light pink background with dark red text, centered layout
function ObituaryPreview({ entry }) {
    if (!entry) return null;
    
    return (
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#ffe8e8' }}>
            {/* Red Border */}
            <div className="border-4 border-[#a00000] rounded-lg">
                {/* Header */}
                <div className="bg-gradient-to-r from-[#a00000] to-[#8b0000] text-white text-center py-3 px-4">
                    <p className="text-xl font-extrabold">दिवंगत के प्रति श्रद्धांजलि/OBITUARY REFERENCE</p>
                </div>
                
                {/* Content - Centered */}
                <div className="p-6 flex items-center justify-center gap-8" style={{ backgroundColor: '#ffe8e8' }}>
                    {/* Photo with golden frame */}
                    <div className="flex-shrink-0">
                        <div 
                            className="p-2 rounded"
                            style={{ 
                                background: 'linear-gradient(135deg, #d4af37, #f4d03f, #d4af37)',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                        >
                            {entry.photo ? (
                                <img 
                                    src={`data:image/jpeg;base64,${entry.photo}`}
                                    alt={entry.nameEnglish}
                                    className="w-32 h-40 object-cover"
                                    style={{ backgroundColor: '#8b0000' }}
                                />
                            ) : (
                                <div 
                                    className="w-32 h-40 flex items-center justify-center text-white text-4xl font-bold"
                                    style={{ backgroundColor: '#8b0000' }}
                                >
                                    ?
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Details - Centered vertically */}
                    <div className="flex flex-col justify-center">
                        <p className="text-3xl font-extrabold text-[#a00000] mb-1">{entry.nameHindi || '-'}</p>
                        <p className="text-2xl font-extrabold text-[#a00000] mb-2">{entry.nameEnglish}</p>
                        <p className="text-lg font-bold text-[#a00000] mb-4">
                            ({entry.birthDateDisplay || '-'} – {entry.deathDateDisplay || '-'})
                        </p>
                        
                        {entry.termsDisplay && entry.termsDisplay.length > 0 && (
                            <div className="bg-gray-300/80 rounded-lg p-3 text-center">
                                <p className="font-extrabold text-[#a00000] text-xl mb-2">कार्यकाल / TERM</p>
                                {entry.termsDisplay.map((term, idx) => (
                                    <p key={idx} className="text-[#a00000] font-bold text-lg">
                                        {term.start} - {term.end}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Birthday Preview Component - Light pink background with dark red text
function BirthdayPreview({ entry }) {
    if (!entry) return null;
    
    const day = entry.birthDay || '';
    const month = entry.birthMonth || '';
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : 
                  day === 2 || day === 22 ? 'nd' : 
                  day === 3 || day === 23 ? 'rd' : 'th';
    
    return (
        <div className="rounded-lg overflow-hidden border-4 border-[#a00000]" style={{ backgroundColor: '#ffe8e8' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#a00000] to-[#8b0000] text-white text-center py-3 px-4">
                <p className="text-lg font-bold">जन्मदिन की शुभकामनाएँ</p>
                <p className="text-xl font-extrabold">BIRTHDAY GREETINGS</p>
            </div>
            
            <div className="p-6 flex items-center gap-6" style={{ backgroundColor: '#ffe8e8' }}>
                {/* Photo */}
                <div className="flex-shrink-0">
                    {entry.photo ? (
                        <img 
                            src={`data:image/jpeg;base64,${entry.photo}`}
                            alt={entry.nameEnglish}
                            className="w-28 h-36 object-cover rounded border-4 border-[#a00000]"
                        />
                    ) : (
                        <div className="w-28 h-36 bg-[#ffe8e8] rounded border-4 border-[#a00000] flex items-center justify-center text-[#a00000] text-4xl font-bold">
                            ?
                        </div>
                    )}
                </div>
                
                {/* Details */}
                <div className="flex-1 text-center">
                    <p className="text-2xl font-extrabold text-[#a00000] mb-4">{day}{suffix} {month}</p>
                    <p className="text-2xl font-bold text-[#a00000]">{entry.nameHindi || '-'}</p>
                    <p className="text-2xl font-extrabold text-[#a00000]">{entry.nameEnglish}</p>
                </div>
            </div>
        </div>
    );
}
