import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useChairperson } from '../context/ChairpersonContext';
import { Database, Upload, Save, Trash2, Edit, Search, Plus, X, Check, Users, UserCog, ChevronDown, Crown } from 'lucide-react';
import { formatISTDateForInput } from '../utils/timezone';

export default function DatabaseEntry() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(null); // null = show options, 'mp' = MP details, 'chairperson' = Chairperson details
    const [members, setMembers] = useState([]);
    const [chairpersonsList, setChairpersonsList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showChairForm, setShowChairForm] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [editingChair, setEditingChair] = useState(null);
    const [formData, setFormData] = useState({
        seat_no: '',
        name: '',
        party: '',
        state: '',
        tenure_start: formatISTDateForInput(),
    });
    const [chairFormData, setChairFormData] = useState({
        name: '',
        position: '',
    });
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const fileInputRef = useRef(null);
    const chairFileInputRef = useRef(null);
    
    // For member search dropdown in chairperson form
    const [memberSearchTerm, setMemberSearchTerm] = useState('');
    const [showMemberDropdown, setShowMemberDropdown] = useState(false);
    const [allMembers, setAllMembers] = useState([]);
    const memberDropdownRef = useRef(null);
    
    // For chairperson photo
    const [chairSelectedImage, setChairSelectedImage] = useState(null);
    const [chairImagePreview, setChairImagePreview] = useState(null);

    // Refresh chairpersons context after changes
    const { refreshChairpersons } = useChairperson();

    useEffect(() => {
        if (activeTab === 'mp') {
            fetchMembers();
        } else if (activeTab === 'chairperson') {
            fetchChairpersons();
            fetchAllMembers(); // Fetch members for dropdown
        }
        if (activeTab === 'activitylog') {
            navigate('/log-list');
        }
    }, [activeTab, navigate]);

    // Close member dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (memberDropdownRef.current && !memberDropdownRef.current.contains(event.target)) {
                setShowMemberDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchAllMembers = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/members');
            const data = await response.json();
            if (data.success) {
                setAllMembers(data.data.filter(m => m.name && m.name !== 'VACANT'));
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        }
    };

    // Filter members based on search term
    const filteredMemberSuggestions = allMembers.filter(member => {
        if (!memberSearchTerm) return true;
        return member.name.toLowerCase().includes(memberSearchTerm.toLowerCase());
    });

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/members');
            const data = await response.json();
            if (data.success) {
                setMembers(data.data);
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchChairpersons = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/chairpersons');
            const data = await response.json();
            if (data.success) {
                setChairpersonsList(data.data);
            }
        } catch (error) {
            console.error('Error fetching chairpersons:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleChairInputChange = (e) => {
        const { name, value } = e.target;
        setChairFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const resetForm = () => {
        setFormData({
            seat_no: '',
            name: '',
            party: '',
            state: '',
            tenure_start: formatISTDateForInput(),
        });
        setSelectedImage(null);
        setImagePreview(null);
        setEditingMember(null);
        setShowForm(false);
    };

    const resetChairForm = () => {
        setChairFormData({ name: '', position: 'In The Chair' });
        setEditingChair(null);
        setShowChairForm(false);
        setMemberSearchTerm('');
        setShowMemberDropdown(false);
        setChairSelectedImage(null);
        setChairImagePreview(null);
    };
    
    const handleChairImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setChairSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setChairImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleMemberSelect = (member) => {
        setChairFormData(prev => ({ ...prev, name: member.name }));
        setMemberSearchTerm(member.name);
        setShowMemberDropdown(false);
    };

    const handleMemberSearchChange = (e) => {
        const value = e.target.value;
        setMemberSearchTerm(value);
        setChairFormData(prev => ({ ...prev, name: value }));
        setShowMemberDropdown(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('seat_no', formData.seat_no);
            formDataToSend.append('name', formData.name);
            formDataToSend.append('party', formData.party);
            formDataToSend.append('state', formData.state);
            formDataToSend.append('tenure_start', formData.tenure_start);

            if (selectedImage) {
                formDataToSend.append('picture', selectedImage);
            }

            const url = editingMember
                ? `http://localhost:5000/api/member/${formData.seat_no}`
                : 'http://localhost:5000/api/member';

            const response = await fetch(url, {
                method: editingMember ? 'PUT' : 'POST',
                body: formDataToSend,
            });

            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: editingMember ? 'Member updated successfully!' : 'Member added successfully!' });
                fetchMembers();
                resetForm();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to save member' });
            }
        } catch (error) {
            console.error('Error saving member:', error);
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        } finally {
            setSaving(false);
        }
    };

    const handleChairSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            const url = editingChair
                ? `http://localhost:5000/api/chairperson/${editingChair.id}`
                : 'http://localhost:5000/api/chairperson';

            // Use FormData if there's an image, otherwise use JSON
            let response;
            if (chairSelectedImage) {
                const formDataToSend = new FormData();
                formDataToSend.append('name', chairFormData.name);
                formDataToSend.append('position', chairFormData.position);
                formDataToSend.append('picture', chairSelectedImage);
                
                response = await fetch(url, {
                    method: editingChair ? 'PUT' : 'POST',
                    body: formDataToSend,
                });
            } else {
                response = await fetch(url, {
                method: editingChair ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chairFormData),
            });
            }

            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: editingChair ? 'Updated!' : 'Member in the Chair added!' });
                fetchChairpersons();
                refreshChairpersons(); // Update header dropdown
                resetChairForm();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to save' });
            }
        } catch (error) {
            console.error('Error saving chairperson:', error);
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (member) => {
        setFormData({
            seat_no: member.seat_no,
            name: member.name,
            party: member.party,
            state: member.state,
            tenure_start: member.tenure_start || formatISTDateForInput(),
        });
        setEditingMember(member);
        setImagePreview(null);
        setSelectedImage(null);
        setShowForm(true);
    };

    const handleEditChair = (chair) => {
        setChairFormData({ name: chair.name, position: chair.position });
        setMemberSearchTerm(chair.name);
        setEditingChair(chair);
        setShowChairForm(true);
        // Load existing photo preview if available
        if (chair.picture) {
            setChairImagePreview(`data:image/jpeg;base64,${chair.picture}`);
        } else {
            setChairImagePreview(null);
        }
        setChairSelectedImage(null);
    };

    const handleDelete = async (seatNo) => {
        if (!confirm('Are you sure you want to delete this member?')) return;

        try {
            const response = await fetch(`http://localhost:5000/api/member/${seatNo}`, {
                method: 'DELETE',
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'Member deleted successfully!' });
                fetchMembers();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to delete member' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        }
    };

    const handleDeleteChair = async (id) => {
        if (!confirm('Are you sure you want to delete this chairperson?')) return;

        try {
            const response = await fetch(`http://localhost:5000/api/chairperson/${id}`, {
                method: 'DELETE',
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'Member in the Chair deleted!' });
                fetchChairpersons();
                refreshChairpersons(); // Update header dropdown
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to delete' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        }
    };

    const filteredMembers = members.filter(member =>
        member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.party?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.seat_no?.toString().includes(searchTerm)
    );

    // List of Indian states for dropdown (including - option)
    const states = [
        '-',
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
        'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
        'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
        'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
        'Uttarakhand', 'West Bengal', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
        'Nominated'
    ];

    // List of major parties (including - and Vacant options)
    const parties = [
        '-', 'Vacant',
        'BJP', 'INC', 'AAP', 'TMC', 'DMK', 'AIADMK', 'NCP', 'NCP-SP', 'SS(UBT)',
        'Shiv Sena', 'JD(U)', 'RJD', 'SP', 'BSP', 'TDP', 'YSR Congress', 'BJD',
        'CPIM', 'CPI', 'TRS', 'BRS', 'JMM', 'SAD', 'AGP', 'NPP', 'YSRCP', 'AITC',
        'IUML', 'JKNC', 'BJD', 'RSP', 'MNF', 'NPF', 'SDF', 'SKM',
        'Nominated', 'Independent', 'Other'
    ];

    // Handle setting a seat as Vacant
    const handleSetVacant = async (seatNo) => {
        if (!window.confirm(`Mark Seat ${seatNo} as VACANT? This will clear all data for this seat.`)) {
            return;
        }
        
        try {
            const response = await fetch(`http://localhost:5000/api/member/${seatNo}/vacant`, {
                method: 'POST',
            });
            const data = await response.json();
            if (data.success) {
                setMessage({ type: 'success', text: `Seat ${seatNo} marked as VACANT` });
                fetchMembers();
                resetForm();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to set vacant' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to connect to server' });
        }
    };

    // Common positions for chairpersons (protected ones cannot be deleted)
    const positions = [
        'Chairman',
        'Deputy Chairman',
        'In The Chair'
    ];

    // Show option selection if no tab is active
    if (activeTab === null) {
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
                <Header showBack />

                <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full flex flex-col items-center justify-center">
                    {/* Page Title */}
                    <div className="text-center mb-8 animate-fade-in">
                        <div className="inline-flex items-center gap-3 mb-2">
                            <Database size={36} className="text-red-800" />
                            <h2 className="text-3xl md:text-4xl font-bold text-red-800">Database</h2>
                        </div>
                    </div>

                    {/* Three Option Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
                        {/* Member of Parliament Details */}
                        <div
                            onClick={() => setActiveTab('mp')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <Users size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold">Member of Parliament</h3>
                            </div>
                        </div>

                        {/* Chairperson Details */}
                        <div
                            onClick={() => setActiveTab('chairperson')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <UserCog size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold">Chairperson Details</h3>
                            </div>
                        </div>

                        {/* Activity Log */}
                        <div
                            onClick={() => setActiveTab('activitylog')}
                            className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-10 text-white cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <Database size={64} className="mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold">Activity Log</h3>
                            </div>
                        </div>
                    </div>
                </main>

                <Footer />
            </div>
        );
    }

    // Chairperson Details Tab
    if (activeTab === 'chairperson') {
        // Find Chairman and Deputy Chairman from the list
        const chairman = chairpersonsList.find(c => c.position === 'Chairman' || c.position === 'Chairperson');
        const deputyChairman = chairpersonsList.find(c => c.position === 'Deputy Chairman' || c.position === 'Deputy-Chairman');
        const inTheChairMembers = chairpersonsList.filter(c => 
            c.position !== 'Chairman' && c.position !== 'Chairperson' && 
            c.position !== 'Deputy Chairman' && c.position !== 'Deputy-Chairman'
        );
        
        return (
            <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
                <Header showBack />

                <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
                    {/* Page Title with Back */}
                    <div className="flex items-center gap-4 mb-6 animate-fade-in">
                        <button
                            onClick={() => setActiveTab(null)}
                            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                        >
                            ← Back
                        </button>
                        <div className="inline-flex items-center gap-3">
                            <UserCog size={32} className="text-red-800" />
                            <h2 className="text-2xl md:text-3xl font-bold text-red-800">Chairperson Details</h2>
                        </div>
                    </div>

                    {/* Message */}
                    {message.text && (
                        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 animate-fade-in ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                            {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                            {message.text}
                            <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto">
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    {/* Chairman & Deputy Chairman Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Chairman Card */}
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-2xl shadow-xl p-6 border-2 border-yellow-400">
                            <div className="flex items-center gap-2 mb-4">
                                <Crown className="text-yellow-600" size={24} />
                                <h3 className="text-xl font-bold text-yellow-800">Chairman</h3>
                            </div>
                            {chairman ? (
                                <div className="flex items-center gap-4">
                                    <div className="w-24 h-32 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                        {chairman.picture ? (
                                            <img 
                                                src={`data:image/jpeg;base64,${chairman.picture}`} 
                                                alt={chairman.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <Users size={40} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xl font-bold text-gray-800">{chairman.name}</p>
                                        <button
                                            onClick={() => handleEditChair(chairman)}
                                            className="mt-2 text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                                        >
                                            <Edit size={16} />
                                            Edit Name / Photo
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500">No Chairman set</p>
                            )}
                        </div>
                        
                        {/* Deputy Chairman Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl shadow-xl p-6 border-2 border-blue-400">
                            <div className="flex items-center gap-2 mb-4">
                                <Crown className="text-blue-600" size={24} />
                                <h3 className="text-xl font-bold text-blue-800">Deputy Chairman</h3>
                            </div>
                            {deputyChairman ? (
                                <div className="flex items-center gap-4">
                                    <div className="w-24 h-32 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                        {deputyChairman.picture ? (
                                            <img 
                                                src={`data:image/jpeg;base64,${deputyChairman.picture}`} 
                                                alt={deputyChairman.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <Users size={40} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xl font-bold text-gray-800">{deputyChairman.name}</p>
                                        <button
                                            onClick={() => handleEditChair(deputyChairman)}
                                            className="mt-2 text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                                        >
                                            <Edit size={16} />
                                            Edit Name / Photo
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500">No Deputy Chairman set</p>
                            )}
                        </div>
                    </div>

                    {/* Add Button for In The Chair members */}
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-700">Members In The Chair</h3>
                        <button
                            onClick={() => { resetChairForm(); setShowChairForm(true); }}
                            className="gradient-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all hover:-translate-y-0.5"
                        >
                            <Plus size={20} />
                            Add Member in the Chair
                        </button>
                    </div>

                    {/* Add/Edit Chairperson Form Modal */}
                    {showChairForm && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
                                <div className="gradient-primary text-white p-4 rounded-t-2xl flex items-center justify-between">
                                    <h3 className="text-xl font-bold">
                                        {editingChair ? `Edit ${editingChair.position}` : 'Add Member in the Chair'}
                                    </h3>
                                    <button onClick={resetChairForm} className="hover:bg-white/20 p-2 rounded-lg">
                                        <X size={24} />
                                    </button>
                                </div>

                                <form onSubmit={handleChairSubmit} className="p-6 space-y-4">
                                    {/* Position - hidden for editing, dropdown for new */}
                                    {editingChair ? (
                                        <input type="hidden" name="position" value={chairFormData.position} />
                                    ) : (
                                    <div>
                                            <label className="block font-semibold text-gray-700 mb-1">Position</label>
                                            <select
                                                name="position"
                                                value={chairFormData.position || 'In The Chair'}
                                                onChange={handleChairInputChange}
                                                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500"
                                            >
                                                {positions.map(pos => (
                                                    <option key={pos} value={pos}>{pos}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Name with Searchable Dropdown */}
                                    <div className="relative" ref={memberDropdownRef}>
                                        <label className="block font-semibold text-gray-700 mb-1">Full Name *</label>
                                        <div className="relative">
                                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            name="name"
                                                value={memberSearchTerm || chairFormData.name}
                                                onChange={handleMemberSearchChange}
                                                onFocus={() => setShowMemberDropdown(true)}
                                            required
                                                placeholder="Type to search members..."
                                                autoComplete="off"
                                                className="w-full pl-10 pr-10 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                                            />
                                            <ChevronDown 
                                                size={20} 
                                                className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform cursor-pointer ${showMemberDropdown ? 'rotate-180' : ''}`}
                                                onClick={() => setShowMemberDropdown(!showMemberDropdown)}
                                            />
                                        </div>
                                        
                                        {/* Dropdown List */}
                                        {showMemberDropdown && (
                                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-48 overflow-auto">
                                                {filteredMemberSuggestions.length === 0 ? (
                                                    <div className="px-4 py-3 text-gray-500 text-center">
                                                        No members found
                                                    </div>
                                                ) : (
                                                    filteredMemberSuggestions.slice(0, 20).map((member) => (
                                                        <button
                                                            key={member.seat_no}
                                                            type="button"
                                                            onClick={() => handleMemberSelect(member)}
                                                            className={`w-full px-4 py-2 text-left hover:bg-red-50 transition-colors flex items-center justify-between border-b border-gray-100 ${
                                                                chairFormData.name === member.name ? 'bg-red-100' : ''
                                                            }`}
                                                        >
                                                            <div>
                                                                <span className="font-semibold text-gray-800">{member.name}</span>
                                                                <span className="text-sm text-gray-500 ml-2">({member.party})</span>
                                                            </div>
                                                            {chairFormData.name === member.name && (
                                                                <Check size={16} className="text-red-600" />
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Photo Upload */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-2">Photo (Optional)</label>
                                        <div className="flex items-center gap-4">
                                            <div
                                                onClick={() => chairFileInputRef.current?.click()}
                                                className="w-24 h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-red-500 hover:bg-red-50 transition-all overflow-hidden"
                                            >
                                                {chairImagePreview ? (
                                                    <img src={chairImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <>
                                                        <Upload size={24} className="text-gray-400 mb-1" />
                                                        <span className="text-xs text-gray-500">Upload</span>
                                                    </>
                                                )}
                                            </div>
                                            <input
                                                ref={chairFileInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleChairImageChange}
                                                className="hidden"
                                            />
                                            {chairImagePreview && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setChairSelectedImage(null); setChairImagePreview(null); }}
                                                    className="text-red-600 hover:text-red-800 text-sm"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Photo will be auto-fetched from MP data if not uploaded</p>
                                    </div>

                                    {/* Submit Button */}
                                    <div className="flex gap-4 pt-4">
                                        <button
                                            type="button"
                                            onClick={resetChairForm}
                                            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="flex-1 gradient-primary text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                                        >
                                            {saving ? (
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Save size={20} />
                                                    {editingChair ? 'Update' : 'Add'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* In The Chair Members Table */}
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="gradient-primary text-white">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-20">Photo</th>
                                        <th className="px-4 py-3 text-left">Name</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="3" className="text-center py-8">
                                                <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto" />
                                            </td>
                                        </tr>
                                    ) : inTheChairMembers.length === 0 ? (
                                        <tr>
                                            <td colSpan="3" className="text-center py-8 text-gray-500">
                                                No "In The Chair" members found. Add members to populate the dropdown.
                                            </td>
                                        </tr>
                                    ) : (
                                        inTheChairMembers.map((chair, index) => (
                                                <tr
                                                    key={chair.id}
                                                    className={`border-b border-gray-100 hover:bg-red-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                                        }`}
                                                >
                                                <td className="px-4 py-3">
                                                    <div className="w-12 h-16 bg-gray-200 rounded overflow-hidden">
                                                        {chair.picture ? (
                                                            <img 
                                                                src={`data:image/jpeg;base64,${chair.picture}`} 
                                                                alt={chair.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                                <Users size={20} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold">{chair.name}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => handleEditChair(chair)}
                                                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                            title="Edit"
                                                            >
                                                                <Edit size={18} />
                                                            </button>
                                                                <button
                                                                    onClick={() => handleDeleteChair(chair.id)}
                                                                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Info */}
                        <div className="p-4 bg-gray-50 border-t text-gray-600 text-sm">
                            These members will appear in the "IN THE CHAIR" dropdown. Chairman and Deputy Chairman are shown above.
                        </div>
                    </div>
                </main>

                <Footer />
            </div>
        );
    }

    // MP Details Tab (original functionality)
    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-amber-100">
            <Header showBack />

            <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
                {/* Page Title with Back */}
                <div className="flex items-center gap-4 mb-6 animate-fade-in">
                    <button
                        onClick={() => setActiveTab(null)}
                        className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
                    >
                        ← Back
                    </button>
                    <div className="inline-flex items-center gap-3">
                        <Users size={32} className="text-red-800" />
                        <h2 className="text-2xl md:text-3xl font-bold text-red-800">Member of Parliament Details</h2>
                    </div>
                </div>

                {/* Message */}
                {message.text && (
                    <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 animate-fade-in ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                        {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                        {message.text}
                        <button onClick={() => setMessage({ type: '', text: '' })} className="ml-auto">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {/* Search and Add */}
                <div className="flex flex-wrap gap-4 mb-6">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search by name, party, state, or seat number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                        />
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="gradient-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all hover:-translate-y-0.5"
                    >
                        <Plus size={20} />
                        Add New MP
                    </button>
                </div>

                {/* Add/Edit Form Modal */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
                            <div className="gradient-primary text-white p-4 rounded-t-2xl flex items-center justify-between">
                                <h3 className="text-xl font-bold">
                                    {editingMember ? 'Edit MP Details' : 'Add New MP'}
                                </h3>
                                <button onClick={resetForm} className="hover:bg-white/20 p-2 rounded-lg">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Seat Number */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-1">Seat Number *</label>
                                        <input
                                            type="number"
                                            name="seat_no"
                                            value={formData.seat_no}
                                            onChange={handleInputChange}
                                            min="1"
                                            max="260"
                                            required
                                            disabled={editingMember}
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500 disabled:bg-gray-100"
                                        />
                                    </div>

                                    {/* Name */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-1">Full Name *</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500"
                                        />
                                    </div>

                                    {/* Party */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-1">Party *</label>
                                        <select
                                            name="party"
                                            value={formData.party}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500"
                                        >
                                            <option value="">Select Party</option>
                                            {parties.map(party => (
                                                <option key={party} value={party}>{party}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* State */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-1">State *</label>
                                        <select
                                            name="state"
                                            value={formData.state}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500"
                                        >
                                            <option value="">Select State</option>
                                            {states.map(state => (
                                                <option key={state} value={state}>{state}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Tenure Start */}
                                    <div>
                                        <label className="block font-semibold text-gray-700 mb-1">Tenure Start</label>
                                        <input
                                            type="date"
                                            name="tenure_start"
                                            value={formData.tenure_start}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-red-500"
                                        />
                                    </div>
                                </div>

                                {/* Photo Upload */}
                                <div>
                                    <label className="block font-semibold text-gray-700 mb-2">Photo</label>
                                    <div className="flex items-center gap-4">
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-32 h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-red-500 hover:bg-red-50 transition-all overflow-hidden"
                                        >
                                            {imagePreview ? (
                                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <>
                                                    <Upload size={32} className="text-gray-400 mb-2" />
                                                    <span className="text-sm text-gray-500">Click to upload</span>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                        {imagePreview && (
                                            <button
                                                type="button"
                                                onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    {editingMember && (
                                        <button
                                            type="button"
                                            onClick={() => handleSetVacant(formData.seat_no)}
                                            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold"
                                        >
                                            Mark Vacant
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="flex-1 gradient-primary text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                                    >
                                        {saving ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Save size={20} />
                                                {editingMember ? 'Update MP' : 'Add MP'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Members Table */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="gradient-primary text-white">
                                <tr>
                                    <th className="px-4 py-3 text-left">Seat</th>
                                    <th className="px-4 py-3 text-left">Name</th>
                                    <th className="px-4 py-3 text-left">Party</th>
                                    <th className="px-4 py-3 text-left">State</th>
                                    <th className="px-4 py-3 text-left">Tenure Start</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8">
                                            <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto" />
                                        </td>
                                    </tr>
                                ) : filteredMembers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-8 text-gray-500">
                                            No members found
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMembers.map((member, index) => (
                                        <tr
                                            key={member.seat_no}
                                            className={`border-b border-gray-100 hover:bg-red-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                                }`}
                                        >
                                            <td className="px-4 py-3 font-bold text-red-800">{member.seat_no}</td>
                                            <td className="px-4 py-3 font-semibold">{member.name}</td>
                                            <td className="px-4 py-3">{member.party}</td>
                                            <td className="px-4 py-3">{member.state}</td>
                                            <td className="px-4 py-3 text-gray-600">
                                                {member.tenure_start ? new Date(member.tenure_start).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEdit(member)}
                                                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(member.seat_no)}
                                                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary */}
                    <div className="p-4 bg-gray-50 border-t flex items-center justify-between">
                        <span className="text-gray-600">
                            Showing {filteredMembers.length} of {members.length} members
                        </span>
                        <span className="text-gray-600">
                            Total Seats: 250 | Filled: {members.length} | Empty: {250 - members.length}
                        </span>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
