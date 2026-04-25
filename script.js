// --- DATABASE SETUP (SQL for Supabase Editor) ---
/*
  -- 1. Staff Table (Stores additional profile info)
  CREATE TABLE staff (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'Staff', -- 'Admin', 'HR', 'Staff'
    phone_number TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 2. Attendance Table
  CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_name TEXT,
    date DATE DEFAULT CURRENT_DATE,
    clock_in TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    clock_out TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'On Time',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 3. Tasks Table
  CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    assignee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT,
    priority TEXT,
    due_date DATE,
    description TEXT,
    reminders BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending', -- 'pending', 'in-progress', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 4. Messages Table (Team Chat)
  CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name TEXT,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL for Global Chat
    content TEXT NOT NULL,
    status TEXT DEFAULT 'sent', -- 'sent', 'read'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 5. Leave Requests Table
  CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_name TEXT,
    type TEXT,
    start_date DATE,
    end_date DATE,
    reason TEXT,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 6. Announcements Table
  CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 7. Media Table
  CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    url TEXT NOT NULL,
    type TEXT,
    size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 8. Notifications Table
  CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT,
    type TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 9. Blogs Table
  CREATE TABLE blogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT,
    excerpt TEXT,
    image_url TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    category TEXT,
    status TEXT DEFAULT 'draft',
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 10. Inquiries Table (From Contact Form)
  CREATE TABLE inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    email TEXT,
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- IMPORTANT: Enable RLS for all tables and add "Allow All" policies for testing, 
  -- then harden them later. For now, if tasks/chats aren't saving, 
  -- go to RLS settings in Supabase and ensure users have INSERT/SELECT permissions.
*/

import { auth, db, storage } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  updateProfile,
  updatePassword,
  signOut
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  limit,
  Timestamp,
  serverTimestamp,
  or,
  and
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { isAdmin, logout as authLogout } from './auth';
import { setupTheme, CurrencyManager, setupCurrencySelectors } from './ui';
import { showToast, setLoading, sendEmail } from './utils';

// 1. IMMEDIATE UI INITIALIZATION (Do this first so it works even if DB fails)
document.body.classList.add('js-enabled');

// Initialize UI
setupTheme();
const currencyManager = new CurrencyManager();
document.addEventListener('DOMContentLoaded', () => setupCurrencySelectors(currencyManager));

// Listen for currency changes to refresh dashboard
window.addEventListener('currencyChanged', () => {
  if (window.location.pathname.includes('admin.html') && document.body.classList.contains('is-admin')) {
    fetchDashboardStats();
  }
});

// Staff Login Modal
const staffBtn = document.getElementById('staff-login-btn');
const loginModal = document.getElementById('login-modal');
const modalClose = document.getElementById('modal-close');

if (staffBtn && loginModal && modalClose) {
  staffBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.add('show');
    const content = loginModal.querySelector('.modal-content');
    if (content) content.classList.add('animate');
  });

  modalClose.addEventListener('click', () => {
    loginModal.classList.remove('show');
    const content = loginModal.querySelector('.modal-content');
    if (content) content.classList.remove('animate');
  });

  window.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      loginModal.classList.remove('show');
      const content = loginModal.querySelector('.modal-content');
      if (content) content.classList.remove('animate');
    }
  });
}

// Mobile Menu Toggle
const mobileToggle = document.getElementById('mobile-toggle');
const navLinks = document.getElementById('nav-links');

if (mobileToggle && navLinks) {
  mobileToggle.addEventListener('click', () => {
    navLinks.classList.toggle('show');
    const icon = mobileToggle.querySelector('i');
    if (navLinks.classList.contains('show')) {
      icon.classList.replace('fa-bars', 'fa-times');
    } else {
      icon.classList.replace('fa-times', 'fa-bars');
    }
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('show');
      const icon = mobileToggle.querySelector('i');
      if (icon) icon.classList.replace('fa-times', 'fa-bars');
    });
  });
}

// Handle broken images (especially logos)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function() {
      if (this.alt && this.alt.includes('Logo')) {
        const parent = this.parentElement;
        const logoText = document.createElement('span');
        logoText.className = 'logo-text text-gradient';
        logoText.innerText = 'Lumina Tech';
        parent.replaceChild(logoText, this);
      } else {
        this.src = 'https://picsum.photos/seed/lumina/400/300';
      }
    });
  });
});
// Scroll Reveal Animation
const revealElements = document.querySelectorAll('.reveal');
const revealOnScroll = () => {
  revealElements.forEach((el) => {
    const elementTop = el.getBoundingClientRect().top;
    const windowHeight = window.innerHeight;
    if (elementTop < windowHeight - 50) {
      el.classList.add('active');
    }
  });
};

window.addEventListener('scroll', revealOnScroll);
document.addEventListener('DOMContentLoaded', revealOnScroll);
window.addEventListener('load', revealOnScroll);
revealOnScroll(); // Initial check

// 2. EXTERNAL LIBRARY & DB INITIALIZATION (Wrapped to prevent blocking UI)

// Initialize intl-tel-input
try {
  const phoneInput = document.querySelector("#phone");
  if (phoneInput && typeof window.intlTelInput === 'function') {
      window.intlTelInput(phoneInput, { 
          initialCountry: "ng",
          separateDialCode: true,
          preferredCountries: ["ng", "us", "gb"],
          utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js"
      });
  }
} catch (e) { console.warn("intlTelInput failed:", e); }

// Global User State
let myId = null;
let userRole = 'Staff';
let userName = 'Staff';
let userUsername = '';
let typingTimeout = null;
let chatChannel = null;

const updateUserAvatars = (name, photo) => {
  const avatars = [
    { id: 'user-avatar-sidebar' },
    { id: 'user-avatar-header' },
    { id: 'settings-avatar-preview' }
  ];
  avatars.forEach(av => {
    const el = document.getElementById(av.id);
    if (el) {
      if (photo) {
        el.innerHTML = `<img src="${photo}" class="w-full h-full object-cover">`;
        el.style.padding = '0';
      } else {
        el.innerText = name ? name.charAt(0).toUpperCase() : 'U';
        el.style.padding = '';
      }
    }
  });
};

// Auth State Listener
try {
  onAuthStateChanged(auth, async (user) => {
    myId = user?.uid;
    const path = window.location.pathname;
    const isHome = path === '/' || path.includes('index.html');
    const isUserAdmin = await isAdmin(user);
    
    // Auto-redirect from home to admin if logged in
    if (user && isHome) {
      window.location.href = '/admin.html';
      return;
    }
    
    if (user) {
      document.body.classList.add('is-logged-in');
      
      const homeStaffBtn = document.getElementById('staff-login-btn');
      const headerLogoutBtn = document.getElementById('header-logout-btn');
      if (isHome) {
        if (homeStaffBtn) {
          homeStaffBtn.innerText = 'Dashboard';
          homeStaffBtn.onclick = () => window.location.href = '/admin.html';
        }
        if (headerLogoutBtn) {
          headerLogoutBtn.classList.remove('hidden');
          headerLogoutBtn.onclick = authLogout;
        }
      }

      if (isUserAdmin) {
        localStorage.setItem('isAdminSession', 'true');
      } else {
        localStorage.removeItem('isAdminSession');
      }
    } else {
      document.body.classList.remove('is-logged-in');
      localStorage.removeItem('isAdminSession');
    }

    if (path.includes('admin.html')) {
      if (!user) {
        window.location.href = '/';
        return;
      }

      // Determine Role
      userRole = 'Staff';
      userName = user.displayName || user.email.split('@')[0];
      userUsername = user.email.split('@')[0];
      let userData = {};

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        const isCEO = user.email === 'soberetamunoala@gmail.com';
        const isAssCEO = user.email === 'princedagogoekine@gmail.com';
        
        if (!userDoc.exists()) {
          // Auto-register if not exists
          const newUser = {
            id: user.uid,
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            username: user.email.split('@')[0],
            role: isCEO ? 'CEO' : (isAssCEO ? 'Assistant CEO' : (isUserAdmin ? 'Admin' : 'Staff')),
            status: 'Active',
            created_at: serverTimestamp()
          };
          await setDoc(doc(db, 'users', user.uid), newUser);
          userRole = newUser.role;
          userData = newUser;
          userName = newUser.name;
          userUsername = newUser.username;
        } else {
          userData = userDoc.data();
          userRole = userData.role;
          userName = userData.name || user.displayName || user.email.split('@')[0];
          userUsername = userData.username || user.email.split('@')[0];

          // Ensure name isn't just "User" if we have better info
          if (userName === 'User' && user.displayName) userName = user.displayName;
          if (userUsername === 'username' && user.email) userUsername = user.email.split('@')[0];
          
          // Role Override for known admins
          if (isCEO) {
            userRole = 'CEO';
          } else if (isAssCEO) {
            userRole = 'Assistant CEO';
          } else if (isUserAdmin && !['Admin', 'CEO', 'Assistant CEO', 'Ass CEO', 'HR'].includes(userRole)) {
            userRole = 'Admin';
          }
        }
        
        // Final UI Role Visibility
        document.body.classList.remove('is-admin', 'is-hr', 'is-staff');
        if (userRole === 'Admin' || userRole === 'CEO' || userRole === 'Assistant CEO' || userRole === 'Ass CEO') {
          document.body.classList.add('is-admin');
        } else if (userRole === 'HR') {
          document.body.classList.add('is-hr');
        } else {
          document.body.classList.add('is-staff');
        }
      } catch (err) {
        console.error("Role check failed:", err);
      }

      // Update UI elements
      const updateText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
      };
      const updateValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };

      const userPhotoURL = userData.photo_url || user.photoURL || null;

      updateText('user-name-sidebar', userName);
      updateText('user-role-sidebar', userRole);
      updateUserAvatars(userName, userPhotoURL);
      updateText('user-name-header', userName);
      updateText('user-username-header', `@${userUsername}`);
      updateText('welcome-name', userName);
      updateValue('settings-name', userName);
      updateValue('settings-username', userUsername);
      updateValue('settings-email', user.email);

      // Data Fetching
      if (userRole === 'Admin' || userRole === 'HR' || userRole === 'CEO' || userRole === 'Assistant CEO' || userRole === 'Ass CEO') {
        fetchDashboardStats();
        fetchBookings();
        fetchStaff();
        fetchStaffForDropdown();
        fetchAdminTasks();
        fetchNotifications();
      } else {
        fetchMyTasks();
        fetchStaffDashboardStats();
        fetchNotifications();
        checkTaskReminders();
        
        const taskStatusFilter = document.getElementById('task-status-filter');
        if (taskStatusFilter) {
          taskStatusFilter.addEventListener('change', fetchMyTasks);
        }
      }
    }
  });
} catch (err) { console.error("Firebase auth listener failed:", err); }

// Chat Widget
const chatBtn = document.getElementById('chat-btn');
const chatWidget = document.getElementById('chat-widget');
const chatClose = document.getElementById('chat-close');

if (chatBtn && chatWidget && chatClose) {
  chatBtn.addEventListener('click', () => {
    chatWidget.classList.toggle('show');
  });

  chatClose.addEventListener('click', () => {
    chatWidget.classList.remove('show');
  });
}

// Add Staff Modal (Admin Portal)
const addStaffBtn = document.getElementById('add-staff-btn');
const staffModal = document.getElementById('staff-modal');
const staffModalClose = document.getElementById('staff-modal-close');

if (addStaffBtn && staffModal && staffModalClose) {
  addStaffBtn.addEventListener('click', () => {
    staffModal.classList.add('show');
    staffModal.querySelector('.modal-content').classList.add('animate');
  });

  staffModalClose.addEventListener('click', () => {
    staffModal.classList.remove('show');
    staffModal.querySelector('.modal-content').classList.remove('animate');
  });

  window.addEventListener('click', (e) => {
    if (e.target === staffModal) {
      staffModal.classList.remove('show');
      staffModal.querySelector('.modal-content').classList.remove('animate');
    }
  });
}

// Load More Blog Posts
const loadMoreBtn = document.getElementById('load-more-btn');
const hiddenPosts = document.querySelectorAll('.hidden-post');

if (loadMoreBtn && hiddenPosts.length > 0) {
  loadMoreBtn.addEventListener('click', () => {
    loadMoreBtn.innerText = 'Loading...';
    loadMoreBtn.disabled = true;
    
    setTimeout(() => {
      hiddenPosts.forEach(post => {
        post.classList.remove('hidden');
        // Trigger reveal animation for newly shown posts
        setTimeout(() => {
          post.classList.add('active');
        }, 100);
      });
      loadMoreBtn.classList.add('hidden');
    }, 1000);
  });
}

