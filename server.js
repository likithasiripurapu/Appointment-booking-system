const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'healthcare_secret_key_123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/healthcare';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Mode indicator
let dbMode = 'JSON'; // 'MongoDB' or 'JSON'
const JSON_DB_PATH = path.join(__dirname, 'db.json');

// In-Memory/JSON Database State
let localDB = {
  users: [],
  appointments: []
};

// Mongoose Schemas (used if MongoDB connects successfully)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['patient', 'doctor', 'receptionist', 'admin'] },
  specialty: { type: String }, // For doctors
  createdAt: { type: Date, default: Date.now }
});

const appointmentSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorId: { type: String, required: true },
  doctorName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  reason: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'cancelled', 'completed'] },
  createdAt: { type: Date, default: Date.now }
});

let UserModel;
let AppointmentModel;

// Helper to seed initial data in JSON DB or MongoDB
const seedData = async () => {
  const defaultUsers = [
    {
      name: 'System Admin',
      email: 'admin@healthcare.com',
      password: await bcrypt.hash('admin123', 10),
      role: 'admin'
    },
    {
      name: 'Dr. Sarah Smith',
      email: 'doctor@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Cardiology'
    },
    {
      name: 'Dr. Robert Jones',
      email: 'dr.jones@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Pediatrics'
    },
    {
      name: 'Dr. Emily Davis',
      email: 'dr.davis@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Neurology'
    },
    {
      name: 'Dr. James Wilson',
      email: 'dr.wilson@healthcare.com',
      password: await bcrypt.hash('doctor123', 10),
      role: 'doctor',
      specialty: 'Dermatology'
    },
    {
      name: 'Alice Cooper',
      email: 'receptionist@healthcare.com',
      password: await bcrypt.hash('receptionist123', 10),
      role: 'receptionist'
    },
    {
      name: 'John Doe',
      email: 'patient@healthcare.com',
      password: await bcrypt.hash('patient123', 10),
      role: 'patient'
    }
  ];

  if (dbMode === 'MongoDB') {
    try {
      const count = await UserModel.countDocuments();
      if (count === 0) {
        await UserModel.insertMany(defaultUsers);
        console.log('MongoDB successfully seeded with default users.');
      }
    } catch (err) {
      console.error('Error seeding MongoDB:', err);
    }
  } else {
    // Seed JSON Database
    if (!fs.existsSync(JSON_DB_PATH)) {
      localDB.users = defaultUsers.map((u, index) => ({
        id: (index + 1).toString(),
        ...u,
        createdAt: new Date().toISOString()
      }));
      localDB.appointments = [
        {
          id: 'appt1',
          patientId: '7',
          patientName: 'John Doe',
          doctorId: '2',
          doctorName: 'Dr. Sarah Smith',
          date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
          time: '10:00',
          reason: 'Routine cardiovascular checkup',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      console.log('JSON database created and seeded at:', JSON_DB_PATH);
    } else {
      try {
        const fileContent = fs.readFileSync(JSON_DB_PATH, 'utf-8');
        localDB = JSON.parse(fileContent);
        console.log('JSON database loaded successfully. Found', localDB.users.length, 'users.');
      } catch (err) {
        console.error('Error reading JSON DB, resetting...', err);
        fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
      }
    }
  }
};

// Attempt MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB at', MONGO_URI);
    dbMode = 'MongoDB';
    UserModel = mongoose.model('User', userSchema);
    AppointmentModel = mongoose.model('Appointment', appointmentSchema);
    seedData();
  })
  .catch(err => {
    console.log('MongoDB connection failed. Falling back to local JSON database.');
    console.log('Reason:', err.message);
    dbMode = 'JSON';
    seedData();
  });

