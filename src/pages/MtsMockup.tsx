const MtsMockup = () => {
    return (
        <div className="hero-section">
        <div className="container">
            {/* Top Bar */}
            <div className="top-bar">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <span className="text-muted small">— Measure Tracking Administration Menu —</span>
                    <a href="#" className="text-decoration-none">» Gov't Relations Website</a>
                </div>
                
                {/* Navigation */}
                <nav className="nav-bar" role="navigation" aria-label="Main navigation">
                    <a href="#" className="nav-link">Home</a>
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

            {/* Main Card */}
            <div className="card main-card shadow-sm">
                <div className="card-body">
                    {/* Search Row */}
                    <div className="row g-3 mb-4">
                        <div className="col-md-6">
                            <form className="d-flex gap-2" role="search">
                                <label htmlFor="measureStatus" className="form-label mb-0 text-nowrap align-self-center">Measure Status</label>
                                <input 
                                    type="text" 
                                    className="form-control form-control-sm" 
                                    id="measureStatus"
                                    placeholder="e.g. HB16"
                                    aria-label="Measure Status search"
                                />
                                <button type="submit" className="btn btn-secondary btn-sm">go</button>
                            </form>
                        </div>
                        <div className="col-md-6">
                            <form className="d-flex gap-2" role="search">
                                <label htmlFor="legislativeSession" className="form-label mb-0 text-nowrap align-self-center">Legislative Session</label>
                                <select className="form-select form-select-sm" id="legislativeSession" aria-label="Legislative Session selector" defaultValue="2025">
                                    <option value="2025">2025</option>
                                    <option value="2024">2024</option>
                                    <option value="2023">2023</option>
                                </select>
                                <button type="submit" className="btn btn-secondary btn-sm">go</button>
                            </form>
                        </div>
                    </div>

                    {/* Dashboard Links */}
                    <div className="dashboard-links mb-4">
                        <span className="fw-bold">Dashboard</span>
                        <span className="link-separator">|</span>
                        <a href="#">House Bills</a>
                        <span className="link-separator">|</span>
                        <a href="#">Senate Bills</a>
                        <span className="link-separator">|</span>
                        <a href="#">HR</a>
                        <span className="link-separator">|</span>
                        <a href="#">SR</a>
                        <span className="link-separator">|</span>
                        <a href="#">HCR</a>
                        <span className="link-separator">|</span>
                        <a href="#">SCR</a>
                        <span className="link-separator">|</span>
                        <a href="#">Governor's Messages </a>
                        <br className="d-md-none" />
                        <a href="#">Priority 1</a>
                        <span className="link-separator">|</span>
                        <a href="#">Priority 2</a>
                        <span className="link-separator">|</span>
                        <a href="#">Appropriation</a>
                        <span className="link-separator">|</span>
                        <a href="#">Enacted / Vetoed</a>
                        <span className="link-separator">|</span>
                        <a href="#">My Lists</a>
                    </div>

                    {/* Two Column Layout */}
                    <div className="row">
                        {/* Left Column: Counts */}
                        <div className="col-md-6 col-lg-5">
                            <nav className="counts-list" aria-label="Measure counts and categories">
                                <ul className="list-unstyled">
                                    <li><span className="count">313</span> <a href="#">House Bills</a></li>
                                    <li><span className="count">394</span> <a href="#">Senate Bills</a></li>
                                    <li><span className="count">30</span> <a href="#">House Resos</a></li>
                                    <li><span className="count">31</span> <a href="#">Senate Resos</a></li>
                                    <li><span className="count">31</span> <a href="#">House Concurrent Resos</a></li>
                                    <li><span className="count">35</span> <a href="#">Senate Concurrent Resos</a></li>
                                    <li><span className="count">29</span> <a href="#">Governor's Msgs</a></li>
                                    <li><a href="#" className="ms-4">Budget Worksheets</a></li>
                                    <li><a href="#" className="ms-4">Special Session</a></li>
                                </ul>
                                <p className="text-muted small mt-3">*Measures update is currently disabled</p>
                            </nav>
                        </div>

                        {/* Right Column: Helpful Information */}
                        <div className="col-md-6 col-lg-7">
                            <div className="card info-card">
                                <div className="card-body">
                                    <h2 className="card-title h5 mb-3">Helpful Information</h2>
                                    <nav aria-label="Helpful resources">
                                        <ul className="list-unstyled info-links">
                                            <li><a href="#">Hawaii State Legislature Live and On-Demand Video</a></li>
                                            <li><a href="#">Find My Legislator</a></li>
                                            <li><a href="#">Directory of State, County and Federal Officials</a></li>
                                            <li><a href="#">MTS List of Leads</a> (as of January 2025)</li>
                                            <li><a href="#">2025 Legislative Session Calendar</a></li>
                                        </ul>
                                    </nav>
                                    
                                    <div className="deadlines mt-4">
                                        <p className="text-muted small mb-1">December 5 – Campus-generated reports due to GRO</p>
                                        <p className="text-muted small mb-1">December 10 – System-generated reports due to GRO</p>
                                        <p className="text-muted small mb-1">December 12 – Lead VP approval on reports</p>
                                        <p className="text-muted small mb-0">December 16 – Report in final form due to GRO</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Current Hearings Table */}
                    <div className="mt-5">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h2 className="h5 mb-0">Current Hearings</h2>
                            <span className="text-muted small">— as of October 12, 2025 5:24pm</span>
                        </div>
                        
                        <div className="table-responsive">
                            <table className="table table-striped" role="table" aria-label="Current hearings schedule">
                                <thead className="table-dark">
                                    <tr>
                                        <th scope="col">Committee</th>
                                        <th scope="col">Measure</th>
                                        <th scope="col">Date/Time</th>
                                        <th scope="col">Room</th>
                                        <th scope="col">Notice</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><a href="#">HED</a></td>
                                        <td><a href="#">HB 342</a></td>
                                        <td>01/21/2025 2:00 PM</td>
                                        <td>325</td>
                                        <td><a href="#">View</a></td>
                                    </tr>
                                    <tr>
                                        <td><a href="#">FIN</a></td>
                                        <td><a href="#">SB 247</a></td>
                                        <td>01/22/2025 10:00 AM</td>
                                        <td>211</td>
                                        <td><a href="#">View</a></td>
                                    </tr>
                                    <tr>
                                        <td><a href="#">WAM</a></td>
                                        <td><a href="#">HB 129</a></td>
                                        <td>01/23/2025 9:30 AM</td>
                                        <td>308</td>
                                        <td><a href="#">View</a></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    )
};

export default MtsMockup;