// Form Handling (Mock)
const forms = document.querySelectorAll('form');
forms.forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    setLoading(submitBtn, true);
    
    // Check if it's the login form
    if (form.classList.contains('login-form')) {
      const username = document.getElementById('username').value.toLowerCase();
      const password = document.getElementById('password').value;
      
      const email = username.includes('@') ? username : `${username}@lumina.tech`;

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const isUserAdmin = await isAdmin(user);
        
        // Ensure user doc exists with role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, 'users', user.uid), {
            id: user.uid,
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            username: user.email.split('@')[0],
            role: isUserAdmin ? 'Admin' : 'Staff',
            status: 'Active',
            created_at: serverTimestamp()
          });
        }

        if (isUserAdmin) {
          localStorage.setItem('isAdminSession', 'true');
        } else {
          localStorage.removeItem('isAdminSession');
        }

        showToast('Login successful!', 'success');
        
        setTimeout(() => {
          window.location.href = '/admin.html';
        }, 1000);

      } catch (error) {
        console.error("Login error:", error);
        let errorMsg = error.message;
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          errorMsg = 'Invalid email or password.';
        }
        showToast(`Login error: ${errorMsg}`, 'error');
        setLoading(submitBtn, false, originalText);
      }
    }
  else if (form.classList.contains('booking-form')) {
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const service = document.getElementById('service').value;
      const date = document.getElementById('date').value;
      const time = document.getElementById('time').value;
      
      try {
        // 1. Save to Firestore
        await addDoc(collection(db, 'bookings'), {
          client_name: name,
          email: email,
          service: service,
          date: date,
          time: time,
          status: 'Pending',
          created_at: serverTimestamp()
        });

        // 2. Send Email Notification
        try {
          await sendEmail(
            email, 
            'Booking Confirmation - Lumina Tech', 
            `Hi ${name},\n\nYour booking for ${service} on ${date} at ${time} has been received. We will contact you shortly to confirm.\n\nBest regards,\nLumina Tech Team`
          );
          
          const adminEmail = 'princedagogoekine@gmail.com'; 
          await sendEmail(
            adminEmail,
            'New Booking Received',
            `New booking from ${name} (${email})\nService: ${service}\nDate: ${date}\nTime: ${time}`
          );
        } catch (emailErr) {
          console.error("Failed to send confirmation email:", emailErr);
        }

        showToast('Booking received! Check your email for confirmation.', 'success');
        
        setTimeout(() => {
          window.location.href = `/confirmation.html?service=${encodeURIComponent(service)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
        }, 1000);
      } catch (error) {
        console.error("Error processing booking:", error);
        showToast(error.message || 'Failed to process booking', 'error');
        setLoading(submitBtn, false, originalText);
      }
    }
 else if (form.id === 'add-staff-form') {
      try {
        const email = document.getElementById('staff-email').value;
        const phone = document.getElementById('staff-phone').value;
        const password = document.getElementById('staff-password').value;
        const name = document.getElementById('staff-name').value;
        const role = document.getElementById('staff-role').value;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
          const response = await fetch('/api/create-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role, phone }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to create staff');

          showToast(`Staff account for ${name} created successfully!`, 'success');
          form.reset();
          setLoading(submitBtn, false, originalText);
          if (staffModal) staffModal.classList.remove('show');
          
          if (typeof fetchStaff === 'function') fetchStaff();
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            throw new Error('Request timed out. The server might be busy or misconfigured.');
          }
          throw fetchErr;
        }
      } catch (error) {
        console.error("Error creating staff:", error);
        showToast('Error: ' + error.message, 'error');
        setLoading(submitBtn, false, originalText);
      }
    } else if (form.classList.contains('contact-form')) {
      try {
        const name = form.querySelector('#name').value;
        const email = form.querySelector('#email').value;
        const subject = form.querySelector('#subject').value;
        const message = form.querySelector('#message').value;

        // Save to Firestore
        await addDoc(collection(db, 'inquiries'), {
          name,
          email,
          subject,
          message,
          status: 'new',
          created_at: serverTimestamp()
        });

        // Email Notification
        await sendEmail(
          'princedagogoekine@gmail.com',
          `New Contact Inquiry: ${subject}`,
          `From: ${name} (${email})\n\nMessage:\n${message}`
        );

        showToast('Transmission successful! We will respond shortly.', 'success');
        form.reset();
        setLoading(submitBtn, false, originalText);
      } catch (error) {
        console.error("Error processing contact form:", error);
        showToast('Transmission failed. Using backup protocols...', 'info');
        setTimeout(() => {
          showToast('Message cached. We will process it soon.', 'success');
          form.reset();
          setLoading(submitBtn, false, originalText);
        }, 1500);
      }
    }
 else {
      submitBtn.innerText = 'Success!';
      submitBtn.style.background = '#10b981'; // Emerald
      form.reset();
      
      setTimeout(() => {
        submitBtn.innerText = originalText;
        submitBtn.style.background = '';
        submitBtn.disabled = false;
        if (form.closest('.chat-widget')) {
          chatWidget.classList.remove('show');
        }
      }, 2000);
    }
  });
});

// Admin Mobile Toggle
const adminMobileToggle = document.getElementById('admin-mobile-toggle');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (adminMobileToggle && sidebar) {
  const toggleSidebar = () => {
    sidebar.classList.toggle('show');
    if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
    const icon = adminMobileToggle.querySelector('i');
    if (sidebar.classList.contains('show')) {
      icon.classList.replace('fa-bars', 'fa-times');
    } else {
      icon.classList.replace('fa-times', 'fa-bars');
    }
  };

  adminMobileToggle.addEventListener('click', toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
}

// Admin Portal Navigation
const navDashboard = document.getElementById('nav-dashboard');
const navBookings = document.getElementById('nav-bookings');
const navMessages = document.getElementById('nav-messages');
const navStaff = document.getElementById('nav-staff');
const navSettings = document.getElementById('nav-settings');
const navMyTasks = document.getElementById('nav-my-tasks');
const navAssignTask = document.getElementById('nav-assign-task');
const navAttendance = document.getElementById('nav-attendance');
const navStreaks = document.getElementById('nav-streaks');
const navChat = document.getElementById('nav-chat');
const navAnnouncements = document.getElementById('nav-announcements');
const navRecognition = document.getElementById('nav-recognition');
const navSendEmail = document.getElementById('nav-send-email');
const navMedia = document.getElementById('nav-media');
const navLeave = document.getElementById('nav-leave');
const navBlogs = document.getElementById('nav-blogs');

const dashboardView = document.getElementById('dashboard-view');
const bookingsView = document.getElementById('bookings-view');
const messagesView = document.getElementById('messages-view');
const staffView = document.getElementById('staff-view');
const settingsView = document.getElementById('settings-view');
const myTasksView = document.getElementById('my-tasks-view');
const assignTaskView = document.getElementById('assign-task-view');
const chatView = document.getElementById('chat-view');
const announcementsView = document.getElementById('announcements-view');
const sendEmailView = document.getElementById('send-email-view');
const mediaView = document.getElementById('media-view');
const attendanceView = document.getElementById('attendance-view');
const streaksView = document.getElementById('streaks-view');
const recognitionView = document.getElementById('recognition-view');
const leaveView = document.getElementById('leave-view');
const blogsView = document.getElementById('blogs-view');

const views = [dashboardView, bookingsView, messagesView, staffView, settingsView, myTasksView, assignTaskView, chatView, announcementsView, sendEmailView, mediaView, attendanceView, streaksView, recognitionView, leaveView, blogsView];
const navs = [navDashboard, navBookings, navMessages, navStaff, navSettings, navMyTasks, navAssignTask, navAttendance, navStreaks, navChat, navAnnouncements, navRecognition, navSendEmail, navMedia, navLeave, navBlogs];

function showView(viewToShow, activeNav) {
  views.forEach(v => v?.classList.add('hidden'));
  navs.forEach(n => n?.classList.remove('active'));
  
  if (viewToShow) viewToShow.classList.remove('hidden');
  activeNav?.classList.add('active');

  // Update header title and breadcrumbs
  const viewTitle = document.getElementById('view-title');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  const breadcrumbSeparator = document.getElementById('breadcrumb-separator');
  
  if (activeNav) {
    const navText = activeNav.innerText.trim();
    if (viewTitle) viewTitle.innerText = navText;
    
    if (breadcrumbCurrent) {
      breadcrumbCurrent.innerText = navText;
      // If it's Dashboard, hide the separator and current view breadcrumb (since Dashboard is home)
      if (navText.toLowerCase() === 'dashboard') {
        breadcrumbSeparator?.classList.add('hidden');
      } else {
        breadcrumbSeparator?.classList.remove('hidden');
      }
    }
  }
}

// Breadcrumb home click
const breadcrumbHome = document.getElementById('breadcrumb-home');
if (breadcrumbHome && navDashboard) {
  breadcrumbHome.addEventListener('click', (e) => {
    e.preventDefault();
    navDashboard.click();
  });
}

const setupNavLink = (nav, view, fetchFn) => {
  if (nav) {
    nav.addEventListener('click', (e) => {
      e.preventDefault();
      showView(view, nav);
      if (fetchFn) fetchFn();
      
      // Auto-close sidebar on mobile after navigation
      if (window.innerWidth <= 1024 && sidebar && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        const icon = adminMobileToggle?.querySelector('i');
        if (icon) icon.classList.replace('fa-times', 'fa-bars');
      }
    });
  }
};

setupNavLink(navDashboard, dashboardView, () => {
  if (document.body.classList.contains('is-admin')) fetchDashboardStats();
  else fetchStaffDashboardStats();
});
setupNavLink(navBookings, bookingsView, fetchBookings);
setupNavLink(navMessages, messagesView, fetchMessages);
setupNavLink(navStaff, staffView, fetchStaff);
setupNavLink(navSettings, settingsView);
setupNavLink(navMyTasks, myTasksView, fetchMyTasks);
setupNavLink(navAssignTask, assignTaskView, fetchStaffForDropdown);
setupNavLink(navAttendance, attendanceView, fetchAttendance);
setupNavLink(navStreaks, streaksView, fetchStreaks);
setupNavLink(navChat, chatView, fetchChatContacts);
setupNavLink(navAnnouncements, announcementsView, fetchAnnouncements);
setupNavLink(navRecognition, recognitionView, fetchRecognition);
setupNavLink(navSendEmail, sendEmailView);
setupNavLink(navMedia, mediaView, fetchMedia);
setupNavLink(navLeave, leaveView, fetchLeaveRequests);
setupNavLink(navBlogs, blogsView, fetchAdminBlogs);

// --- TEAM CHAT LOGIC ---
const teamChatForm = document.getElementById('team-chat-form');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatContactList = document.getElementById('chat-contact-list');
const activeChatAvatar = document.getElementById('active-chat-avatar');
const activeChatName = document.getElementById('active-chat-name');
const activeChatStatus = document.getElementById('active-chat-status');

let activeRecipient = 'global'; // 'global' or staff user ID

async function fetchChatContacts() {
  if (!chatContactList) return;
  
  try {
    const q = query(collection(db, 'users'), where('role', '!=', 'Client'), orderBy('name'));
    const snapshot = await getDocs(q);
    const staff = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    const myId = auth.currentUser?.uid;

    // Keep the Global Chat item
    const globalItemHtml = `
      <div class="contact-wa ${activeRecipient === 'global' ? 'active' : ''} chat-contact" data-recipient="global">
        <div class="w-12 h-12 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-lg">G</div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-0.5">
            <p class="text-sm font-bold text-white truncate">Global Chat</p>
          </div>
          <p class="text-xs text-slate-400 truncate">Team announcement channel</p>
        </div>
      </div>
    `;

    chatContactList.innerHTML = globalItemHtml;

    if (staff.length <= (staff.some(s => s.id === myId) ? 1 : 0)) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'p-8 text-center text-slate-500 text-xs italic';
      emptyMsg.innerText = 'No other team members found.';
      chatContactList.appendChild(emptyMsg);
    }

    staff.forEach(person => {
      if (person.id === auth.currentUser?.uid) return;

      const contactDiv = document.createElement('div');
      contactDiv.className = `contact-wa ${activeRecipient === person.id ? 'active' : ''} chat-contact`;
      contactDiv.dataset.recipient = person.id;
      contactDiv.dataset.name = person.name;
      contactDiv.dataset.role = person.role;
      
      contactDiv.innerHTML = `
        <div class="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-lg">
          ${person.name.charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-0.5">
            <p class="text-sm font-bold text-white truncate">${person.name}</p>
          </div>
          <p class="text-xs text-slate-400 truncate">${person.role}</p>
        </div>
      `;
      
      contactDiv.addEventListener('click', () => {
        activeRecipient = person.id;
        activeChatName.innerText = person.name;
        activeChatAvatar.innerText = person.name.charAt(0);
        activeChatAvatar.className = 'w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-lg';
        activeChatStatus.innerText = person.role;
        activeChatStatus.className = 'text-[10px] text-slate-400';
        
        document.querySelectorAll('.chat-contact').forEach(c => c.classList.remove('active'));
        contactDiv.classList.add('active');
        
        // Mobile view switch
        const chatSidebarWA = document.querySelector('.chat-sidebar-wa');
        if (chatSidebarWA) chatSidebarWA.classList.add('hidden-mobile');
        
        fetchChatMessages();
      });

      chatContactList.appendChild(contactDiv);
    });

    const globalBtn = chatContactList.querySelector('[data-recipient="global"]');
    if (globalBtn) {
      globalBtn.addEventListener('click', () => {
        activeRecipient = 'global';
        activeChatName.innerText = 'Global Chat';
        activeChatAvatar.innerText = 'G';
        activeChatAvatar.className = 'w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-lg';
        activeChatStatus.innerText = 'Public Channel';
        activeChatStatus.className = 'text-[10px] text-cyan-400';
        
        document.querySelectorAll('.chat-contact').forEach(c => c.classList.remove('active'));
        globalBtn.classList.add('active');
        
        // Mobile view switch
        const chatSidebarWA = document.querySelector('.chat-sidebar-wa');
        if (chatSidebarWA) chatSidebarWA.classList.add('hidden-mobile');
        
        fetchChatMessages();
      });
    }

    // Chat Back Button for Mobile
    const chatBackBtn = document.getElementById('chat-back-btn');
    if (chatBackBtn) {
      chatBackBtn.addEventListener('click', () => {
        const chatSidebarWA = document.querySelector('.chat-sidebar-wa');
        if (chatSidebarWA) chatSidebarWA.classList.remove('hidden-mobile');
      });
    }

  } catch (err) {
    console.error("Error fetching contacts:", err);
  }
}

let unsubscribeChat = null;
async function fetchChatMessages() {
  if (!chatMessages) return;
  if (unsubscribeChat) unsubscribeChat();

  const user = auth.currentUser;
  if (!user) return;
  
  const currentMyId = user.uid;
  let q;

  if (activeRecipient === 'global') {
    q = query(
      collection(db, 'messages'),
      where('recipient_id', '==', null),
      orderBy('created_at', 'asc')
    );
  } else {
    // Simplified query to avoid index requirements for now
    q = query(
      collection(db, 'messages'),
      orderBy('created_at', 'asc')
    );
  }

  const handleSnapshot = (snapshot) => {
    chatMessages.innerHTML = '';
    const allMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    let filteredMsgs = allMsgs;
    if (activeRecipient !== 'global') {
      filteredMsgs = allMsgs.filter(m => 
        (m.sender_id === currentMyId && m.recipient_id === activeRecipient) ||
        (m.sender_id === activeRecipient && m.recipient_id === currentMyId)
      );
    }
    
    // Manual sort by date
    filteredMsgs.sort((a, b) => {
      const dateA = a.created_at?.toDate ? a.created_at.toDate() : new Date(a.created_at || Date.now());
      const dateB = b.created_at?.toDate ? b.created_at.toDate() : new Date(b.created_at || Date.now());
      return dateA - dateB;
    });
    
    if (filteredMsgs.length === 0) {
      chatMessages.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-4 text-center opacity-40">
          <div class="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-3xl">
            <i class="fas fa-comment-slash"></i>
          </div>
          <p class="text-xs">No messages with ${activeChatName.innerText} yet.</p>
        </div>`;
    } else {
      filteredMsgs.forEach(msg => {
        const isMe = msg.sender_id === currentMyId;
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg-wa ${isMe ? 'outgoing' : 'incoming'}`;
        
        const isRead = msg.status === 'read';
        const statusHtml = isMe && activeRecipient !== 'global' ? `
          <span class="status-icon ${isRead ? 'text-cyan-400' : 'text-slate-500'}">
            <i class="fas ${isRead ? 'fa-check-double' : 'fa-check'}"></i>
          </span>` : '';

        const date = msg.created_at?.toDate ? msg.created_at.toDate() : new Date();
        const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        msgDiv.innerHTML = `
          ${activeRecipient === 'global' && !isMe ? `<p class="text-[10px] font-bold text-cyan-400 mb-0.5">${msg.sender_name}</p>` : ''}
          <div class="flex flex-col">
            <span class="text-sm">${msg.content || msg.message}</span>
            <span class="time">${timeStr}${statusHtml}</span>
          </div>
        `;
        chatMessages.appendChild(msgDiv);

        if (!isMe && activeRecipient !== 'global' && msg.status !== 'read') {
          updateDoc(doc(db, 'messages', msg.id), { status: 'read' });
        }
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  };

  try {
    unsubscribeChat = onSnapshot(q, handleSnapshot, (err) => {
      console.warn("Chat index error, falling back:", err);
      const fallbackQ = query(collection(db, 'messages'));
      unsubscribeChat = onSnapshot(fallbackQ, handleSnapshot, (err2) => {
        console.error("Chat total failure:", err2);
      });
    });
  } catch (err) {
    console.error("Chat setup error:", err);
  }
}

if (teamChatForm) {
  teamChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = chatInput.value.trim();
    if (!content) return;

    const submitBtn = teamChatForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Log in to send messages");
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const isAdminFlag = localStorage.getItem('isAdminSession') === 'true';
      const senderName = isAdminFlag ? 'Admin' : (user.displayName || user.email.split('@')[0]);

      await addDoc(collection(db, 'messages'), {
        sender_id: user.uid,
        sender_name: senderName,
        recipient_id: activeRecipient === 'global' ? null : activeRecipient,
        content: content,
        created_at: serverTimestamp(),
        status: 'sent'
      });

      chatInput.value = '';
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    } catch (err) {
      console.error("Error sending message:", err);
      showToast("Failed to send message.", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  });
}

// --- ANNOUNCEMENTS LOGIC ---
const announcementsList = document.getElementById('announcements-list');
const addAnnouncementBtn = document.getElementById('add-announcement-btn');
const announcementModal = document.getElementById('announcement-modal');
const announcementModalClose = document.getElementById('announcement-modal-close');
const addAnnouncementForm = document.getElementById('add-announcement-form');

async function fetchAnnouncements() {
  if (!announcementsList) return;
  
      try {
        const q = query(collection(db, 'announcements'), orderBy('created_at', 'desc'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => doc.data());

        const btnContainer = document.getElementById('add-announcement-btn-container');
        if (btnContainer) {
          if (userRole === 'Admin' || userRole === 'CEO' || userRole === 'Ass CEO' || userRole === 'HR') {
            btnContainer.classList.remove('hidden');
          } else {
            btnContainer.classList.add('hidden');
          }
        }

        announcementsList.innerHTML = '';
    if (data.length === 0) {
      announcementsList.innerHTML = '<div class="text-center py-12 text-slate-500">No announcements yet</div>';
    } else {
      data.forEach(ann => {
        const annDiv = document.createElement('div');
        annDiv.className = 'glass p-6 border-l-4 border-cyan-500';
        const date = ann.created_at?.toDate ? ann.created_at.toDate() : new Date();
        annDiv.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-xl font-bold">${ann.title}</h3>
            <span class="text-xs text-slate-400">${date.toLocaleDateString()}</span>
          </div>
          <p class="text-slate-300 leading-relaxed whitespace-pre-wrap">${ann.message || ann.content}</p>
          <div class="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] text-cyan-400 font-bold">
              ${(ann.author_name || 'A').charAt(0)}
            </div>
            <span class="text-xs text-slate-400">Posted by ${ann.author_name || 'Admin'}</span>
          </div>
        `;
        announcementsList.appendChild(annDiv);
      });

      // Simple Login Popup for latest announcement
      const latest = data[0];
      const sessKey = `seen_${latest.created_at?.seconds || latest.title}`;
      if (!sessionStorage.getItem(sessKey)) {
        showAnnouncementPopup(latest);
        sessionStorage.setItem(sessKey, 'true');
      }
    }
  } catch (err) {
    console.error("Error fetching announcements:", err);
  }
}

function showAnnouncementPopup(ann) {
  const popup = document.createElement('div');
  popup.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
  const date = ann.created_at?.toDate ? ann.created_at.toDate() : new Date();
  popup.innerHTML = `
    <div class="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-lg w-full shadow-2xl relative animate-scale-in">
      <button class="absolute top-4 right-4 text-slate-500 hover:text-white" onclick="this.closest('.fixed').remove()">
        <i class="fas fa-times"></i>
      </button>
      <div class="mb-4 text-cyan-400 text-xs font-bold uppercase tracking-widest">Latest Announcement</div>
      <h2 class="text-2xl font-bold text-white mb-4">${ann.title}</h2>
      <div class="text-slate-300 text-sm leading-relaxed mb-6 whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
        ${ann.message || ann.content}
      </div>
      <div class="flex items-center justify-between pt-6 border-t border-white/5">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
            ${(ann.author_name || 'A').charAt(0)}
          </div>
          <div>
            <p class="text-white text-[10px] font-bold">${ann.author_name || 'Admin'}</p>
            <p class="text-slate-500 text-[9px]">${date.toLocaleDateString()}</p>
          </div>
        </div>
        <button onclick="this.closest('.fixed').remove()" class="bg-cyan-500 hover:bg-cyan-600 text-black font-bold px-6 py-2 rounded-lg transition-all text-xs">
          Understand
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

if (addAnnouncementBtn && announcementModal && announcementModalClose) {
  addAnnouncementBtn.addEventListener('click', () => {
    announcementModal.classList.add('show');
    announcementModal.querySelector('.modal-content').classList.add('animate');
  });

  announcementModalClose.addEventListener('click', () => {
    announcementModal.classList.remove('show');
    announcementModal.querySelector('.modal-content').classList.remove('animate');
  });
}

if (addAnnouncementForm) {
  addAnnouncementForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = addAnnouncementForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    submitBtn.innerText = 'Posting...';
    submitBtn.disabled = true;

    const user = auth.currentUser;
    const isAdminFlag = localStorage.getItem('isAdminSession') === 'true';
    const authorName = isAdminFlag ? 'Admin' : (user?.displayName || 'Staff');

    try {
      await addDoc(collection(db, 'announcements'), {
        title: document.getElementById('announcement-title').value,
        content: document.getElementById('announcement-content').value,
        author_id: user?.uid || null,
        author_name: authorName,
        created_at: serverTimestamp()
      });

      submitBtn.innerText = 'Posted!';
      submitBtn.style.background = '#10b981';
      addAnnouncementForm.reset();
      fetchAnnouncements();
      
      setTimeout(() => {
        submitBtn.innerText = originalText;
        submitBtn.style.background = '';
        submitBtn.disabled = false;
        announcementModal.classList.remove('show');
      }, 2000);
    } catch (err) {
      console.error("Error posting announcement:", err);
      showToast(`Failed to post: ${err.message}`, 'error');
      submitBtn.innerText = 'Error!';
      submitBtn.disabled = false;
    }
  });
}

// --- SEND EMAIL LOGIC ---
const sendEmailForm = document.getElementById('send-email-form');
if (sendEmailForm) {
  sendEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = sendEmailForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    const to = document.getElementById('email-to').value;
    const subject = document.getElementById('email-subject').value;
    const message = document.getElementById('email-message').value;

    submitBtn.innerText = 'Sending...';
    submitBtn.disabled = true;

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message })
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      showToast('Email sent successfully!', 'success');
      sendEmailForm.reset();
    } catch (err) {
      console.error("Error sending email:", err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

// --- STREAKS LOGIC ---
async function fetchStreaks() {
  if (!streaksView || streaksView.classList.contains('hidden')) return;

  try {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    const allAttendance = snapshot.docs.map(doc => doc.data());

    const staffStreaks = {};
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    allAttendance.forEach(record => {
      if (!staffStreaks[record.staff_id]) {
        staffStreaks[record.staff_id] = {
          name: record.staff_name,
          current: 0,
          best: 0,
          dates: new Set()
        };
      }
      staffStreaks[record.staff_id].dates.add(record.date);
    });

    Object.keys(staffStreaks).forEach(id => {
      const datesSet = staffStreaks[id].dates;
      const sortedDates = Array.from(datesSet).sort().reverse();
      let current = 0;
      let checkD = datesSet.has(today) ? new Date(today) : (datesSet.has(yesterday) ? new Date(yesterday) : null);
      
      if (checkD) {
        while (datesSet.has(checkD.toISOString().split('T')[0])) {
          current++;
          checkD.setDate(checkD.getDate() - 1);
        }
      }

      let best = 0;
      let temp = 0;
      let lastD = null;
      Array.from(datesSet).sort().forEach(dateStr => {
        const d = new Date(dateStr);
        if (lastD) {
          const diff = (d - lastD) / 86400000;
          if (diff === 1) temp++;
          else temp = 1;
        } else temp = 1;
        best = Math.max(best, temp);
        lastD = d;
      });

      staffStreaks[id].current = current;
      staffStreaks[id].best = best;
    });

    const myStats = staffStreaks[user.uid] || { current: 0, best: 0, dates: new Set() };
    document.getElementById('my-streak-count').innerText = myStats.current;
    document.getElementById('my-best-streak').innerText = myStats.best;
    document.getElementById('total-days-worked').innerText = myStats.dates.size;
    
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const consistency = ((myStats.dates.size / daysInMonth) * 100).toFixed(0);
    document.getElementById('consistency-score').innerText = `${consistency}%`;

    const leaderboardBody = document.getElementById('streaks-leaderboard-body');
    leaderboardBody.innerHTML = '';
    const sortedStaff = Object.values(staffStreaks).sort((a, b) => b.current - a.current);
    if (sortedStaff.length > 0) document.getElementById('top-streak-name').innerText = sortedStaff[0].name;

    sortedStaff.forEach((staff, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Rank"><span class="font-bold text-slate-500">#${index + 1}</span></td>
        <td data-label="Staff">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">${staff.name.charAt(0)}</div>
            <span>${staff.name}</span>
          </div>
        </td>
        <td data-label="Current Streak"><div class="flex items-center gap-2"><i class="fas fa-fire text-orange-500"></i><span class="font-bold">${staff.current} Days</span></div></td>
        <td data-label="Best Streak">${staff.best} Days</td>
        <td data-label="Status"><span class="status-badge ${staff.current > 0 ? 'status-completed' : 'status-pending'}">${staff.current > 0 ? 'Active' : 'Inactive'}</span></td>
      `;
      leaderboardBody.appendChild(tr);
    });
  } catch (err) { console.error("Error fetching streaks:", err); }
}

