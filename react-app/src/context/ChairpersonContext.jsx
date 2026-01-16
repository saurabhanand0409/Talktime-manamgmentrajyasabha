import { createContext, useContext, useState, useEffect } from 'react';

const ChairpersonContext = createContext(null);

export function ChairpersonProvider({ children }) {
    const [chairperson, setChairperson] = useState(() => {
        return localStorage.getItem('selectedChairperson') || '';
    });
    const [selectedChairpersonData, setSelectedChairpersonData] = useState(() => {
        const saved = localStorage.getItem('selectedChairpersonData');
        return saved ? JSON.parse(saved) : null;
    });
    const [chairpersons, setChairpersons] = useState([]);

    // Load chairpersons from API
    const fetchChairpersons = () => {
        fetch('http://localhost:5000/api/chairpersons')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setChairpersons(data.data);
                }
            })
            .catch(err => console.error('Error loading chairpersons:', err));
    };

    useEffect(() => {
        fetchChairpersons();
    }, []);

    // Save to localStorage when changed
    useEffect(() => {
        localStorage.setItem('selectedChairperson', chairperson);
    }, [chairperson]);

    useEffect(() => {
        localStorage.setItem('selectedChairpersonData', JSON.stringify(selectedChairpersonData));
    }, [selectedChairpersonData]);

    // Helper to set chairperson with full data
    const selectChairperson = (chairData) => {
        if (chairData) {
            setChairperson(`${chairData.position} - ${chairData.name}`);
            setSelectedChairpersonData(chairData);
        } else {
            setChairperson('');
            setSelectedChairpersonData(null);
        }
    };

    const value = {
        chairperson,
        setChairperson,
        selectedChairpersonData,
        selectChairperson,
        chairpersons,
        refreshChairpersons: fetchChairpersons,
    };

    return (
        <ChairpersonContext.Provider value={value}>
            {children}
        </ChairpersonContext.Provider>
    );
}

export function useChairperson() {
    const context = useContext(ChairpersonContext);
    if (!context) {
        throw new Error('useChairperson must be used within a ChairpersonProvider');
    }
    return context;
}
