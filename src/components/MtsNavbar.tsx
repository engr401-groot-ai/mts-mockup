const MtsNavbar: React.FC = () => {
    return (
        <div className="top-bar">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span className="text-muted small">— Measure Tracking Administration Menu —</span>
                    <a href="#" className="text-decoration-none">» Gov't Relations Website</a>
                </div>
                
                {/* Navigation */}
                <nav className="nav-bar" role="navigation" aria-label="Main navigation">
                    <a href="/" className="nav-link">Home</a>
                    <span className="nav-separator">|</span>
                    <a href="#" className="nav-link">Search</a>
                    <span className="nav-separator">|</span>
                    <a href="#" className="nav-link">Lists</a>
                    <span className="nav-separator">|</span>
                    <a href="/hearings-list" className="nav-link">Hearings</a>
                    <span className="nav-separator">|</span>
                    <a href="#" className="nav-link">Logout</a>
                    <span className="text-muted">[ellisa4]</span>
                </nav>
        </div>
    )
}

export default MtsNavbar;