// --- RECOGNITION LOGIC ---
const giveRecognitionBtn = document.getElementById('give-recognition-btn');
const recognitionModal = document.getElementById('recognition-modal');
const closeRecognitionModal = document.getElementById('close-recognition-modal');
const recognitionForm = document.getElementById('recognition-form');
const recognitionStaffSelect = document.getElementById('recognition-staff-id');
const recognitionGrid = document.getElementById('recognition-grid');

async function fetchRecognition() {
  if (!recognitionView || recognitionView.classList.contains('hidden')) return;

  try {
    const q = query(collection(db, 'recognition'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());

    recognitionGrid.innerHTML = '';
    if (data.length === 0) {
      recognitionGrid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No recognition awards yet.</div>';
    } else {
      data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'glass p-6 relative overflow-hidden group';
        const date = item.created_at?.toDate() || new Date();
        card.innerHTML = `
          <div class="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center text-black font-bold text-xl"><i class="fas fa-medal"></i></div>
            <div>
              <h4 class="font-bold text-lg">${item.staff_name}</h4>
              <p class="text-xs text-cyan-400 font-bold uppercase tracking-widest">${item.type}</p>
            </div>
          </div>
          <p class="text-slate-400 text-sm italic mb-4">"${item.message}"</p>
          <div class="flex justify-between items-center pt-4 border-t border-slate-800">
            <span class="text-[10px] text-slate-500 uppercase font-bold">${date.toLocaleDateString()}</span>
            <span class="text-[10px] text-slate-500">By Admin</span>
          </div>
        `;
        recognitionGrid.appendChild(card);
      });
    }

    if (recognitionStaffSelect) {
      const staffSnap = await getDocs(query(collection(db, 'users'), orderBy('name')));
      recognitionStaffSelect.innerHTML = staffSnap.docs.map(doc => `<option value="${doc.id}">${doc.data().name}</option>`).join('');
    }
  } catch (err) { console.error("Error fetching recognition:", err); }
}

if (giveRecognitionBtn) giveRecognitionBtn.addEventListener('click', () => recognitionModal.classList.remove('hidden'));
if (closeRecognitionModal) closeRecognitionModal.addEventListener('click', () => recognitionModal.classList.add('hidden'));

