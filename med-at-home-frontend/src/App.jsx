import { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// We still need the Service ID since we haven't built a dynamic service fetcher yet
const TEST_SERVICE_ID = 'a688d7fa-4358-4b8f-b4f3-470993f0c392'; 

// --- LOGIN SCREEN ---
function Login({ setAuthUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123'); // Pre-filled to save you time testing
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('import.meta.env.VITE_API_URL || 'http://localhost:5000'', { email, password });
      const user = response.data.user;
      
      setAuthUser(user); // Save logged-in user to memory
      
      // Role-Based Routing!
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'provider') navigate('/provider');
      else navigate('/');
      
    } catch (error) {
      alert("Login Failed: " + (error.response?.data?.message || "Invalid credentials"));
    }
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', marginTop: '50px' }}>
      <h1 style={{ color: '#0056b3' }}>MED AT HOME</h1>
      <h2>Secure Login</h2>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '300px', margin: '0 auto' }}>
        <input 
          type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} 
          style={{ padding: '10px' }} required 
        />
        <input 
          type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} 
          style={{ padding: '10px' }} required 
        />
        <button type="submit" style={{ background: '#4CAF50', color: 'white', padding: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Sign In
        </button>
      </form>
      
      <div style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
        <p><strong>Test Accounts:</strong></p>
        <p>admin@medathome.com | provider@medathome.com | patient@medathome.com</p>
      </div>
    </div>
  );
}