// JSON Database Helper Methods
const jsonGetUsers = () => localDB.users;
const jsonGetUserByEmail = (email) => localDB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
const jsonGetUserById = (id) => localDB.users.find(u => u.id === id);
const jsonAddUser = (user) => {
  const newUser = { id: Date.now().toString(), ...user, createdAt: new Date().toISOString() };
  localDB.users.push(newUser);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
  return newUser;
};
const jsonGetAppointments = () => localDB.appointments;
const jsonAddAppointment = (appt) => {
  const newAppt = { id: Date.now().toString(), ...appt, status: 'pending', createdAt: new Date().toISOString() };
  localDB.appointments.push(newAppt);
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
  return newAppt;
};
const jsonUpdateAppointment = (id, status) => {
  const appt = localDB.appointments.find(a => a.id === id);
  if (appt) {
    appt.status = status;
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDB, null, 2));
    return appt;
  }
  return null;
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

/* --- API ROUTES --- */

// Register Patient
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailNorm = email.toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (dbMode === 'MongoDB') {
      const existingUser = await UserModel.findOne({ email: emailNorm });
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newUser = new UserModel({
        name,
        email: emailNorm,
        password: hashedPassword,
        role: 'patient'
      });
      await newUser.save();

      const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({
        token,
        user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role }
      });
    } else {
      const existingUser = jsonGetUserByEmail(emailNorm);
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newUser = jsonAddUser({
        name,
        email: emailNorm,
        password: hashedPassword,
        role: 'patient'
      });

      const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({
        token,
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailNorm = email.toLowerCase();

    if (dbMode === 'MongoDB') {
      const user = await UserModel.findOne({ email: emailNorm });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, specialty: user.specialty }
      });
    } else {
      const user = jsonGetUserByEmail(emailNorm);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get current user details
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (dbMode === 'MongoDB') {
      const user = await UserModel.findById(req.user.id).select('-password');
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } else {
      const user = jsonGetUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List Doctors
app.get('/api/doctors', async (req, res) => {
  try {
    if (dbMode === 'MongoDB') {
      const doctors = await UserModel.find({ role: 'doctor' }).select('name email specialty');
      res.json(doctors);
    } else {
      const doctors = jsonGetUsers()
        .filter(u => u.role === 'doctor')
        .map(u => ({ id: u.id, name: u.name, email: u.email, specialty: u.specialty }));
      res.json(doctors);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching doctors' });
  }
});

// Get/List Appointments (Filtered by Auth user and role)
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    if (dbMode === 'MongoDB') {
      let query = {};
      if (role === 'patient') {
        query = { patientId: id };
      } else if (role === 'doctor') {
        query = { doctorId: id };
      }
      // Admins and Receptionists see all appointments
      const appts = await AppointmentModel.find(query).sort({ date: 1, time: 1 });
      res.json(appts);
    } else {
      let appts = jsonGetAppointments();
      if (role === 'patient') {
        appts = appts.filter(a => a.patientId === id);
      } else if (role === 'doctor') {
        appts = appts.filter(a => a.doctorId === id);
      }
      // Sort: date ascending, time ascending
      appts.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      res.json(appts);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});

// Create Appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { doctorId, doctorName, date, time, reason } = req.body;
    if (!doctorId || !doctorName || !date || !time || !reason) {
      return res.status(400).json({ error: 'Missing required booking details' });
    }

    // Get Patient details from current auth context
    let patientName = '';
    const patientId = req.user.id;

    if (dbMode === 'MongoDB') {
      const patient = await UserModel.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const newAppt = new AppointmentModel({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date,
        time,
        reason,
        status: 'pending'
      });
      await newAppt.save();
      res.status(201).json(newAppt);
    } else {
      const patient = jsonGetUserById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient account not found' });
      patientName = patient.name;

      const newAppt = jsonAddAppointment({
        patientId,
        patientName,
        doctorId,
        doctorName,
        date,
        time,
        reason
      });
      res.status(201).json(newAppt);
    }
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Server error booking appointment' });
  }
});