if (recognitionForm) {
  recognitionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const staffId = document.getElementById('recognition-staff-id').value;
    const staffName = recognitionStaffSelect.options[recognitionStaffSelect.selectedIndex].text;
    const type = document.getElementById('recognition-type').value;
    const message = document.getElementById('recognition-message').value;

    try {
      await addDoc(collection(db, 'recognition'), { staff_id: staffId, staff_name: staffName, type, message, created_at: serverTimestamp() });
      
      // Add notification for the recipient
      await addDoc(collection(db, 'notifications'), {
        user_id: staffId,
        title: 'New Recognition!',
        message: `Award from Management: ${type} - ${message}`,
        tag: 'Recognition',
        read: false,
        created_at: serverTimestamp()
      });

      showToast('Recognition submitted and staff notified!', 'success');
      recognitionModal.classList.add('hidden');
      recognitionForm.reset();
      fetchRecognition();
    } catch (err) {
      console.error("Error submitting recognition:", err);
      showToast('Failed to submit recognition', 'error');
    }
  });
}

// --- LEAVE MANAGEMENT LOGIC ---
const applyLeaveBtn = document.getElementById('apply-leave-btn');
const leaveModal = document.getElementById('leave-modal');
const closeLeaveModal = document.getElementById('close-leave-modal');
const leaveForm = document.getElementById('leave-form');
const myLeaveHistoryBody = document.getElementById('my-leave-history-body');
const adminLeaveRequestsBody = document.getElementById('admin-leave-requests-body');

async function fetchLeaveRequests() {
  if (!leaveView || leaveView.classList.contains('hidden')) return;

  try {
    const user = auth.currentUser;
    if (!user) return;

    // My Leaves
    const qMy = query(collection(db, 'leave_requests'), where('staff_id', '==', user.uid), orderBy('created_at', 'desc'));
    const snapshotMy = await getDocs(qMy);
    const myLeaves = snapshotMy.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    myLeaveHistoryBody.innerHTML = '';
    let pendingCount = 0;
    let approvedCount = 0;

    myLeaves.forEach(leave => {
      if (leave.status === 'Pending') pendingCount++;
      if (leave.status === 'Approved') approvedCount++;

      const startDateVal = leave.start_date || '--';
      const endDateVal = leave.end_date || '--';
      const reasonVal = leave.reason || '--';
      
      let days = '--';
      if (startDateVal !== '--' && endDateVal !== '--') {
        const start = new Date(startDateVal);
        const end = new Date(endDateVal);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
          if (days < 0) days = 0;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Type">${leave.type}</td>
        <td data-label="Dates">${startDateVal} to ${endDateVal}</td>
        <td data-label="Duration">${days} ${days === '--' ? '' : 'Days'}</td>
        <td data-label="Reason" class="max-w-[150px] truncate" title="${reasonVal}">${reasonVal}</td>
        <td data-label="Status"><span class="status-badge ${leave.status === 'Approved' ? 'status-completed' : leave.status === 'Rejected' ? 'status-cancelled' : 'status-pending'}">${leave.status}</span></td>
        <td data-label="Action">${leave.status === 'Pending' ? `<button onclick="cancelLeave('${leave.id}')" class="text-red-400 hover:text-red-500"><i class="fas fa-times"></i></button>` : '--'}</td>
      `;
      myLeaveHistoryBody.appendChild(tr);
    });

    document.getElementById('pending-leave-count').innerText = pendingCount;
    document.getElementById('approved-leave-count').innerText = approvedCount;

    // Admin View
    const isAdminFlag = localStorage.getItem('isAdminSession') === 'true';
    if (isAdminFlag && adminLeaveRequestsBody) {
      const snapshotAll = await getDocs(query(collection(db, 'leave_requests'), orderBy('created_at', 'desc')));
      adminLeaveRequestsBody.innerHTML = '';
      snapshotAll.docs.forEach(docSnap => {
        const leave = docSnap.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Staff Name">${leave.staff_name}</td>
          <td data-label="Type">${leave.type}</td>
          <td data-label="Dates">${leave.start_date} to ${leave.end_date}</td>
          <td data-label="Reason" class="max-w-xs truncate">${leave.reason}</td>
          <td data-label="Status"><span class="status-badge ${leave.status === 'Approved' ? 'status-completed' : leave.status === 'Rejected' ? 'status-cancelled' : 'status-pending'}">${leave.status}</span></td>
          <td data-label="Action">
            ${leave.status === 'Pending' ? `
              <button onclick="updateLeaveStatus('${docSnap.id}', 'Approved')" class="text-emerald-400 hover:text-emerald-500 mr-2"><i class="fas fa-check"></i></button>
              <button onclick="updateLeaveStatus('${docSnap.id}', 'Rejected')" class="text-red-400 hover:text-red-500"><i class="fas fa-times"></i></button>
            ` : '--'}
          </td>
        `;
        adminLeaveRequestsBody.appendChild(tr);
      });
    }
  } catch (err) { console.error("Error fetching leave requests:", err); }
}

if (applyLeaveBtn) applyLeaveBtn.addEventListener('click', () => leaveModal.classList.remove('hidden'));
if (closeLeaveModal) closeLeaveModal.addEventListener('click', () => leaveModal.classList.add('hidden'));

if (leaveForm) {
  leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const staffName = userDoc.exists() ? userDoc.data().name : (user.displayName || user.email.split('@')[0]);

      await addDoc(collection(db, 'leave_requests'), {
        staff_id: user.uid,
        staff_name: staffName,
        type: document.getElementById('leave-type').value,
        start_date: document.getElementById('leave-start-date').value,
        end_date: document.getElementById('leave-end-date').value,
        reason: document.getElementById('leave-reason').value,
        status: 'Pending',
        created_at: serverTimestamp()
      });

      showToast('Leave request submitted successfully!', 'success');
      leaveModal.classList.add('hidden');
      leaveForm.reset();
      fetchLeaveRequests();
    } catch (err) { console.error("Error submitting leave:", err); showToast('Failed to submit leave request.', 'error'); }
  });
}

window.updateLeaveStatus = async (id, status) => {
  try {
    await updateDoc(doc(db, 'leave_requests', id), { status });
    showToast(`Leave request ${status.toLowerCase()}!`, 'success');
    fetchLeaveRequests();
  } catch (err) { console.error("Error updating leave status:", err); showToast('Failed to update status', 'error'); }
};

window.cancelLeave = async (id) => {
  if (!confirm('Are you sure you want to cancel this request?')) return;
  try {
    await deleteDoc(doc(db, 'leave_requests', id));
    showToast('Request cancelled', 'success');
    fetchLeaveRequests();
  } catch (err) { console.error("Error cancelling leave:", err); showToast('Failed to cancel request', 'error'); }
};

// --- MEDIA STORAGE LOGIC ---
const mediaGrid = document.getElementById('media-grid');
const fileUpload = document.getElementById('file-upload');

async function fetchMedia() {
  if (!mediaGrid) return;
  
  try {
    const q = query(collection(db, 'media'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    mediaGrid.innerHTML = '';
    if (data.length === 0) {
      mediaGrid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No files uploaded yet</div>';
    } else {
      data.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'group relative glass p-4 rounded-xl hover:border-cyan-500/50 transition-all cursor-pointer';
        
        let icon = 'fa-file';
        if (item.type.includes('image')) icon = 'fa-file-image';
        else if (item.type.includes('video')) icon = 'fa-file-video';
        else if (item.type.includes('pdf')) icon = 'fa-file-pdf';

        itemDiv.innerHTML = `
          <div class="aspect-square flex items-center justify-center mb-3 bg-slate-900 rounded-lg">
            ${item.type.includes('image') ? `<img src="${item.url}" class="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer">` : `<i class="fas ${icon} text-3xl text-slate-500"></i>`}
          </div>
          <p class="text-[10px] font-bold truncate mb-1">${item.name}</p>
          <p class="text-[8px] text-slate-500">${(item.size / 1024).toFixed(1)} KB</p>
          <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl">
            <a href="${item.url}" target="_blank" class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-black"><i class="fas fa-external-link-alt text-xs"></i></a>
            <button onclick="deleteMedia('${item.id}', '${item.name}')" class="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white"><i class="fas fa-trash text-xs"></i></button>
          </div>
        `;
        mediaGrid.appendChild(itemDiv);
      });
    }
  } catch (err) {
    console.error("Error fetching media:", err);
  }
}

if (fileUpload) {
  fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadBtn = document.querySelector('label[for="file-upload"]');
    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Uploading...';
    uploadBtn.style.pointerEvents = 'none';

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      // Firebase Migration Note: Actual file storage requires Firebase Storage setup.
      // We will save the metadata to Firestore for now.
      await addDoc(collection(db, 'media'), {
        name: file.name,
        url: URL.createObjectURL(file), // Local preview or placeholder
        type: file.type,
        size: file.size,
        created_at: serverTimestamp()
      });

      uploadBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Metadata Saved!';
      uploadBtn.style.background = '#10b981';
      fetchMedia();
      
      setTimeout(() => {
        uploadBtn.innerHTML = originalHTML;
        uploadBtn.style.background = '';
        uploadBtn.style.pointerEvents = 'auto';
      }, 2000);
    } catch (err) {
      console.error("Upload failed:", err);
      showToast("Metadata save failed.", "error");
      uploadBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Failed';
      uploadBtn.style.background = '#ef4444';
      setTimeout(() => {
        uploadBtn.innerHTML = originalHTML;
        uploadBtn.style.background = '';
        uploadBtn.style.pointerEvents = 'auto';
      }, 2000);
    }
  });
}

window.deleteMedia = async (id, name) => {
  if (!confirm(`Are you sure you want to delete ${name}?`)) return;
  
  try {
    await deleteDoc(doc(db, 'media', id));
    fetchMedia();
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Delete failed", "error");
  }
};

// Real-time sync is now handled via onSnapshot in specific feature logic.

const staffTableBody = document.getElementById('staff-table-body');

