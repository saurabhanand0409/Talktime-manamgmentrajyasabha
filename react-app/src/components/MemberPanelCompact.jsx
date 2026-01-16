import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function MemberPanelCompact({ seatNo, onSeatChange }) {
    const { memberData, fetchMemberData } = useSocket();
    const [loading, setLoading] = useState(false);
    const [inputSeat, setInputSeat] = useState('');

    useEffect(() => {
        if (seatNo) {
            // Only fetch member data, don't set input (keep it clear)
            handleFetchMember(seatNo);
        }
    }, [seatNo]);

    const handleFetchMember = async (seat) => {
        if (!seat) return;
        setLoading(true);
        try {
            await fetchMemberData(seat);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const seat = inputSeat.trim();
        if (seat && !isNaN(seat) && seat >= 1 && seat <= 260) {
            onSeatChange?.(seat);
            handleFetchMember(seat);
            // Clear the input box after submission
            setInputSeat('');
        }
    };

    // Use memberData from context
    const member = memberData;

    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col">
            {/* Compact Seat Input */}
            <div className="bg-gradient-to-r from-red-50 to-red-100 px-4 py-2 border-b">
                <form onSubmit={handleSubmit} className="flex items-center justify-center gap-3">
                    <label className="font-bold text-red-800">Seat No / सीट नं:</label>
                    <input
                        type="number"
                        value={inputSeat}
                        onChange={(e) => setInputSeat(e.target.value)}
                        placeholder="1-250"
                        min="1"
                        max="260"
                        className="w-24 px-3 py-1 text-xl text-center font-bold rounded border-2 border-red-300 focus:border-red-500"
                    />
                    <button
                        type="submit"
                        className="gradient-primary text-white px-4 py-1 rounded font-bold"
                    >
                        Load / लोड करें
                    </button>
                </form>
            </div>

            {/* Member Details - Horizontal Layout */}
            <div className="p-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="flex gap-6 items-center">
                        {/* Photo - Larger Size */}
                        <div className="flex-shrink-0">
                            {member?.picture ? (
                                <img
                                    src={`data:image/jpeg;base64,${member.picture}`}
                                    alt={member.name}
                                    className="w-44 h-56 object-cover rounded-xl border-4 border-red-800 shadow-lg"
                                />
                            ) : (
                                <div className="w-44 h-56 flex items-center justify-center bg-gray-100 rounded-xl border-4 border-red-800">
                                    <User size={60} className="text-gray-400" />
                                </div>
                            )}
                        </div>

                        {/* Details - Two Column Layout */}
                        <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2">
                            {/* Row 1: Seat & Name */}
                            <CompactRow label="Seat / सीट" value={member?.seat_no} highlight />
                            <CompactRow label="Name / नाम" value={member?.name} valueHi={member?.name_hindi} />

                            {/* Row 2: Party & State */}
                            <CompactRow label="Party / दल" value={member?.party} valueHi={member?.party_hindi} />
                            <CompactRow label="State / राज्य" value={member?.state} valueHi={member?.state_hindi} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CompactRow({ label, value, valueHi, highlight }) {
    const hasHindi = valueHi && valueHi !== value;

    return (
        <div className="py-2">
            <div className="text-red-800 font-bold text-base mb-1">{label}:</div>
            <div className="flex items-center gap-2">
                <span className={`text-xl font-bold ${highlight ? 'text-red-800 bg-red-50 px-3 py-1 rounded-lg' : 'text-gray-900'}`}>
                    {value || '-'}
                </span>
                {hasHindi && (
                    <>
                        <span className="text-gray-400 text-xl">/</span>
                        <span className="text-xl font-bold text-gray-700">{valueHi}</span>
                    </>
                )}
            </div>
        </div>
    );
}
