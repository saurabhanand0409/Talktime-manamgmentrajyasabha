import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useChairperson } from '../context/ChairpersonContext';
import { ChevronUp, Search, Check, X } from 'lucide-react';

export default function ChairDisplay({ showDropdown = false }) {
    const { chairperson, selectedChairpersonData, chairpersons, selectChairperson } = useChairperson();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingSelection, setPendingSelection] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isDropdownOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isDropdownOpen]);

    // Format position for display
    const formatPosition = (position) => {
        if (position === 'Deputy-Chairman' || position === 'Vice-Chairperson' || position === 'Vice Chairperson') {
            return 'Deputy Chairman';
        }
        if (position === 'Chairperson') {
            return 'Chairman';
        }
        if (position === 'Co-Chairperson') {
            return 'In The Chair';
        }
        return position;
    };

    // Format display: Show title only for Chairman and Deputy Chairman
    const getDisplayText = () => {
        if (!selectedChairpersonData) {
            if (chairperson) {
                // Try to format old chairperson string
                if (chairperson.includes('Vice-Chairperson') || chairperson.includes('Vice Chairperson')) {
                    return chairperson.replace(/Vice-?Chairperson/i, 'Deputy Chairman');
                }
                if (chairperson.includes('Chairperson') && !chairperson.includes('Deputy')) {
                    return chairperson.replace('Chairperson', 'Chairman');
                }
                return chairperson;
            }
            return 'No selection made';
        }

        const { position, name } = selectedChairpersonData;
        const displayPosition = formatPosition(position);
        
        // Show title for Chairman and Deputy Chairman only
        if (displayPosition === 'Chairman' || displayPosition === 'Deputy Chairman') {
            return `${displayPosition} - ${name}`;
        }
        // For "In The Chair" and others, show only name
        return name;
    };

    // Filter chairpersons based on search
    const filteredChairpersons = chairpersons.filter((chair) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        const displayPosition = formatPosition(chair.position);
        return (
            chair.name.toLowerCase().includes(search) ||
            displayPosition.toLowerCase().includes(search)
        );
    });

    const handleSelect = (chair) => {
        setPendingSelection(chair);
        setShowConfirmation(true);
        setIsDropdownOpen(false);
    };

    const confirmSelection = () => {
        if (pendingSelection) {
            selectChairperson(pendingSelection);
        }
        setShowConfirmation(false);
        setPendingSelection(null);
        setSearchTerm('');
    };

    const cancelSelection = () => {
        setShowConfirmation(false);
        setPendingSelection(null);
    };

    const toggleDropdown = () => {
        setIsDropdownOpen(!isDropdownOpen);
        if (!isDropdownOpen) {
            setSearchTerm('');
        }
    };

    return (
        <div className="gradient-primary text-white rounded-2xl shadow-xl p-3 relative" ref={dropdownRef}>
            <div 
                className={`flex items-center justify-center gap-2 ${showDropdown ? 'cursor-pointer' : ''}`}
                onClick={showDropdown ? toggleDropdown : undefined}
            >
                {/* Combined: IN THE CHAIR : Name */}
                <p className="text-lg font-bold">
                    <span className="uppercase tracking-wide">In The Chair</span>
                    <span className="mx-2">:</span>
                    <span>{getDisplayText()}</span>
                </p>
                
                {showDropdown && (
                    <ChevronUp size={22} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                )}
            </div>

            {/* Dropdown - Opens UP */}
            {showDropdown && isDropdownOpen && (
                <div className="absolute left-0 right-0 bottom-full mb-2 bg-white rounded-xl shadow-2xl z-50 overflow-hidden">
                    {/* Options List */}
                    <div className="max-h-48 overflow-auto">
                        {filteredChairpersons.length === 0 ? (
                            <div className="px-4 py-4 text-center text-gray-500">
                                No members found
                            </div>
                        ) : (
                            filteredChairpersons.map((chair) => {
                                const displayPosition = formatPosition(chair.position);
                                const isSelected = selectedChairpersonData?.id === chair.id;

    return (
                                    <button
                                        key={chair.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelect(chair);
                                        }}
                                        className={`w-full px-4 py-2.5 text-left hover:bg-red-50 transition-colors flex items-center justify-between border-b border-gray-100 ${
                                            isSelected ? 'bg-red-100' : ''
                                        }`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-gray-800">{chair.name}</span>
                                            <span className="text-xs text-gray-500">{displayPosition}</span>
                                        </div>
                                        {isSelected && (
                                            <Check size={18} className="text-red-600" />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                    
                    {/* Search Input at bottom */}
                    <div className="p-2 bg-gray-50 border-t">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-800 focus:border-red-500 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal - Using Portal */}
            {showConfirmation && pendingSelection && createPortal(
                <div 
                    className="fixed inset-0 flex items-center justify-center"
                    style={{ zIndex: 99999 }}
                >
                    <div className="absolute inset-0 bg-black/50" onClick={cancelSelection}></div>
                    <div 
                        className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Confirm Selection</h3>
                        <p className="text-gray-600 mb-6">
                            Change to <span className="font-bold text-red-800">{formatPosition(pendingSelection.position)} - {pendingSelection.name}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={cancelSelection}
                                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 flex items-center justify-center gap-2"
                            >
                                <X size={20} />
                                Cancel
                            </button>
                            <button
                                onClick={confirmSelection}
                                className="flex-1 px-4 py-3 bg-red-800 text-white rounded-xl font-semibold hover:bg-red-900 flex items-center justify-center gap-2"
                            >
                                <Check size={20} />
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