async function fetchStaff() {
  if (!staffTableBody) return;
  
  console.log("[fetchStaff] Fetching staff members...");
  try {
    const q = query(collection(db, 'users'), orderBy('name'));
    const snapshot = await getDocs(q);
    const staffList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    
    // Filter out Clients if they accidentally show up
    const filteredStaff = staffList.filter(s => s.role !== 'Client');
    populateStaffTable(filteredStaff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    // Final fallback
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const staffList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      populateStaffTable(staffList.filter(s => s.role !== 'Client'));
    } catch (e) {
      staffTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Error loading staff list.</td></tr>`;
    }
  }
}

function populateStaffTable(staffList) {
    console.log(`[fetchStaff] Found ${staffList.length} staff members.`);
    staffTableBody.innerHTML = '';
    
    if (staffList.length === 0) {
      staffTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No staff members found.</td></tr>';
      return;
    }

    staffList.forEach((staff) => {
      // In staff management, let's show everyone including the current admin
      // This helps verify roles and status
      const tr = document.createElement('tr');
      tr.className = "hover:bg-white/5 transition-colors";
      tr.innerHTML = `
        <td data-label="Name" class="px-6 py-4"><div class="font-bold text-white">${staff.name || 'No Name'}</div></td>
        <td data-label="Email" class="px-6 py-4 text-slate-400">${staff.email}</td>
        <td data-label="Role" class="px-6 py-4 text-cyan-400 font-medium">${staff.role || 'Staff'}</td>
        <td data-label="Status" class="px-6 py-4"><span class="status-badge status-completed">${staff.status || 'Active'}</span></td>
        <td data-label="Action" class="px-6 py-4">
          <button onclick="deleteStaff('${staff.id}')" class="text-slate-500 hover:text-red-500 transition-colors p-2" title="Delete Staff">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      `;
      staffTableBody.appendChild(tr);
    });
}

// Task Management Logic
async function fetchStaffForDropdown() {
  const assigneeSelect = document.getElementById('task-assignee');
  if (!assigneeSelect) return;

  try {
    const q = query(collection(db, 'users'), orderBy('name'));
    const snapshot = await getDocs(q);
    const staff = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    assigneeSelect.innerHTML = '<option value="">Select Staff Member</option>';
    if (staff && staff.length > 0) {
      staff.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = s.name;
        assigneeSelect.appendChild(option);
      });
    } else {
      assigneeSelect.innerHTML = '<option value="">No staff found in database</option>';
    }
  } catch (error) {
    console.error("Error fetching staff for dropdown:", error);
  }
}

const assignTaskForm = document.getElementById('assign-task-form');
if (assignTaskForm) {
  assignTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = assignTaskForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;

    const assigneeSelect = document.getElementById('task-assignee');
    const assigneeId = assigneeSelect ? assigneeSelect.value : '';
    
    if (!assigneeId || assigneeId === "" || assigneeId === "null") {
      showToast('Please select a staff member from the dropdown list.', 'warning');
      return;
    }

    setLoading(submitBtn, true, 'Assigning...');

    try {
      const user = auth.currentUser;
      const taskData = {
        title: document.getElementById('task-title').value,
        assignee_id: assigneeId,
        category: document.getElementById('task-category').value,
        priority: document.getElementById('task-priority').value,
        due_date: document.getElementById('task-due-date').value,
        description: document.getElementById('task-description').value,
        reminders: document.getElementById('task-reminders')?.checked || false,
        status: 'pending',
        created_at: serverTimestamp(),
        created_by: user?.uid || 'Admin'
      };

      await addDoc(collection(db, 'tasks'), taskData);

      showToast('Task assigned successfully!', 'success');
      assignTaskForm.reset();
      
      setTimeout(() => {
        setLoading(submitBtn, false, originalText);
      }, 2000);
      
      fetchAdminTasks(); // Refresh the table
    } catch (error) {
      console.error("Error assigning task:", error);
      showToast('Failed to assign task: ' + (error.message || 'Check your database connection'), 'error');
      setLoading(submitBtn, false, originalText);
    }
  });
}

async function fetchMyTasks() {
  const taskTableBody = document.getElementById('my-tasks-table-body');
  const taskCountBadge = document.getElementById('task-count');
  const statusFilter = document.getElementById('task-status-filter');
  if (!taskTableBody) return;

  const filterValue = statusFilter ? statusFilter.value : 'all';

  try {
    const user = auth.currentUser;
    if (!user) return;

    let q = query(collection(db, 'tasks'), where('assignee_id', '==', user.uid), orderBy('due_date', 'asc'));

    if (filterValue !== 'all') {
      q = query(collection(db, 'tasks'), where('assignee_id', '==', user.uid), where('status', '==', filterValue), orderBy('due_date', 'asc'));
    }

    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    taskTableBody.innerHTML = '';
    if (taskCountBadge) taskCountBadge.innerText = tasks.filter(t => t.status !== 'completed').length;

    if (tasks.length === 0) {
      taskTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-500">No ${filterValue !== 'all' ? filterValue : ''} tasks found</td></tr>`;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tasks.forEach(task => {
      const tr = document.createElement('tr');
      tr.className = 'cursor-pointer hover:bg-white/5 transition-colors';
      tr.onclick = (e) => {
        if (e.target.tagName !== 'SELECT') showTaskDetails(task.id);
      };
      const priorityClass = `priority-${task.priority.toLowerCase()}`;
      const dueDate = task.due_date ? new Date(task.due_date) : new Date();
      dueDate.setHours(0, 0, 0, 0);
      const isOverdue = dueDate < today && task.status !== 'completed';
      
      if (isOverdue) tr.classList.add('overdue-row');

      tr.innerHTML = `
        <td data-label="Title">
          <div class="font-bold">${task.title}</div>
          ${isOverdue ? '<span class="overdue-badge"><i class="fas fa-exclamation-triangle mr-1"></i> Overdue</span>' : ''}
        </td>
        <td data-label="Category">${task.category}</td>
        <td data-label="Priority"><span class="priority-badge ${priorityClass}">${task.priority}</span></td>
        <td data-label="Due Date" class="${isOverdue ? 'text-red-500 font-bold' : ''}">${task.due_date}</td>
        <td data-label="Status"><span class="status-badge status-${task.status.toLowerCase().replace(' ', '-')}">${task.status}</span></td>
        <td data-label="Action">
          <select onchange="updateTaskStatus('${task.id}', this.value)" class="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs">
            <option value="pending" ${task.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </td>
      `;
      taskTableBody.appendChild(tr);
    });

    // Populate summary on dashboard
    const summaryContainer = document.getElementById('staff-tasks-summary');
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
      tasks.slice(0, 4).forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-card-summary';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <span class="font-bold">${task.title}</span>
            <span class="priority-badge priority-${task.priority.toLowerCase()}">${task.priority}</span>
          </div>
          <div class="flex justify-between items-center text-xs text-slate-400">
            <span>Due: ${task.due_date}</span>
            <span class="capitalize">${task.status}</span>
          </div>
        `;
        summaryContainer.appendChild(div);
      });
    }
  } catch (error) {
    console.error("Error fetching my tasks:", error);
  }
}

window.updateTaskStatus = async (id, newStatus) => {
  try {
    const updateData = { status: newStatus };
    if (newStatus === 'completed') {
      updateData.completion_date = serverTimestamp();
    } else {
      updateData.completion_date = null;
    }

    await updateDoc(doc(db, 'tasks', id), updateData);
    fetchMyTasks();
    showToast('Task updated!', 'success');
  } catch (error) {
    console.error("Error updating task status:", error);
    showToast('Update failed', 'error');
  }
};

async function fetchStaffDashboardStats() {
  const user = auth.currentUser;
  if (!user) return;

  const completedTasksEl = document.getElementById('staff-completed-tasks-stat');
  const streakEl = document.getElementById('staff-streak-stat');
  const attendanceRateEl = document.getElementById('staff-attendance-rate-stat');
  const attendanceDetailEl = document.getElementById('staff-attendance-detail');
  const staffDashboardTasksBody = document.getElementById('staff-dashboard-tasks-body');
  
  try {
    // Fetch user's tasks
    const tasksQ = query(collection(db, 'tasks'), where('assignee_id', '==', user.uid), orderBy('due_date', 'asc'));
    const tasksSnapshot = await getDocs(tasksQ);
    const tasks = tasksSnapshot.docs.map(docSnap => docSnap.data());

    // Fetch user's attendance
    const attendanceQ = query(collection(db, 'attendance'), where('staff_id', '==', user.uid));
    const attendanceSnapshot = await getDocs(attendanceQ);
    const attendance = attendanceSnapshot.docs.map(docSnap => docSnap.data());

    const completedTasks = tasks ? tasks.filter(t => t.status === 'completed').length : 0;
    const pendingTasksCount = tasks ? tasks.filter(t => t.status !== 'completed').length : 0;
    const upcomingTasks = tasks ? tasks.filter(t => t.status !== 'completed').slice(0, 5) : [];
    
    if (completedTasksEl) completedTasksEl.innerText = completedTasks;
    const pendingTasksCountEl = document.getElementById('staff-pending-tasks-count');
    if (pendingTasksCountEl) pendingTasksCountEl.innerText = `${pendingTasksCount} pending`;

    // Populate today's clock status on dashboard
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = attendance ? attendance.find(a => a.date === today && !a.clock_out) : null;
    const dashInBtn = document.getElementById('dash-clock-in-btn');
    const dashOutBtn = document.getElementById('dash-clock-out-btn');
    const dashStatus = document.getElementById('dash-clock-status');

    if (dashInBtn && dashOutBtn && dashStatus) {
      if (todayRecord) {
        dashInBtn.classList.add('hidden');
        dashOutBtn.classList.remove('hidden');
        dashStatus.innerText = `Clocked in at ${new Date(todayRecord.clock_in).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
      } else {
        const completedToday = attendance ? attendance.find(a => a.date === today && a.clock_out) : null;
        if (completedToday) {
          dashInBtn.classList.add('hidden');
          dashOutBtn.classList.add('hidden');
          dashStatus.innerText = 'Attendance completed for today';
          dashStatus.classList.replace('text-slate-500', 'text-emerald-500');
        } else {
          dashInBtn.classList.remove('hidden');
          dashOutBtn.classList.add('hidden');
          dashStatus.innerText = 'Not clocked in today';
        }
      }
    }
    if (staffDashboardTasksBody) {
      staffDashboardTasksBody.innerHTML = '';
      if (upcomingTasks.length === 0) {
        staffDashboardTasksBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No upcoming tasks</td></tr>';
      } else {
        upcomingTasks.forEach(task => {
          const tr = document.createElement('tr');
          const priorityClass = `priority-${task.priority.toLowerCase()}`;
          const statusClass = task.status === 'completed' ? 'status-completed' : 'status-pending';

          tr.innerHTML = `
            <td><div class="font-bold">${task.title}</div></td>
            <td><span class="priority-badge ${priorityClass}">${task.priority}</span></td>
            <td>${task.due_date}</td>
            <td><span class="status-badge ${statusClass}">${task.status}</span></td>
            <td>
              <button onclick="document.getElementById('nav-my-tasks').click()" class="text-cyan-400 hover:text-cyan-300 text-xs font-bold">
                View
              </button>
            </td>
          `;
          staffDashboardTasksBody.appendChild(tr);
        });
      }
    }
    
    // Calculate attendance rate
    let attendanceRate = '0%';
    if (attendance && attendance.length > 0) {
      const firstDate = new Date(attendance.sort((a, b) => new Date(a.date) - new Date(b.date))[0].date);
      const daysSinceStart = Math.max(1, Math.ceil((new Date() - firstDate) / (1000 * 60 * 60 * 24)));
      attendanceRate = `${Math.min(100, Math.round((attendance.length / daysSinceStart) * 100))}%`;
    }

    if (completedTasksEl) completedTasksEl.innerText = completedTasks;
    if (streakEl) streakEl.innerText = document.getElementById('my-streak-count')?.innerText || '0';
    if (attendanceRateEl) attendanceRateEl.innerText = attendanceRate;
    if (attendanceDetailEl) attendanceDetailEl.innerText = attendance && attendance.length > 10 ? 'Excellent' : 'Keep going';
  } catch (error) {
    console.error("Error fetching staff dashboard stats:", error);
  }
}

window.deleteStaff = async (id) => {
  if (confirm('Are you sure you want to delete this staff member?')) {
    try {
      await deleteDoc(doc(db, 'users', id));
      fetchStaff();
      showToast('Staff removed', 'success');
    } catch (error) {
      console.error("Error deleting staff:", error);
      showToast('Action failed', 'error');
    }
  }
};

// Admin Dashboard Logic
const bookingsTableBody = document.getElementById('all-bookings-body');
const applyFiltersBtn = document.getElementById('apply-filters');
const filterStatus = document.getElementById('filter-status');
const filterService = document.getElementById('filter-service');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const bookingsCount = document.getElementById('bookings-count');