// --- CUSTOMER APP ---
function CustomerApp({ authUser }) {
  const [selectedService, setSelectedService] = useState(null);
  const [bookingStatus, setBookingStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const services = [{ id: TEST_SERVICE_ID, name: 'General Nursing Visit', price: 500 }];

  const confirmBooking = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/bookings/create`, {
        customer_id: authUser.id, // 👈 Using the dynamically logged-in ID!
        service_id: selectedService.id,
        scheduled_time: new Date(Date.now() + 86400000).toISOString(),
        address: "Karelibaug, Vadodara",
        lat: 22.3214,
        lng: 73.1812
      });

      const matchedProvider = response.data.data.matched_providers[0];
      if (!matchedProvider) {
        alert("Booking created, but NO providers are currently online/available.");
        setBookingStatus(null);
        setLoading(false);
        return;
      }
      setBookingStatus({ success: true, bookingId: response.data.data.booking_id, matchedProvider });
    } catch (error) {
      alert("Backend Error: " + (error.response?.data?.message || error.message));
      setBookingStatus(null); 
    }
    setLoading(false);
  };

  if (!authUser || authUser.role !== 'customer') return <Navigate to="/login" />;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Welcome, {authUser.name}</h2>
      {!selectedService ? (
        <div>
          <h3>Select a Service:</h3>
          {services.map((service) => (
            <div key={service.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
              <h4>{service.name} - ₹{service.price}</h4>
              <button onClick={() => setSelectedService(service)} style={{ background: '#0056b3', color: 'white', padding: '10px' }}>Book Now</button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {!bookingStatus ? (
            <div>
              <h2>Confirm Booking</h2>
              <button onClick={confirmBooking} disabled={loading} style={{ background: '#4CAF50', color: 'white', padding: '10px', width: '100%' }}>
                {loading ? 'Finding Provider...' : 'Confirm & Find Provider'}
              </button>
            </div>
          ) : (
            <div>
              <h2 style={{ color: '#4CAF50' }}>Booking Confirmed!</h2>
              <p>ID: <strong>{bookingStatus.bookingId}</strong></p>
              <p>Provider: {bookingStatus.matchedProvider.name} ({parseFloat(bookingStatus.matchedProvider.distance_km).toFixed(2)} km away)</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- PROVIDER APP ---
function ProviderApp({ authUser }) {
  const [bookingId, setBookingId] = useState('');
  const [jobStatus, setJobStatus] = useState('pending');
  const [financials, setFinancials] = useState(null);

  const acceptJob = async () => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/bookings/${bookingId}/accept`, {
        provider_id: authUser.id // 👈 Using the dynamically logged-in ID!
      });
      setFinancials(response.data.data.financials);
      setJobStatus('accepted');
    } catch (error) {
      alert("Error accepting job. Check Booking ID.");
    }
  };

  const completeJob = async () => {
    try {
      await axios.patch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/bookings/${bookingId}/status`, {
        provider_id: authUser.id, // 👈 Using the dynamically logged-in ID!
        new_status: 'completed',
        completion_notes: 'Patient attended. Vitals normal.'
      });
      setJobStatus('completed');
    } catch (error) {
      alert("Error completing job.");
    }
  };

  if (!authUser || authUser.role !== 'provider') return <Navigate to="/login" />;

  return (
    <div style={{ padding: '20px', background: '#f4f4f9', minHeight: '100vh' }}>
      <h1 style={{ color: '#333' }}>Dr. {authUser.name}'s Dashboard</h1>
      
      {jobStatus === 'pending' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ccc' }}>
          <h2>New Job Request</h2>
          <input 
            value={bookingId} onChange={(e) => setBookingId(e.target.value)} 
            placeholder="Paste Booking ID here" style={{ padding: '10px', width: '90%', marginBottom: '15px' }}
          />
          <button onClick={acceptJob} style={{ background: '#4CAF50', color: 'white', padding: '10px 20px', width: '100%' }}>Accept Job</button>
        </div>
      )}

      {jobStatus === 'accepted' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px' }}>
          <h2>Job Active</h2>
          <button onClick={completeJob} style={{ background: '#0056b3', color: 'white', padding: '10px 20px', width: '100%' }}>Mark Completed</button>
        </div>
      )}

      {jobStatus === 'completed' && financials && (
        <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '8px' }}>
          <h2 style={{ color: '#4CAF50' }}>Job Completed!</h2>
          <h3 style={{ color: '#0056b3' }}>Your Net Earning: ₹{financials.provider_net_earning}</h3>
        </div>
      )}
    </div>
  );
}

// --- ADMIN DASHBOARD APP ---
function AdminApp({ authUser }) {
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await axios.get(import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin/dashboard');
        setDashboardData(response.data.data);
      } catch (error) {
        console.error("Dashboard Error", error);
      }
    };
    fetchDashboard();
  }, []);

  if (!authUser || authUser.role !== 'admin') return <Navigate to="/login" />;
  if (!dashboardData) return <div style={{ padding: '20px' }}>Loading Command Centre...</div>;

  return (
    <div style={{ padding: '20px', background: '#2c3e50', color: 'white', minHeight: '100vh' }}>
      <h1 style={{ color: '#ecf0f1', marginBottom: '20px', lineHeight: '1.2' }}>Med At Home<br/>Command Centre</h1>
      <p style={{ color: '#2ecc71' }}>Logged in as: {authUser.name}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
        <div style={{ background: '#34495e', padding: '20px', borderRadius: '8px', border: '1px solid #7f8c8d' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#3498db' }}>Financial Health</h3>
          <p style={{ margin: '5px 0' }}>Platform Revenue: <strong style={{ color: '#2ecc71', fontSize: '18px' }}>₹{dashboardData.marketplace_health.med_at_home_revenue}</strong></p>
        </div>
        <div style={{ background: '#34495e', padding: '20px', borderRadius: '8px', border: '1px solid #7f8c8d' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#3498db' }}>Network Supply</h3>
          <p style={{ margin: '5px 0' }}>Total Completed Jobs: {dashboardData.marketplace_health.total_completed_bookings}</p>
        </div>
      </div>
    </div>
  );
}

// --- MAIN ROUTER ---
function App() {
  const [authUser, setAuthUser] = useState(null); // Stores the logged-in user

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '480px', margin: '0 auto', border: '1px solid #ddd', minHeight: '100vh' }}>
      
      {/* Top Navigation */}
      {authUser && (
        <nav style={{ background: '#000', padding: '10px', display: 'flex', justifyContent: 'space-between', color: 'white' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Med At Home</span>
          <button onClick={() => setAuthUser(null)} style={{ background: 'transparent', color: 'red', border: 'none', cursor: 'pointer' }}>Logout</button>
        </nav>
      )}

      <Routes>
        <Route path="/login" element={<Login setAuthUser={setAuthUser} />} />
        <Route path="/" element={<CustomerApp authUser={authUser} />} />
        <Route path="/provider" element={<ProviderApp authUser={authUser} />} />
        <Route path="/admin" element={<AdminApp authUser={authUser} />} />
        
        {/* If user types random URL, send them to login */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </div>
  );
}

export default App;