// Update Appointment Status
app.put('/api/appointments/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;

    if (!['pending', 'approved', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Authorization constraints:
    // Patients can only cancel their own appointments
    // Doctors, Receptionists, Admins can approve/cancel/complete
    if (dbMode === 'MongoDB') {
      const appt = await AppointmentModel.findById(id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });

      if (userRole === 'patient') {
        if (appt.patientId !== req.user.id) {
          return res.status(403).json({ error: 'Unauthorized to modify this appointment' });
        }
        if (status !== 'cancelled') {
          return res.status(403).json({ error: 'Patients can only cancel appointments' });
        }
      }

      appt.status = status;
      await appt.save();
      res.json(appt);
    } else {
      const appts = jsonGetAppointments();
      const appt = appts.find(a => a.id === id);
      if (!appt) return res.status(404).json({ error: 'Appointment not found' });

      if (userRole === 'patient') {
        if (appt.patientId !== req.user.id) {
          return res.status(403).json({ error: 'Unauthorized to modify this appointment' });
        }
        if (status !== 'cancelled') {
          return res.status(403).json({ error: 'Patients can only cancel appointments' });
        }
      }

      const updated = jsonUpdateAppointment(id, status);
      res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error updating status' });
  }
});

// Admin System Stats
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (dbMode === 'MongoDB') {
      const totalPatients = await UserModel.countDocuments({ role: 'patient' });
      const totalDoctors = await UserModel.countDocuments({ role: 'doctor' });
      const totalStaff = await UserModel.countDocuments({ role: 'receptionist' });
      const totalAppointments = await AppointmentModel.countDocuments();
      const pendingAppointments = await AppointmentModel.countDocuments({ status: 'pending' });

      res.json({
        totalPatients,
        totalDoctors,
        totalStaff,
        totalAppointments,
        pendingAppointments,
        dbMode
      });
    } else {
      const users = jsonGetUsers();
      const appts = jsonGetAppointments();

      res.json({
        totalPatients: users.filter(u => u.role === 'patient').length,
        totalDoctors: users.filter(u => u.role === 'doctor').length,
        totalStaff: users.filter(u => u.role === 'receptionist').length,
        totalAppointments: appts.length,
        pendingAppointments: appts.filter(a => a.status === 'pending').length,
        dbMode
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching statistics' });
  }
});

// Admin User Management - List Users
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (dbMode === 'MongoDB') {
      const users = await UserModel.find().select('-password').sort({ createdAt: -1 });
      res.json(users);
    } else {
      const usersWithoutPassword = jsonGetUsers().map(({ password, ...u }) => u);
      usersWithoutPassword.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json(usersWithoutPassword);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin User Management - Create Staff User
app.post('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, email, password, role, specialty } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required user details' });
    }

    if (!['doctor', 'receptionist', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid staff role' });
    }

    const emailNorm = email.toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (dbMode === 'MongoDB') {
      const existingUser = await UserModel.findOne({ email: emailNorm });
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newStaff = new UserModel({
        name,
        email: emailNorm,
        password: hashedPassword,
        role,
        specialty: role === 'doctor' ? specialty : undefined
      });
      await newStaff.save();
      const { password: _, ...savedUser } = newStaff.toObject();
      res.status(201).json(savedUser);
    } else {
      const existingUser = jsonGetUserByEmail(emailNorm);
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const newStaff = jsonAddUser({
        name,
        email: emailNorm,
        password: hashedPassword,
        role,
        specialty: role === 'doctor' ? specialty : undefined
      });
      const { password: _, ...savedUser } = newStaff;
      res.status(201).json(savedUser);
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error creating staff account' });
  }
});

// Fallback all other routes to index.html (supporting client-side SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`Smart Healthcare System running on port ${PORT}`);
  console.log(`Backend Mode: Database is running on ${dbMode} fallback`);
  console.log(`Frontend served at http://localhost:${PORT}`);
  console.log('==================================================');
});