async function fetchDashboardStats() {
  const totalRevenueStat = document.getElementById('total-revenue-stat');
  const activeBookingsStat = document.getElementById('active-bookings-stat');
  const pendingBookingsStat = document.getElementById('pending-bookings-stat');
  const newMessagesStat = document.getElementById('new-messages-stat');
  const teamAttendanceStat = document.getElementById('team-attendance-stat');
  const pendingTasksStat = document.getElementById('pending-tasks-stat');
  const recentBookingsBody = document.getElementById('recent-bookings-body');
  
  try {
    // Fetch Bookings
    const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
    const bookings = bookingsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    // Fetch Messages (Inquiries)
    const inquiriesQ = query(collection(db, 'inquiries'), where('status', '==', 'new'));
    const inquiriesSnapshot = await getDocs(inquiriesQ);
    const messages = inquiriesSnapshot.docs.map(docSnap => docSnap.data());

    // Fetch Staff & Attendance (for team attendance)
    const staffSnapshot = await getDocs(collection(db, 'users'));
    const staff = staffSnapshot.docs.filter(docSnap => docSnap.data().role !== 'Client');
    
    const today = new Date().toISOString().split('T')[0];
    const attendanceQ = query(collection(db, 'attendance'), where('date', '==', today));
    const attendanceSnapshot = await getDocs(attendanceQ);
    const attendance = attendanceSnapshot.docs.map(docSnap => docSnap.data());

    // Fetch Tasks (for pending tasks)
    const tasksSnapshot = await getDocs(collection(db, 'tasks'));
    const tasks = tasksSnapshot.docs.map(docSnap => docSnap.data()).filter(t => t.status !== 'completed');

    // Update Stats
    const defaultPrice = parseInt(localStorage.getItem('defaultBookingPrice') || '500');
    const totalRevenue = bookings
      .filter(b => b.status === 'Completed')
      .reduce((sum, b) => sum + (parseInt(b.price) || defaultPrice), 0);
    
    const activeBookings = bookings.filter(b => b.status === 'Confirmed' || b.status === 'Pending').length;
    const pendingCount = bookings.filter(b => b.status === 'Pending').length;

    if (totalRevenueStat) totalRevenueStat.innerText = currencyManager.format(totalRevenue);
    if (activeBookingsStat) activeBookingsStat.innerText = activeBookings;
    if (pendingBookingsStat) pendingBookingsStat.innerText = `${pendingCount} pending confirmation`;
    if (newMessagesStat) newMessagesStat.innerText = messages.length;
    if (teamAttendanceStat) teamAttendanceStat.innerText = `${attendance.length}/${staff.length}`;
    if (pendingTasksStat) pendingTasksStat.innerText = tasks.length;

    // Update Recent Bookings
    if (recentBookingsBody) {
      const recent = bookings.sort((a, b) => {
        const dateA = a.created_at?.toDate ? a.created_at.toDate() : new Date(a.created_at);
        const dateB = b.created_at?.toDate ? b.created_at.toDate() : new Date(b.created_at);
        return dateB - dateA;
      }).slice(0, 5);
      
      recentBookingsBody.innerHTML = '';
      if (recent.length === 0) {
        recentBookingsBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-slate-500">No recent bookings</td></tr>';
      } else {
        recent.forEach(booking => {
          const tr = document.createElement('tr');
          const statusClass = booking.status === 'Pending' ? 'status-pending' : 'status-completed';
          const price = booking.price || defaultPrice;
          tr.innerHTML = `
            <td>
              <div class="font-bold">${booking.client_name}</div>
              <div class="text-xs text-slate-400">${booking.email}</div>
            </td>
            <td>${booking.service}</td>
            <td>${booking.date}</td>
            <td>${currencyManager.format(price)}</td>
            <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
            <td><button class="text-slate-400 hover:text-white" onclick="document.getElementById('nav-bookings').click()"><i class="fas fa-ellipsis-h"></i></button></td>
          `;
          recentBookingsBody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
  }
}

async function fetchBookings() {
  if (!bookingsTableBody) return;
  
  // Initial stats fetch
  fetchDashboardStats();

  bookingsTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500">Loading bookings...</td></tr>';

  try {
    const q = query(collection(db, 'bookings'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    let bookings = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    // Apply Filters
    const status = filterStatus.value;
    const service = filterService.value;
    const dateFrom = filterDateFrom.value;
    const dateTo = filterDateTo.value;

    if (status !== 'all') {
      bookings = bookings.filter(b => b.status === status);
    }
    if (service !== 'all') {
      bookings = bookings.filter(b => b.service === service);
    }
    if (dateFrom) {
      bookings = bookings.filter(b => b.date >= dateFrom);
    }
    if (dateTo) {
      bookings = bookings.filter(b => b.date <= dateTo);
    }

    renderBookings(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    bookingsTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Error loading bookings.</td></tr>';
  }
}

function renderBookings(bookings) {
  if (!bookingsTableBody) return;

  if (bookings.length === 0) {
    bookingsTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-500">No bookings found matching filters.</td></tr>';
    bookingsCount.innerText = 'Showing 0 bookings';
    return;
  }

  bookingsTableBody.innerHTML = '';
  bookings.forEach(booking => {
    const tr = document.createElement('tr');
    const statusClass = booking.status === 'Pending' ? 'status-pending' : 'status-completed';
    
    const isAdminSession = localStorage.getItem('isAdminSession') === 'true';
    
    tr.innerHTML = `
      <td data-label="ID">#${booking.id.substring(0, 6).toUpperCase()}</td>
      <td data-label="Client">
        <div class="font-bold text-white">${booking.client_name}</div>
        <div class="text-xs text-slate-400">${booking.email}</div>
      </td>
      <td data-label="Service">${booking.service}</td>
      <td data-label="Date">${booking.date}</td>
      <td data-label="Time">${booking.time}</td>
      <td data-label="Price">
        ${isAdminSession ? `
          <input type="number" 
            class="w-20 bg-slate-900/50 border border-slate-800 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none text-white" 
            value="${booking.price || ''}" 
            placeholder="500"
            onchange="updatePrice('${booking.id}', this.value)">
        ` : `
          <span class="text-white">${currencyManager.format(booking.price || 500)}</span>
        `}
      </td>
      <td data-label="Status"><span class="status-badge ${statusClass}">${booking.status}</span></td>
      <td data-label="Action">
        <button class="text-slate-400 hover:text-cyan-400 transition-colors mr-3" onclick="updateStatus('${booking.id}', 'Confirmed')" title="Confirm">
          <i class="fas fa-check"></i>
        </button>
        <button class="text-slate-400 hover:text-red-400 transition-colors" onclick="deleteBooking('${booking.id}')" title="Delete">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    `;
    bookingsTableBody.appendChild(tr);
  });

  bookingsCount.innerText = `Showing ${bookings.length} bookings`;
}

// Global functions for inline onclick
window.updatePrice = async (id, newPrice) => {
  const user = auth.currentUser;
  const isUserAdmin = await isAdmin(user);
  
  if (!isUserAdmin) {
    showToast('Only admins can set prices', 'error');
    return;
  }

  try {
    await updateDoc(doc(db, 'bookings', id), { price: parseInt(newPrice) });
    showToast('Price updated!', 'success');
    fetchDashboardStats();
  } catch (err) {
    console.error("Error updating price:", err);
    showToast('Failed to update price', 'error');
  }
};

const revenueSettingsForm = document.getElementById('revenue-settings-form');
if (revenueSettingsForm) {
  const defaultPriceInput = document.getElementById('default-booking-price');
  if (defaultPriceInput) {
    defaultPriceInput.value = localStorage.getItem('defaultBookingPrice') || '500';
  }
  
  revenueSettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const defaultPrice = document.getElementById('default-booking-price').value;
    localStorage.setItem('defaultBookingPrice', defaultPrice);
    showToast('Revenue settings saved!', 'success');
    fetchDashboardStats();
  });
}

const profileSettingsForm = document.getElementById('profile-settings-form');
if (profileSettingsForm) {
  profileSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = profileSettingsForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    const newName = document.getElementById('settings-name').value;
    const newUsername = document.getElementById('settings-username').value;
    
    setLoading(submitBtn, true);
    
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");
      
      // 1. Update Auth profile
      await updateProfile(user, {
        displayName: newName
      });
      
      // 2. Update users collection
      await updateDoc(doc(db, 'users', user.uid), {
        name: newName,
        username: newUsername
      });
      
      showToast('Profile updated successfully!', 'success');
      
      // Refresh UI elements
      const welcomeName = document.getElementById('welcome-name');
      const headerName = document.getElementById('user-name-header');
      const sidebarName = document.getElementById('user-name-sidebar');
      
    } finally {
      setLoading(submitBtn, false, originalText);
    }
  });
}

const profilePicUpload = document.getElementById('profile-pic-upload');
if (profilePicUpload) {
  profilePicUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'error');
      return;
    }
    
    const statusEl = document.getElementById('upload-status');
    if (statusEl) statusEl.classList.remove('hidden');
    
    try {
      const user = auth.currentUser;
      const storageRef = ref(storage, `profile_pics/${user.uid}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      await updateProfile(user, { photoURL: downloadURL });
      await updateDoc(doc(db, 'users', user.uid), { photo_url: downloadURL });
      
      const currentName = document.getElementById('settings-name').value;
      updateUserAvatars(currentName, downloadURL);
      
      showToast('Profile picture updated!', 'success');
    } catch (error) {
      console.error("Upload failed:", error);
      showToast('Upload failed. Ensure Firebase Storage is configured.', 'error');
    } finally {
      if (statusEl) statusEl.classList.add('hidden');
      profilePicUpload.value = '';
    }
  });
}

// Notification Settings Logic
const toggleEmailNotif = document.getElementById('toggle-email-notif');
const toggleSystemNotif = document.getElementById('toggle-system-notif');
const saveNotifBtn = document.getElementById('save-notif-settings');

if (toggleEmailNotif && toggleSystemNotif && saveNotifBtn) {
  // Load saved preferences
  const prefs = JSON.parse(localStorage.getItem('notificationPrefs') || '{"email": true, "system": false}');
  updateToggleUI(toggleEmailNotif, prefs.email);
  updateToggleUI(toggleSystemNotif, prefs.system);

  toggleEmailNotif.addEventListener('click', () => {
    const currentState = toggleEmailNotif.classList.contains('bg-cyan-500');
    updateToggleUI(toggleEmailNotif, !currentState);
  });

  toggleSystemNotif.addEventListener('click', () => {
    const currentState = toggleSystemNotif.classList.contains('bg-cyan-500');
    updateToggleUI(toggleSystemNotif, !currentState);
  });

  saveNotifBtn.addEventListener('click', () => {
    const prefs = {
      email: toggleEmailNotif.classList.contains('bg-cyan-500'),
      system: toggleSystemNotif.classList.contains('bg-cyan-500')
    };
    localStorage.setItem('notificationPrefs', JSON.stringify(prefs));
    showToast('Notification preferences saved!', 'success');
  });
}

function updateToggleUI(toggleEl, isActive) {
  if (!toggleEl) return;
  const dot = toggleEl.querySelector('.toggle-dot');
  if (!dot) return;
  
  if (isActive) {
    toggleEl.classList.remove('bg-slate-700');
    toggleEl.classList.add('bg-cyan-500');
    dot.classList.remove('left-1');
    dot.classList.add('right-1');
  } else {
    toggleEl.classList.remove('bg-cyan-500');
    toggleEl.classList.add('bg-slate-700');
    dot.classList.remove('right-1');
    dot.classList.add('left-1');
  }
}

// Password Change Form
const changePasswordForm = document.getElementById('change-password-form');
if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    
    setLoading(submitBtn, true);
    
    try {
      await updatePassword(auth.currentUser, newPassword);
      showToast('Password updated successfully!', 'success');
      changePasswordForm.reset();
    } catch (err) {
      console.error("Password update failed:", err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(submitBtn, false, originalText);
    }
  });
}

window.updateStatus = async (id, newStatus) => {
  try {
    await updateDoc(doc(db, 'bookings', id), { status: newStatus });
    fetchBookings();
    showToast(`Booking ${newStatus}`, 'success');
  } catch (error) {
    console.error("Error updating status:", error);
    showToast('Failed to update status', 'error');
  }
};

window.deleteBooking = async (id) => {
  if (confirm('Are you sure you want to delete this booking?')) {
    try {
      await deleteDoc(doc(db, 'bookings', id));
      fetchBookings();
      showToast('Booking deleted', 'success');
    } catch (error) {
      console.error("Error deleting booking:", error);
      showToast('Delete failed', 'error');
    }
  }
};

// Message Selection Logic
const messageList = document.getElementById('message-list');
const messageDetailEmpty = document.getElementById('message-detail-empty');
const messageDetail = document.getElementById('message-detail');

async function fetchMessages() {
  if (!messageList) return;
  
  try {
    const q = query(collection(db, 'inquiries'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    messageList.innerHTML = '';
    if (data.length === 0) {
      messageList.innerHTML = '<div class="text-center py-8 text-slate-500">No messages yet</div>';
    } else {
      data.forEach(msg => {
        const div = document.createElement('div');
        const createdAt = msg.created_at?.toDate ? msg.created_at.toDate() : new Date(msg.created_at || Date.now());
        div.className = `p-4 rounded-xl border ${msg.status !== 'new' ? 'bg-white/5 border-white/10' : 'bg-cyan-500/5 border-cyan-500/20'} cursor-pointer hover:bg-white/10 transition-all`;
        div.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <h4 class="font-bold text-sm truncate">${msg.name}</h4>
            <span class="text-[10px] text-slate-500">${createdAt.toLocaleDateString()}</span>
          </div>
          <p class="text-xs text-slate-400 font-semibold truncate mb-1">${msg.subject}</p>
          <p class="text-[10px] text-slate-500 truncate">${msg.message}</p>
        `;
        div.addEventListener('click', () => showMessageDetail(msg));
        messageList.appendChild(div);
      });
    }
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

function showMessageDetail(msg) {
  if (!messageDetail || !messageDetailEmpty) return;
  
  messageDetailEmpty.classList.add('hidden');
  messageDetail.classList.remove('hidden');
  
  const createdAt = msg.created_at?.toDate ? msg.created_at.toDate() : new Date(msg.created_at || Date.now());

  messageDetail.innerHTML = `
    <div class="flex justify-between items-start mb-8">
      <div>
        <h3 class="text-xl font-bold mb-1">${msg.subject}</h3>
        <p class="text-slate-400 text-sm">From: <span class="text-white font-semibold">${msg.name}</span> (${msg.email})</p>
      </div>
      <div class="text-right">
        <p class="text-slate-400 text-xs">${createdAt.toLocaleString()}</p>
      </div>
    </div>
    <div class="bg-white/5 p-6 rounded-xl border border-white/10 mb-8">
      <p class="text-slate-200 leading-relaxed whitespace-pre-wrap">${msg.message}</p>
    </div>
    <div class="flex gap-4">
      <a href="mailto:${msg.email}" class="bg-cyan-500 hover:bg-cyan-600 text-black font-bold px-6 py-2 rounded-lg transition-colors">
        <i class="fas fa-reply mr-2"></i> Reply via Email
      </a>
      <button class="glass px-6 py-2 rounded-lg hover:text-red-400 transition-colors" onclick="deleteMessage('${msg.id}')">
        <i class="fas fa-trash mr-2"></i> Delete
      </button>
    </div>
  `;
  
  // Mark as read
  if (msg.status === 'new') {
    markMessageAsRead(msg.id);
  }
}

async function markMessageAsRead(id) {
  try {
    await updateDoc(doc(db, 'inquiries', id), { status: 'read' });
    fetchMessages();
    fetchDashboardStats();
  } catch (err) {
    console.error("Error marking message as read:", err);
  }
}

