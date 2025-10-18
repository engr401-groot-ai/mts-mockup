import React from 'react';
import { Outlet } from 'react-router-dom';
import MtsNavbar from '../MtsNavbar';

/**
 * Main layout component that wraps all pages with consistent navigation
 */
const MainLayout: React.FC = () => {
    return (
        <div className="min-h-screen flex flex-col">
            <div className="container pt-5">
                <MtsNavbar />
            </div>
            <main className="flex-1">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
