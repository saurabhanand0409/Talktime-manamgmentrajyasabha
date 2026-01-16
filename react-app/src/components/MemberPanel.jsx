import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function MemberPanel({ seatNo, onSeatChange }) {
    const { memberData, fetchMemberData } = useSocket();
    const [loading, setLoading] = useState(false);
    const [inputSeat, setInputSeat] = useState('');

    // Fetch member when seatNo changes
    useEffect(() => {
        if (seatNo) {
            setInputSeat(seatNo);
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
        }
    };

    // Use memberData from context
    const member = memberData;

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    return (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
            {/* Seat Input Section */}
            <div className="bg-gradient-to-r from-red-50 to-red-100 p-4 border-b">
                <form onSubmit={handleSubmit} className="flex items-center justify-center gap-4 flex-wrap">
                    <label className="font-bold text-red-800">Seat No / सीट नं:</label>
                    <input
                        type="number"
                        value={inputSeat}
                        onChange={(e) => setInputSeat(e.target.value)}
                        placeholder="1-245"
                        min="1"
                        max="245"
                        className="w-32 px-4 py-2 text-xl text-center font-bold rounded-lg border-2 border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                    />
                    <button
                        type="submit"
                        className="gradient-primary hover:opacity-90 text-white px-6 py-2 rounded-lg font-bold transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    >
                        Load Member / सदस्य लोड करें
                    </button>
                </form>
            </div>

            {/* Member Details */}
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                        {/* Photo */}
                        <div className="flex justify-center">
                            {member?.picture ? (
                                <img
                                    src={`data:image/jpeg;base64,${member.picture}`}
                                    alt={member.name}
                                    className="w-64 h-80 object-cover rounded-xl border-4 border-red-800 shadow-lg"
                                />
                            ) : (
                                <div className="w-64 h-80 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl border-4 border-red-800">
                                    <User size={80} className="text-gray-400" />
                                </div>
                            )}
                        </div>

                        {/* Details - English Left, Hindi Right */}
                        <div className="space-y-4">
                            {/* Seat No - Just number, no Hindi needed */}
                            <BilingualRow
                                labelEn="Seat No"
                                labelHi="सीट नं"
                                valueEn={member?.seat_no || '-'}
                                valueHi={null}
                                highlight
                            />
                            <BilingualRow
                                labelEn="Name"
                                labelHi="नाम"
                                valueEn={member?.name || '-'}
                                valueHi={member?.name_hindi}
                            />
                            <BilingualRow
                                labelEn="Party"
                                labelHi="दल"
                                valueEn={member?.party || '-'}
                                valueHi={member?.party_hindi}
                            />
                            <BilingualRow
                                labelEn="State"
                                labelHi="राज्य"
                                valueEn={member?.state || '-'}
                                valueHi={member?.state_hindi}
                            />
                            <BilingualRow
                                labelEn="Tenure Start"
                                labelHi="कार्यकाल प्रारंभ"
                                valueEn={formatDate(member?.tenure_start)}
                                valueHi={null}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function BilingualRow({ labelEn, labelHi, valueEn, valueHi, highlight = false }) {
    const hasHindi = valueHi && valueHi !== valueEn;

    return (
        <div className="py-3 border-b border-gray-100 last:border-0">
            {/* Labels - English / Hindi */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-red-800 font-bold text-lg">{labelEn}</span>
                <span className="text-gray-400">/</span>
                <span className="text-red-600 font-semibold text-lg">{labelHi}:</span>
            </div>

            {/* Values - English LEFT, Hindi RIGHT (same size) */}
            <div className="flex items-center gap-4 pl-2">
                {/* English Value (Left) */}
                <span className={`text-xl font-bold ${highlight
                    ? 'text-red-800 bg-gradient-to-r from-red-50 to-red-100 px-4 py-1 rounded-lg'
                    : 'text-gray-900'
                    }`}>
                    {valueEn}
                </span>

                {/* Hindi Value (Right) - Same size */}
                {hasHindi && (
                    <>
                        <span className="text-gray-400 text-xl">/</span>
                        <span className="text-xl font-bold text-gray-800">
                            {valueHi}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
