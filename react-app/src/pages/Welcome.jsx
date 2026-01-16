import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Welcome() {
    const navigate = useNavigate();
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Animate progress bar
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                return prev + 2.5; // 100/40 = 2.5% per 100ms = 4 seconds
            });
        }, 100);

        // Navigate to login after 4 seconds
        const timer = setTimeout(() => {
            navigate('/login');
        }, 4000);

        return () => {
            clearTimeout(timer);
            clearInterval(progressInterval);
        };
    }, [navigate]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 p-4">
            {/* Main Content */}
            <div className="text-center animate-fade-in">
                {/* Logo */}
                <div className="mb-8">
                    <img
                        src="/parliament_logo.png"
                        alt="Parliament of India"
                        className="w-[16.5rem] h-48 md:w-[22rem] md:h-64 mx-auto drop-shadow-2xl animate-pulse object-contain"
                    />
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-5xl font-extrabold text-red-800 mb-4 text-shadow">
                    Welcome to
                </h1>
                <h2 className="text-2xl md:text-4xl font-bold text-red-700 mb-2">
                    Talk Time Management System
                </h2>
                <h3 className="text-xl md:text-3xl font-semibold text-red-600 mb-8">
                    for Rajya Sabha
                </h3>

                {/* Progress Bar */}
                <div className="w-64 md:w-96 mx-auto bg-red-200 rounded-full h-2 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-800 rounded-full transition-all duration-100"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                <p className="text-gray-500 mt-4 text-sm animate-pulse">
                    Loading...
                </p>
            </div>

            {/* Footer */}
            <div className="absolute bottom-8 text-center">
                <div className="h-px w-64 bg-gray-300 mx-auto mb-4"></div>
                <p className="text-gray-500 text-sm">
                    © <span className="text-yellow-600 font-semibold">Bihar Communications Pvt. Ltd</span> 2025
                </p>
            </div>
        </div>
    );
}