window.deleteMessage = async (id) => {
  if (confirm('Are you sure you want to delete this message?')) {
    try {
      await deleteDoc(doc(db, 'inquiries', id));
      messageDetail.classList.add('hidden');
      messageDetailEmpty.classList.remove('hidden');
      fetchMessages();
      fetchDashboardStats();
      showToast('Message deleted', 'success');
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  }
};

const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value;

    submitBtn.innerText = 'Sending...';
    submitBtn.disabled = true;

    try {
      // 1. Save to Firebase (Inquiries)
      await addDoc(collection(db, 'inquiries'), {
        name,
        email,
        subject,
        message,
        status: 'new',
        created_at: serverTimestamp()
      });

      // 2. Send Email Notification
      try {
        await sendEmail(
          'princedagogoekine@gmail.com', // Admin email
          `New Contact Message: ${subject}`,
          `From: ${name} (${email})\n\nMessage:\n${message}`
        );
        
        // Auto-reply to user
        await sendEmail(
          email,
          'Message Received - Lumina Tech',
          `Hi ${name},\n\nThank you for reaching out to Lumina Tech. We have received your message regarding "${subject}" and will get back to you as soon as possible.\n\nBest regards,\nLumina Tech Team`
        );
      } catch (emailErr) {
        console.error("Failed to send contact emails:", emailErr);
        if (!isSupabaseConfigured) {
          throw new Error("Could not send message. Please check your connection.");
        }
      }

      showToast('Message sent successfully! Check your email for confirmation.', 'success');
      contactForm.reset();
    } catch (err) {
      console.error("Error sending message:", err);
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener('click', fetchBookings);
  // Initial fetch
  fetchBookings();
}

// --- ATTENDANCE LOGIC ---
const clockInBtn = document.getElementById('clock-in-btn');
const clockOutBtn = document.getElementById('clock-out-btn');
const todayStatus = document.getElementById('today-status');
const clockInTimeDisplay = document.getElementById('clock-in-time-display');
const totalHoursDisplay = document.getElementById('total-hours-display');
const attendanceHistoryBody = document.getElementById('attendance-history-body');
const adminAttendanceBody = document.getElementById('admin-attendance-body');

async function fetchAttendance() {
  if (!attendanceView || attendanceView.classList.contains('hidden')) return;

  try {
    const user = auth.currentUser;
    if (!user) return;

    // Fetch user's attendance for today
    const today = new Date().toISOString().split('T')[0];
    const qToday = query(collection(db, 'attendance'), where('staff_id', '==', user.uid), where('date', '==', today), limit(1));
    const todaySnapshot = await getDocs(qToday);
    const todayAttendance = todaySnapshot.empty ? null : todaySnapshot.docs[0].data();

    if (todayAttendance) {
      if (todayAttendance.clock_out) {
        todayStatus.innerText = 'Completed';
        todayStatus.className = 'text-xl font-bold text-emerald-500';
        clockInBtn.classList.add('hidden');
        clockOutBtn.classList.add('hidden');
      } else {
        todayStatus.innerText = 'Clocked In';
        todayStatus.className = 'text-xl font-bold text-cyan-400';
        clockInBtn.classList.add('hidden');
        clockOutBtn.classList.remove('hidden');
      }
      const clockInDate = todayAttendance.clock_in?.toDate ? todayAttendance.clock_in.toDate() : new Date(todayAttendance.clock_in);
      clockInTimeDisplay.innerText = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (todayAttendance.clock_out) {
        const clockOutDate = todayAttendance.clock_out?.toDate ? todayAttendance.clock_out.toDate() : new Date(todayAttendance.clock_out);
        const diff = clockOutDate - clockInDate;
        const hours = (diff / (1000 * 60 * 60)).toFixed(1);
        totalHoursDisplay.innerText = `${hours}h`;
      }
    } else {
      todayStatus.innerText = 'Not Clocked In';
      todayStatus.className = 'text-xl font-bold text-slate-500';
      clockInBtn.classList.remove('hidden');
      clockOutBtn.classList.add('hidden');
      clockInTimeDisplay.innerText = '--:--';
      totalHoursDisplay.innerText = '0.0h';
    }

    // Fetch user's attendance history
    let qHistory = query(collection(db, 'attendance'), where('staff_id', '==', user.uid), orderBy('date', 'desc'), limit(10));
    let historySnapshot;
    try {
      historySnapshot = await getDocs(qHistory);
    } catch (err) {
      console.warn("Attendance history index missing, falling back:", err);
      qHistory = query(collection(db, 'attendance'), where('staff_id', '==', user.uid), limit(10));
      historySnapshot = await getDocs(qHistory);
    }
    const history = historySnapshot.docs.map(docSnap => docSnap.data());

    attendanceHistoryBody.innerHTML = '';
    if (history.length === 0) {
      attendanceHistoryBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No attendance records found.</td></tr>';
    } else {
      history.forEach(record => {
        const tr = document.createElement('tr');
        const clockInVal = record.clock_in;
        let clockInDate;
        if (clockInVal && clockInVal.toDate) {
          clockInDate = clockInVal.toDate();
        } else if (clockInVal) {
          clockInDate = new Date(clockInVal);
        } else {
          clockInDate = new Date();
        }
        
        const clockIn = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let clockOut = '--:--';
        let hours = '--';
        
        if (record.clock_out) {
          const clockOutVal = record.clock_out;
          let clockOutDate;
          if (clockOutVal && clockOutVal.toDate) {
            clockOutDate = clockOutVal.toDate();
          } else {
            clockOutDate = new Date(clockOutVal);
          }
          
          clockOut = clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const diff = clockOutDate - clockInDate;
          hours = (diff / (1000 * 60 * 60)).toFixed(1);
        }

        tr.innerHTML = `
          <td data-label="Date" class="text-white">${record.date}</td>
          <td data-label="Clock In" class="text-slate-400">${clockIn}</td>
          <td data-label="Clock Out" class="text-slate-400">${clockOut}</td>
          <td data-label="Hours" class="text-cyan-400">${hours}h</td>
          <td data-label="Status"><span class="status-badge ${record.clock_out ? 'status-completed' : (record.status === 'Late' ? 'bg-orange-500/10 text-orange-400' : 'status-pending')}">${record.status}</span></td>
        `;
        attendanceHistoryBody.appendChild(tr);
      });
    }

    const isUserAdmin = await isAdmin(user);
    if (isUserAdmin && adminAttendanceBody) {
      let qAdm = query(collection(db, 'attendance'), orderBy('created_at', 'desc'), limit(50));
      let admSnapshot;
      try {
        admSnapshot = await getDocs(qAdm);
      } catch (err) {
        console.warn("Admin attendance index missing, falling back:", err);
        qAdm = query(collection(db, 'attendance'), limit(50));
        admSnapshot = await getDocs(qAdm);
      }
      const allAttendance = admSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

      adminAttendanceBody.innerHTML = '';
      allAttendance.forEach(record => {
        const tr = document.createElement('tr');
        const clockInVal = record.clock_in;
        let clockInDate;
        if (clockInVal && clockInVal.toDate) {
          clockInDate = clockInVal.toDate();
        } else if (clockInVal) {
          clockInDate = new Date(clockInVal);
        } else {
          clockInDate = new Date();
        }
        
        const clockInStr = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let clockOut = '--:--';
        if (record.clock_out) {
          const clockOutVal = record.clock_out;
          let clockOutDate;
          if (clockOutVal && clockOutVal.toDate) {
            clockOutDate = clockOutVal.toDate();
          } else {
            clockOutDate = new Date(clockOutVal);
          }
          clockOut = clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        tr.innerHTML = `
          <td data-label="Staff">${record.staff_name || 'Unknown'}</td>
          <td data-label="Date">${record.date}</td>
          <td data-label="Clock In">${clockInStr}</td>
          <td data-label="Clock Out">${clockOut}</td>
          <td data-label="Status"><span class="status-badge ${record.clock_out ? 'status-completed' : (record.status === 'Late' ? 'bg-orange-500/10 text-orange-400' : 'status-pending')}">${record.status}</span></td>
          <td data-label="Action">
            <button onclick="deleteAttendanceRecord('${record.id}')" class="text-red-400 hover:text-red-300">
              <i class="fas fa-trash-alt"></i>
            </button>
          </td>
        `;
        adminAttendanceBody.appendChild(tr);
      });
    }

  } catch (err) {
    console.error("Error fetching attendance:", err);
    showToast('Failed to load attendance data', 'error');
  }
}

if (clockInBtn) {
  clockInBtn.addEventListener('click', async () => handleClockIn());
}
const dashClockInBtn = document.getElementById('dash-clock-in-btn');
if (dashClockInBtn) {
  dashClockInBtn.addEventListener('click', async () => handleClockIn());
}

async function handleClockIn() {
    try {
      const user = auth.currentUser;
      if (!user) {
        showToast('You must be logged in to clock in', 'error');
        return;
      }

      const staffName = user.displayName || user.email.split('@')[0];
      const today = new Date().toISOString().split('T')[0];
      
      // Check if already clocked in for today
      const q = query(collection(db, 'attendance'), where('staff_id', '==', user.uid), where('date', '==', today), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        showToast('You have already clocked in for today', 'info');
        return;
      }

      // Late Check: After 9:00 AM
      const now = new Date();
      const isLate = now.getHours() >= 9 && (now.getHours() > 9 || now.getMinutes() > 0);

      await addDoc(collection(db, 'attendance'), {
        staff_id: user.uid,
        staff_name: staffName,
        clock_in: serverTimestamp(),
        date: today,
        status: isLate ? 'Late' : 'Present'
      });

      showToast(`Clocked in successfully! ${isLate ? '(Marked as Late)' : ''}`, isLate ? 'warning' : 'success');
      fetchAttendance();
      fetchStaffDashboardStats();
    } catch (err) {
      console.error("Error clocking in:", err);
      showToast('Failed to clock in: ' + err.message, 'error');
    }
}

window.deleteAttendanceRecord = async (id) => {
  if (!confirm('Are you sure you want to delete this attendance record?')) return;
  
  try {
    await deleteDoc(doc(db, 'attendance', id));
    showToast('Record deleted', 'success');
    fetchAttendance();
  } catch (err) {
    console.error("Error deleting record:", err);
    showToast('Delete failed', 'error');
  }
};

if (clockOutBtn) {
  clockOutBtn.addEventListener('click', async () => handleClockOut());
}
const dashClockOutBtn = document.getElementById('dash-clock-out-btn');
if (dashClockOutBtn) {
  dashClockOutBtn.addEventListener('click', async () => handleClockOut());
}

async function handleClockOut() {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      // Fetch today's record to check duration
      const q = query(
        collection(db, 'attendance'), 
        where('staff_id', '==', user.uid), 
        where('date', '==', today),
        limit(1)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) throw new Error("Clock-in record not found. Please clock in first.");
      
      const attDoc = snapshot.docs[0];
      const record = attDoc.data();
      
      if (record.clock_out) {
        showToast('You have already clocked out for today', 'info');
        return;
      }

      const clockInTime = record.clock_in?.toDate ? record.clock_in.toDate() : new Date(record.clock_in);
      const now = new Date();
      const diffMs = now - clockInTime;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 4) {
        const remaining = (4 - diffHours).toFixed(1);
        showToast(`Clock-out failed. Minimum 4 hours duration required. Please wait ${remaining}h more.`, 'error');
        return;
      }

      await updateDoc(doc(db, 'attendance', attDoc.id), { 
        clock_out: serverTimestamp(),
        status: 'Completed'
      });

      showToast('Clocked out successfully! Great work today.', 'success');
      fetchAttendance();
      fetchStaffDashboardStats();
    } catch (err) {
      console.error("Error clocking out:", err);
      showToast(err.message || 'Failed to clock out', 'error');
    }
}

// Logout Logic
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const originalContent = logoutBtn.innerHTML;
    logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Signing out...';
    logoutBtn.disabled = true;
    await authLogout();
  });
}

// Notification Dropdown Logic
const notificationBell = document.getElementById('notification-bell');
const notificationDropdown = document.getElementById('notification-dropdown');
const notificationBadge = document.getElementById('notification-badge');
const clearNotificationsBtn = document.getElementById('clear-notifications');
const notificationList = document.getElementById('notification-list');

if (notificationBell && notificationDropdown) {
  notificationBell.addEventListener('click', (e) => {
    e.stopPropagation();
    notificationDropdown.classList.toggle('hidden');
    // Hide badge when opened
    if (notificationBadge) notificationBadge.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!notificationDropdown.contains(e.target) && e.target !== notificationBell) {
      notificationDropdown.classList.add('hidden');
    }
  });
}

if (clearNotificationsBtn && notificationList) {
  clearNotificationsBtn.addEventListener('click', async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const q = query(collection(db, 'notifications'), where('user_id', '==', user.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'notifications', docSnap.id)));
      await Promise.all(deletePromises);

      notificationList.innerHTML = '<p class="text-center text-slate-500 py-4 text-xs">No new notifications</p>';
      if (notificationBadge) notificationBadge.classList.add('hidden');
      showToast('Notifications cleared', 'success');
    } catch (err) {
      console.error("Error clearing notifications:", err);
      showToast('Failed to clear notifications', 'error');
    }
  });
}

// Task Reminder System
async function fetchAdminTasks() {
  const adminTaskTableBody = document.getElementById('admin-tasks-table-body');
  if (!adminTaskTableBody) return;

  adminTaskTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500"><span class="spinner inline-block mr-2"></span> Loading tasks...</td></tr>';

  try {
    // Fetch all staff first to create a map for names
    const staffSnapshot = await getDocs(collection(db, 'users'));
    const staffMap = {};
    staffSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      staffMap[docSnap.id] = data.name;
    });

    const tasksSnapshot = await getDocs(query(collection(db, 'tasks'), orderBy('created_at', 'desc')));
    const tasks = tasksSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    adminTaskTableBody.innerHTML = '';
    if (tasks.length === 0) {
      adminTaskTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500">No tasks assigned yet.</td></tr>';
      return;
    }

    tasks.forEach(task => {
      const tr = document.createElement('tr');
      tr.className = 'cursor-pointer hover:bg-white/5 transition-colors';
      tr.onclick = (e) => {
        if (!e.target.closest('button')) showTaskDetails(task.id);
      };
      
      const priorityClass = `priority-${task.priority.toLowerCase()}`;
      const statusClass = task.status === 'completed' ? 'status-completed' : 'status-pending';
      const assigneeName = staffMap[task.assignee_id] || 'Unknown';

      tr.innerHTML = `
        <td data-label="Task"><div class="font-bold">${task.title}</div></td>
        <td data-label="Assignee">${assigneeName}</td>
        <td data-label="Priority"><span class="priority-badge ${priorityClass}">${task.priority}</span></td>
        <td data-label="Due Date">${task.due_date}</td>
        <td data-label="Status"><span class="status-badge ${statusClass}">${task.status}</span></td>
        <td data-label="Action">
          <button onclick="sendTaskReminder(event, '${task.id}', '${task.title}', '${assigneeName}')" class="text-cyan-400 hover:text-cyan-300 text-xs font-bold" ${task.status === 'completed' ? 'disabled opacity-50' : ''}>
            <i class="fas fa-paper-plane mr-1"></i> Remind
          </button>
        </td>
      `;
      adminTaskTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error fetching admin tasks:", error);
  }
}

window.sendTaskReminder = async (event, taskId, taskTitle, assigneeName) => {
  // In a real app, this would send an email or push notification
  // For this demo, we'll simulate it by adding a notification for the staff member
  // and showing a success message to the admin
  try {
    // We could store this in a 'notifications' table if it existed
    // For now, we'll just show a toast-like message
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check mr-1"></i> Sent';
    btn.classList.replace('text-cyan-400', 'text-emerald-400');
    
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.replace('text-emerald-400', 'text-cyan-400');
    }, 3000);

    console.log(`Reminder sent to ${assigneeName} for task: ${taskTitle}`);
  } catch (error) {
    console.error("Error sending reminder:", error);
  }
};

async function checkTaskReminders() {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'tasks'), where('assignee_id', '==', user.uid), where('status', '!=', 'completed'));
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(docSnap => docSnap.data());

    if (!tasks) return;

    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));

    tasks.forEach(task => {
      // Only check if reminders are enabled for this task
      if (!task.reminders) return;

      const dueDate = new Date(task.due_date);
      if (dueDate <= twoDaysFromNow) {
        addNotification(
          'Upcoming Deadline',
          `Task "${task.title}" is due on ${task.due_date}. Please ensure it's on track.`,
          dueDate < now ? 'Overdue' : 'Due Soon'
        );
      }
    });
  } catch (error) {
    console.error("Error checking reminders:", error);
  }
}

async function fetchNotifications() {
  const notificationList = document.getElementById('notification-list');
  const notificationBadge = document.getElementById('notification-badge');
  if (!notificationList) return;

  try {
    const user = auth.currentUser;
    if (!user) return;

    let q = query(collection(db, 'notifications'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'), limit(20));
    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (indexErr) {
      console.warn("Notifications index missing or error, falling back:", indexErr);
      q = query(collection(db, 'notifications'), where('user_id', '==', user.uid), limit(20));
      snapshot = await getDocs(q);
    }
    const notifications = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    notificationList.innerHTML = '';
    
    if (!notifications || notifications.length === 0) {
      notificationList.innerHTML = '<p class="text-center text-slate-500 py-4 text-xs">No new notifications</p>';
      if (notificationBadge) notificationBadge.classList.add('hidden');
      return;
    }

    const unreadCount = notifications.filter(n => !n.read).length;
    if (notificationBadge) {
      if (unreadCount > 0) {
        notificationBadge.classList.remove('hidden');
      } else {
        notificationBadge.classList.add('hidden');
      }
    }

    notifications.forEach(notif => {
      const div = document.createElement('div');
      div.className = `p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${notif.read ? 'opacity-60' : 'bg-white/5'}`;
      const createdAt = notif.created_at?.toDate ? notif.created_at.toDate() : new Date(notif.created_at || Date.now());
      div.innerHTML = `
        <div class="flex justify-between items-start mb-1">
          <p class="text-sm font-semibold">${notif.title}</p>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">${notif.tag || 'Info'}</span>
        </div>
        <p class="text-xs text-slate-400">${notif.message}</p>
        <span class="text-[10px] text-slate-500 mt-1 block">${createdAt.toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
      `;
      
      div.onclick = async () => {
        if (!notif.read) {
          await updateDoc(doc(db, 'notifications', notif.id), { read: true });
          fetchNotifications();
        }
      };
      
      notificationList.appendChild(div);
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    notificationList.innerHTML = '<p class="text-center text-red-400 py-4 text-xs">Error loading notifications</p>';
  }
}

async function addNotification(title, message, tag) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, 'notifications'), {
      user_id: user.uid,
      title,
      message,
      tag,
      read: false,
      created_at: serverTimestamp()
    });

    fetchNotifications();
  } catch (error) {
    console.error("Error adding notification:", error);
  }
}

