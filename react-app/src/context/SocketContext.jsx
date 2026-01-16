import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedSeat, setSelectedSeat] = useState(null);
    const [memberData, setMemberData] = useState(null);

    // Fetch member data when seat changes
    const fetchMemberData = useCallback(async (seat) => {
        if (!seat) {
            setMemberData(null);
            return;
        }
        try {
            const response = await fetch(`http://localhost:5000/api/member/${seat}`);
            const data = await response.json();
            if (data.success) {
                setMemberData(data.data);
            } else {
                setMemberData(null);
            }
        } catch (error) {
            console.error('Error fetching member:', error);
            setMemberData(null);
        }
    }, []);

    useEffect(() => {
        // Connect to the Flask backend
        const socketInstance = io('http://localhost:5000', {
            transports: ['websocket', 'polling'],
        });

        socketInstance.on('connect', () => {
            console.log('Connected to server');
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('Disconnected from server');
            setIsConnected(false);
        });

        // Listen for seat selection from UDP
        socketInstance.on('seat_selected', (data) => {
            console.log('Seat selected:', data.seat_no);
            setSelectedSeat(data.seat_no);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    // Auto-fetch member data when selectedSeat changes
    useEffect(() => {
        if (selectedSeat) {
            fetchMemberData(selectedSeat);
        } else {
            // Clear member data when seat is cleared
            setMemberData(null);
        }
    }, [selectedSeat, fetchMemberData]);

    const value = {
        socket,
        isConnected,
        selectedSeat,
        setSelectedSeat,
        memberData,
        setMemberData,
        fetchMemberData,
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
}