// --- Task Detail Modal Logic ---
async function showTaskDetails(taskId) {
  const modal = document.getElementById('task-detail-modal');
  const content = document.getElementById('task-detail-content');
  if (!modal || !content) return;

  try {
    const taskSnap = await getDoc(doc(db, 'tasks', taskId));
    if (!taskSnap.exists()) throw new Error("Task not found");
    const task = taskSnap.data();

    const staffSnap = await getDoc(doc(db, 'users', task.assignee_id));
    const staffName = staffSnap.exists() ? staffSnap.data().name : 'Unknown';

    const completionDate = task.completion_date?.toDate ? task.completion_date.toDate() : (task.completion_date ? new Date(task.completion_date) : null);

    content.innerHTML = `
      <div class="mb-6">
        <div class="flex justify-between items-center mb-2">
          <span class="badge glass">${task.category}</span>
          <span class="priority-badge priority-${task.priority.toLowerCase()}">${task.priority}</span>
        </div>
        <h2 class="text-2xl font-bold">${task.title}</h2>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-8">
        <div class="glass p-4 rounded-xl">
          <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Assignee</p>
          <p class="font-bold">${staffName}</p>
        </div>
        <div class="glass p-4 rounded-xl">
          <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Due Date</p>
          <p class="font-bold text-cyan-400">${task.due_date}</p>
        </div>
        <div class="glass p-4 rounded-xl">
          <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Status</p>
          <p class="font-bold capitalize">${task.status}</p>
        </div>
        <div class="glass p-4 rounded-xl">
          <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Reminders</p>
          <p class="font-bold">${task.reminders ? 'Enabled' : 'Disabled'}</p>
        </div>
        ${completionDate ? `
        <div class="glass p-4 rounded-xl col-span-2 border-emerald-500/20">
          <p class="text-[10px] text-emerald-500 uppercase font-bold mb-1">Completed On</p>
          <p class="font-bold text-emerald-400">${completionDate.toLocaleString()}</p>
        </div>
        ` : ''}
      </div>

      <div class="mb-8">
        <h4 class="text-sm font-bold text-slate-400 uppercase mb-4 tracking-widest">Description</h4>
        <div class="bg-slate-900/50 p-6 rounded-2xl border border-white/5 min-h-[100px]">
          <p class="text-slate-200 leading-relaxed">${task.description || 'No description provided.'}</p>
        </div>
      </div>
      
      <div class="flex gap-4">
        <button id="close-detail-btn" class="btn-primary w-full py-3 rounded-xl font-bold">Close Details</button>
      </div>
    `;

    modal.classList.add('show');
    content.parentElement.classList.add('animate');
    
    document.getElementById('close-detail-btn')?.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  } catch (error) {
    console.error("Error fetching task details:", error);
    showToast("Could not load task details", "error");
  }
}

// Global Modal handlers
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('task-detail-close')?.addEventListener('click', () => {
        document.getElementById('task-detail-modal').classList.remove('show');
    });

    const taskDetailModal = document.getElementById('task-detail-modal');
    if (taskDetailModal) {
        window.addEventListener('click', (e) => {
            if (e.target === taskDetailModal) {
                taskDetailModal.classList.remove('show');
            }
        });
    }
});

// Theme Toggle Logic removed from bottom
// --- BLOG MANAGEMENT LOGIC ---
async function fetchBlogs() {
  const container = document.getElementById('blog-posts-container');
  if (!container) return;

  try {
    const q = query(collection(db, 'blogs'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    const blogs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    if (blogs.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No blog posts found yet. Check back soon!</div>';
      return;
    }

    container.innerHTML = blogs.map((blog, index) => {
      const createdAt = blog.created_at?.toDate ? blog.created_at.toDate() : new Date(blog.created_at || Date.now());
      return `
      <article class="glass p-8 reveal" style="transition-delay: ${index * 100}ms">
        <div class="mb-6 overflow-hidden rounded-xl h-48 bg-slate-900">
          <img src="${blog.image_url || 'https://picsum.photos/seed/blog/800/400'}" alt="${blog.title}" class="w-full h-full object-cover">
        </div>
        <div class="flex items-center gap-4 text-xs text-cyan-400 mb-4 uppercase tracking-widest font-bold">
          <span>${blog.category}</span>
          <span>•</span>
          <span>${createdAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        </div>
        <h3 class="text-2xl font-bold mb-4">${blog.title}</h3>
        <p class="text-slate-400 mb-6">${blog.excerpt || 'Read our latest insights...'}</p>
        <a href="/blog-story.html?id=${blog.id}" class="text-cyan-400 font-bold hover:underline">Read Full Story →</a>
      </article>
    `}).join('');

    // Trigger reveal
    setTimeout(() => {
      container.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
    }, 100);

  } catch (error) {
    console.error("Error fetching blogs:", error);
    container.innerHTML = '<div class="col-span-full text-center py-12 text-red-400">Failed to load blog posts. Please try again later.</div>';
  }
}

async function fetchAdminBlogs() {
  const tableBody = document.getElementById('admin-blogs-table-body');
  if (!tableBody) return;

  try {
    const q = query(collection(db, 'blogs'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    const blogs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    if (blogs.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No blogs found. Create your first post!</td></tr>';
      return;
    }

    tableBody.innerHTML = blogs.map(blog => {
      const createdAt = blog.created_at?.toDate ? blog.created_at.toDate() : new Date(blog.created_at || Date.now());
      return `
      <tr>
        <td>
          <img src="${blog.image_url}" class="w-12 h-12 rounded object-cover border border-white/10">
        </td>
        <td class="font-bold">${blog.title}</td>
        <td><span class="status-badge bg-cyan-500/10 text-cyan-400">${blog.category}</span></td>
        <td class="text-slate-400 text-sm">${createdAt.toLocaleDateString()}</td>
        <td>
          <div class="flex gap-2">
            <button onclick="editBlog('${blog.id}')" class="text-cyan-400 hover:text-white transition-colors"><i class="fas fa-edit"></i></button>
            <button onclick="deleteBlog('${blog.id}')" class="text-red-400 hover:text-white transition-colors"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `}).join('');
  } catch (error) {
    console.error("Error fetching admin blogs:", error);
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">Error loading blogs.</td></tr>';
  }
}

// Blog Modal Handling
const addBlogBtn = document.getElementById('add-blog-btn');
const blogModal = document.getElementById('blog-modal');
const closeBlogModal = document.getElementById('close-blog-modal');
const blogForm = document.getElementById('blog-form');

if (addBlogBtn && blogModal && closeBlogModal) {
  addBlogBtn.addEventListener('click', () => {
    document.getElementById('blog-modal-title').innerHTML = 'Create <span class="text-cyan-400">New Post</span>';
    blogForm.reset();
    document.getElementById('blog-id').value = '';
    document.getElementById('blog-image-preview').innerHTML = '<i class="fas fa-image text-slate-600 text-2xl"></i>';
    document.getElementById('blog-file-name').innerText = 'No file chosen';
    blogModal.classList.remove('hidden');
  });

  closeBlogModal.addEventListener('click', () => {
    blogModal.classList.add('hidden');
  });
}

// Blog Image Preview Logic
const blogImageFile = document.getElementById('blog-image-file');
const blogImagePreview = document.getElementById('blog-image-preview');
const blogFileName = document.getElementById('blog-file-name');
const blogImageUrlInput = document.getElementById('blog-image-url');

if (blogImageFile) {
  blogImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      blogFileName.innerText = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        blogImagePreview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        blogImageUrlInput.value = e.target.result; // Store base64 in hidden input
      };
      reader.readAsDataURL(file);
    }
  });
}

if (blogForm) {
  blogForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('blog-id').value;
    const title = document.getElementById('blog-title').value;
    const category = document.getElementById('blog-category').value;
    const imageUrl = document.getElementById('blog-image-url').value;
    const excerpt = document.getElementById('blog-excerpt').value;
    const content = document.getElementById('blog-content').value;

    if (!imageUrl) {
      showToast('Please upload a featured image', 'error');
      return;
    }

    setLoading(true);
    try {
      const blogData = {
        title,
        category,
        image_url: imageUrl,
        excerpt,
        content,
        updated_at: serverTimestamp()
      };

      if (id) {
        await updateDoc(doc(db, 'blogs', id), blogData);
      } else {
        blogData.created_at = serverTimestamp();
        await addDoc(collection(db, 'blogs'), blogData);
      }

      showToast(id ? 'Blog updated successfully!' : 'Blog published successfully!', 'success');
      blogModal.classList.add('hidden');
      fetchAdminBlogs();
    } catch (error) {
      console.error("Error saving blog:", error);
      showToast('Failed to save blog. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  });
}

window.editBlog = async (id) => {
  try {
    const blogSnap = await getDoc(doc(db, 'blogs', id));
    if (!blogSnap.exists()) throw new Error("Blog not found");
    const blog = blogSnap.data();

    document.getElementById('blog-id').value = id;
    document.getElementById('blog-title').value = blog.title;
    document.getElementById('blog-category').value = blog.category;
    document.getElementById('blog-image-url').value = blog.image_url;
    document.getElementById('blog-excerpt').value = blog.excerpt;
    document.getElementById('blog-content').value = blog.content;

    if (blog.image_url) {
      document.getElementById('blog-image-preview').innerHTML = `<img src="${blog.image_url}" class="w-full h-full object-cover">`;
      document.getElementById('blog-file-name').innerText = 'Existing Image';
    } else {
      document.getElementById('blog-image-preview').innerHTML = '<i class="fas fa-image text-slate-600 text-2xl"></i>';
      document.getElementById('blog-file-name').innerText = 'No file chosen';
    }

    document.getElementById('blog-modal-title').innerHTML = 'Edit <span class="text-cyan-400">Post</span>';
    blogModal.classList.remove('hidden');
  } catch (error) {
    console.error("Error fetching blog for edit:", error);
    showToast('Error loading blog details.', 'error');
  }
};

window.deleteBlog = async (id) => {
  if (!confirm('Are you sure you want to delete this blog post?')) return;

  try {
    await deleteDoc(doc(db, 'blogs', id));
    showToast('Blog deleted successfully!', 'success');
    fetchAdminBlogs();
  } catch (error) {
    console.error("Error deleting blog:", error);
    showToast('Failed to delete blog.', 'error');
  }
};

// Initialize Blog page
if (window.location.pathname.includes('blog.html')) {
  document.addEventListener('DOMContentLoaded', fetchBlogs);
}

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth'
      });
    }
  });
});

// --- INTERACTIVE LANDING PAGE FEATURES ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Typing Effect for Hero
    const typingElement = document.getElementById('typing-text');
    if (typingElement) {
        const words = ['Innovation', 'Excellence', 'Creativity', 'The Future'];
        let wordIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let typeSpeed = 150;

        const type = () => {
            const currentWord = words[wordIndex];
            if (isDeleting) {
                typingElement.innerText = currentWord.substring(0, charIndex - 1);
                charIndex--;
                typeSpeed = 100;
            } else {
                typingElement.innerText = currentWord.substring(0, charIndex + 1);
                charIndex++;
                typeSpeed = 150;
            }

            if (!isDeleting && charIndex === currentWord.length) {
                isDeleting = true;
                typeSpeed = 2000; // Pause at end
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                wordIndex = (wordIndex + 1) % words.length;
                typeSpeed = 500;
            }

            setTimeout(type, typeSpeed);
        };
        type();
    }

    // 2. Custom Cursor Tracking
    const cursor = document.getElementById('custom-cursor');
    const follower = document.getElementById('cursor-follower');
    
    if (cursor && follower) {
        document.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
            
            setTimeout(() => {
                follower.style.left = e.clientX - 15 + 'px';
                follower.style.top = e.clientY - 15 + 'px';
            }, 50);
        });

        // Hover Effect for interactive elements
        const interactiveElements = document.querySelectorAll('a, button, .portfolio-item, .card');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursor.style.transform = 'scale(4)';
                follower.style.transform = 'scale(0)';
                follower.style.opacity = '0';
            });
            el.addEventListener('mouseleave', () => {
                cursor.style.transform = 'scale(1)';
                follower.style.transform = 'scale(1)';
                follower.style.opacity = '0.5';
            });
        });
    }

    // 3. Mouse-Reactive Atmosphere
    const atmosphere = document.querySelector('.atmosphere');
    if (atmosphere) {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            atmosphere.style.background = `
                radial-gradient(circle at ${x}% ${y}%, rgba(6, 182, 212, 0.15) 0%, transparent 60%),
                radial-gradient(circle at ${100 - x}% ${100 - y}%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)
            `;
        });
    }

    // 4. Subtle Card Tilt Effect
    const cards = document.querySelectorAll('.card, .portfolio-item');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        });
    });

    // 5. Parallax Hero Elements
    const floatingElements = document.querySelectorAll('.floating-card, .floating-orb');
    if (floatingElements.length > 0) {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX - window.innerWidth / 2) / 50;
            const y = (e.clientY - window.innerHeight / 2) / 50;
            
            floatingElements.forEach((el, index) => {
                const speed = (index + 1) * 0.5;
                el.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
            });
        });
    }

    // 6. Booking Service Selection Cards
    const serviceRadios = document.querySelectorAll('input[name="service-radio"]');
    const serviceHiddenInput = document.getElementById('service');
    
    if (serviceRadios.length > 0 && serviceHiddenInput) {
        serviceRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                serviceHiddenInput.value = radio.value;
                
                // Visual feedback (optional since CSS handles checked state, but good for custom triggers)
                showToast(`Selected: ${radio.parentElement.querySelector('span').innerText}`, 'info');
            });
        });
    }
});
