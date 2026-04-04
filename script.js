import { supabase } from './supabase';
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

// Auth State Listener
try {
  if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user;
      const path = window.location.pathname;
      const isUserAdmin = await isAdmin(user);
      
      // Show/hide currency selector based on login status
      if (user) {
        document.body.classList.add('is-logged-in');
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
        let userRole = 'Staff';
        let userName = user.user_metadata?.full_name || user.email.split('@')[0];

        if (isUserAdmin) {
          userRole = 'Admin';
          document.body.classList.add('is-admin');
          document.body.classList.remove('is-staff');
        } else {
          // Check staff table for role
          try {
            const { data: staffData, error } = await supabase
              .from('staff')
              .select('*')
              .eq('email', user.email)
              .single();
            
            if (error || !staffData) {
              // Not a registered staff member
              await supabase.auth.signOut();
              window.location.href = '/';
              return;
            }
            
            userRole = staffData.role;
            userName = staffData.name;
            document.body.classList.add('is-staff');
            document.body.classList.remove('is-admin');
          } catch (err) {
            console.error("Role check failed:", err);
            window.location.href = '/';
            return;
          }
        }

        // Update Sidebar Profile
        const sidebarName = document.getElementById('user-name-sidebar');
        const sidebarRole = document.getElementById('user-role-sidebar');
        const sidebarAvatar = document.getElementById('user-avatar-sidebar');
        const headerName = document.getElementById('user-name-header');
        const headerAvatar = document.getElementById('user-avatar-header');

        if (sidebarName) sidebarName.innerText = userName;
        if (sidebarRole) sidebarRole.innerText = userRole;
        if (sidebarAvatar) sidebarAvatar.innerText = userName.charAt(0).toUpperCase();
        if (headerName) headerName.innerText = userName;
        if (headerAvatar) headerAvatar.innerText = userName.charAt(0).toUpperCase();

        const welcomeName = document.getElementById('welcome-name');
        if (welcomeName) welcomeName.innerText = userName;

        const settingsName = document.getElementById('settings-name');
        const settingsEmail = document.getElementById('settings-email');
        if (settingsName) settingsName.value = userName;
        if (settingsEmail) settingsEmail.value = user.email;

        // Initial Data Fetch
        if (userRole === 'Admin') {
          fetchDashboardStats();
          fetchBookings();
          fetchStaff();
          fetchStaffForDropdown();
          fetchAdminTasks();
        } else {
          fetchMyTasks();
          fetchStaffDashboardStats();
          checkTaskReminders();
          
          // Task Status Filter Event Listener
          const taskStatusFilter = document.getElementById('task-status-filter');
          if (taskStatusFilter) {
            taskStatusFilter.addEventListener('change', fetchMyTasks);
          }
        }
      }
    });
  }
} catch (err) { console.error("Supabase auth failed:", err); }

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

      // Configuration Check
      const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder');
      if (!isSupabaseConfigured) {
        showToast('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment settings and redeploy.', 'error');
        setLoading(submitBtn, false, originalText);
        return;
      }

      try {
        // Attempt Email/Password Login for everyone
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          // If it's an admin email and password login fails, maybe they should use Google?
          // But for now, let's just show the error.
          throw error;
        }

        const user = data.user;
        const isUserAdmin = await isAdmin(user);
        
        // Set admin session flag for UI consistency
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
        
        let errorMsg = error.message || 'An unexpected error occurred.';
        if (errorMsg === 'Failed to fetch') {
          errorMsg = 'Connection error: Could not reach the server. Please check your internet connection or Supabase configuration.';
        }
        
        showToast(`Login error: ${errorMsg}`, 'error');
        
        // Check if it's an admin trying to login but Google OAuth is expected
        const isAdminEmail = await isAdmin({ email: email });
        if (isAdminEmail && error.message.includes('Invalid login credentials')) {
          showToast('Admin login failed. If you usually use Google, please ensure it is enabled in Supabase.', 'error');
        } else {
          showToast('Login failed: ' + error.message, 'error');
        }
        
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
        // 1. Try to save to Supabase
        const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder');
        
        if (isSupabaseConfigured) {
          const { error } = await supabase
            .from('bookings')
            .insert([{
              client_name: name,
              email: email,
              service: service,
              date: date,
              time: time,
              status: 'Pending',
              created_at: new Date().toISOString()
            }]);

          if (error) {
            console.error("Supabase insert error:", error);
            // We don't throw yet, we'll try email as fallback/secondary
          }
        } else {
          console.warn("Supabase not configured. Skipping DB insert.");
        }

        // 2. Send Email Notification
        try {
          await sendEmail(
            email, 
            'Booking Confirmation - Lumina Tech', 
            `Hi ${name},\n\nYour booking for ${service} on ${date} at ${time} has been received. We will contact you shortly to confirm.\n\nBest regards,\nLumina Tech Team`
          );
          
          // Also notify admin (optional, using a placeholder admin email if not set)
          const adminEmail = 'princedagogoekine@gmail.com'; // User's email from context
          await sendEmail(
            adminEmail,
            'New Booking Received',
            `New booking from ${name} (${email})\nService: ${service}\nDate: ${date}\nTime: ${time}`
          );
        } catch (emailErr) {
          console.error("Failed to send confirmation email:", emailErr);
          // If Supabase also failed, then we show error
          if (!isSupabaseConfigured) {
             throw new Error("Could not save booking or send email. Please check your connection.");
          }
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

        // 1. Create the user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role: role,
              phone: phone
            }
          }
        });

        if (authError) throw authError;

        // 2. Save to our staff table for management
        const staffData = {
          id: authData.user?.id, // Link to auth user
          name: name,
          email: email,
          phone_number: phone,
          role: role,
          status: 'Active',
          created_at: new Date().toISOString()
        };
        
        const { error: dbError } = await supabase
          .from('staff')
          .insert([staffData]);

        if (dbError) throw dbError;
        
        showToast('Staff account created!', 'success');
        form.reset();
        setLoading(submitBtn, false, originalText);
        if (staffModal) staffModal.classList.remove('show');
        
        if (typeof fetchStaff === 'function') fetchStaff();
      } catch (error) {
        console.error("Error creating staff:", error);
        showToast('Error: ' + error.message, 'error');
        setLoading(submitBtn, false, originalText);
      }
    } else {
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

if (adminMobileToggle && sidebar) {
  adminMobileToggle.addEventListener('click', () => {
    sidebar.classList.toggle('show');
    const icon = adminMobileToggle.querySelector('i');
    if (sidebar.classList.contains('show')) {
      icon.classList.replace('fa-bars', 'fa-times');
    } else {
      icon.classList.replace('fa-times', 'fa-bars');
    }
  });
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
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, name, role')
      .order('name');

    if (error) throw error;

    const userResponse = await supabase.auth.getUser();
    const myId = userResponse.data.user?.id;

    // Keep the Global Chat item
    const globalItem = `
      <div class="p-3 rounded-lg ${activeRecipient === 'global' ? 'bg-cyan-500/20 border border-cyan-500/30' : 'hover:bg-white/5 border border-transparent'} cursor-pointer flex items-center gap-3 transition-all chat-contact" data-recipient="global">
        <div class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-black font-bold text-xs">G</div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold truncate">Global Chat</p>
          <p class="text-[10px] text-slate-400 truncate">Everyone in the team</p>
        </div>
      </div>
    `;

    chatContactList.innerHTML = globalItem;

    staff.forEach(person => {
      // Don't show self in contact list
      if (person.id === myId) return;

      const contactDiv = document.createElement('div');
      contactDiv.className = `p-3 rounded-lg ${activeRecipient === person.id ? 'bg-cyan-500/20 border border-cyan-500/30' : 'hover:bg-white/5 border border-transparent'} cursor-pointer flex items-center gap-3 transition-all chat-contact`;
      contactDiv.dataset.recipient = person.id;
      contactDiv.dataset.name = person.name;
      contactDiv.dataset.role = person.role;
      
      contactDiv.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-xs">
          ${person.name.charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold truncate">${person.name}</p>
          <p class="text-[10px] text-slate-400 truncate">${person.role}</p>
        </div>
      `;
      
      contactDiv.addEventListener('click', () => {
        activeRecipient = person.id;
        activeChatName.innerText = person.name;
        activeChatAvatar.innerText = person.name.charAt(0);
        activeChatAvatar.className = 'w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold';
        activeChatStatus.innerText = person.role;
        activeChatStatus.className = 'text-[10px] text-slate-400';
        
        // Update active state in UI
        document.querySelectorAll('.chat-contact').forEach(c => {
          c.classList.remove('bg-cyan-500/20', 'border-cyan-500/30');
          c.classList.add('hover:bg-white/5', 'border-transparent');
        });
        contactDiv.classList.add('bg-cyan-500/20', 'border-cyan-500/30');
        contactDiv.classList.remove('hover:bg-white/5', 'border-transparent');
        
        fetchChatMessages();
      });

      chatContactList.appendChild(contactDiv);
    });

    // Add listener to global item
    const globalBtn = chatContactList.querySelector('[data-recipient="global"]');
    if (globalBtn) {
      globalBtn.addEventListener('click', () => {
        activeRecipient = 'global';
        activeChatName.innerText = 'Global Chat';
        activeChatAvatar.innerText = 'G';
        activeChatAvatar.className = 'w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-black font-bold';
        activeChatStatus.innerText = 'Public Channel';
        activeChatStatus.className = 'text-[10px] text-cyan-400';
        
        document.querySelectorAll('.chat-contact').forEach(c => {
          c.classList.remove('bg-cyan-500/20', 'border-cyan-500/30');
          c.classList.add('hover:bg-white/5', 'border-transparent');
        });
        globalBtn.classList.add('bg-cyan-500/20', 'border-cyan-500/30');
        globalBtn.classList.remove('hover:bg-white/5', 'border-transparent');
        
        fetchChatMessages();
      });
    }

  } catch (err) {
    console.error("Error fetching contacts:", err);
  }
}

async function fetchChatMessages() {
  if (!chatMessages) return;
  
  try {
    const user = (await supabase.auth.getUser()).data.user;
    const myId = user?.id || 'admin-session';
    
    let query = supabase.from('messages').select('*');

    if (activeRecipient === 'global') {
      query = query.is('recipient_id', null);
    } else {
      // One-on-one: messages where (sender=me AND recipient=them) OR (sender=them AND recipient=me)
      query = query.or(`and(sender_id.eq.${myId},recipient_id.eq.${activeRecipient}),and(sender_id.eq.${activeRecipient},recipient_id.eq.${myId})`);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw error;

    chatMessages.innerHTML = '';
    if (data.length === 0) {
      chatMessages.innerHTML = `<div class="text-center py-12 text-slate-500">No messages with ${activeChatName.innerText} yet.</div>`;
    } else {
      data.forEach(msg => {
        const isMe = msg.sender_id === myId;
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;
        msgDiv.innerHTML = `
          <div class="max-w-[80%] p-3 rounded-xl ${isMe ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white'}">
            ${activeRecipient === 'global' ? `<p class="text-[10px] opacity-60 mb-1">${msg.sender_name}</p>` : ''}
            <p class="text-sm">${msg.content}</p>
          </div>
          <span class="text-[10px] text-slate-500 mt-1">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        `;
        chatMessages.appendChild(msgDiv);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } catch (err) {
    console.error("Error fetching chat:", err);
  }
}

if (teamChatForm) {
  teamChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = chatInput.value.trim();
    if (!content) return;

    const user = (await supabase.auth.getUser()).data.user;
    const isAdmin = localStorage.getItem('isAdminSession') === 'true';
    const senderName = isAdmin ? 'Admin' : (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Staff');
    const senderId = user?.id || 'admin-session';

    try {
      const messageData = {
        sender_id: senderId,
        sender_name: senderName,
        content: content,
        created_at: new Date().toISOString()
      };

      if (activeRecipient !== 'global') {
        messageData.recipient_id = activeRecipient;
      }

      const { error } = await supabase
        .from('messages')
        .insert([messageData]);

      if (error) throw error;
      chatInput.value = '';
      fetchChatMessages();
    } catch (err) {
      console.error("Error sending message:", err);
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
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    announcementsList.innerHTML = '';
    if (data.length === 0) {
      announcementsList.innerHTML = '<div class="text-center py-12 text-slate-500">No announcements yet</div>';
    } else {
      data.forEach(ann => {
        const annDiv = document.createElement('div');
        annDiv.className = 'glass p-6 border-l-4 border-cyan-500';
        annDiv.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-xl font-bold">${ann.title}</h3>
            <span class="text-xs text-slate-400">${new Date(ann.created_at).toLocaleDateString()}</span>
          </div>
          <p class="text-slate-300 leading-relaxed">${ann.content}</p>
          <div class="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] text-cyan-400 font-bold">
              ${ann.author_name.charAt(0)}
            </div>
            <span class="text-xs text-slate-400">Posted by ${ann.author_name}</span>
          </div>
        `;
        announcementsList.appendChild(annDiv);
      });
    }
  } catch (err) {
    console.error("Error fetching announcements:", err);
  }
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

      const userResponse = await supabase.auth.getUser();
      const user = userResponse.data.user;
      const isAdmin = localStorage.getItem('isAdminSession') === 'true';
      const authorName = isAdmin ? 'Admin' : (user?.user_metadata?.full_name || 'Staff');

      try {
        const { error } = await supabase
          .from('announcements')
          .insert([{
            title: document.getElementById('announcement-title').value,
            content: document.getElementById('announcement-content').value,
            author_id: user?.id || null,
            author_name: authorName,
            created_at: new Date().toISOString()
          }]);

      if (error) throw error;

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
        showToast(`Failed to post: ${err.message || 'Unknown error'}`, 'error');
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
      let errorMsg = err.message || 'An unexpected error occurred.';
      if (errorMsg === 'Failed to fetch') {
        errorMsg = 'Connection error: Could not reach the email server. Please check your connection.';
      }
      showToast(`Error: ${errorMsg}`, 'error');
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
    const userResponse = await supabase.auth.getUser();
    const user = userResponse.data.user;
    if (!user) return;

    // Fetch all attendance to calculate streaks
    const { data: allAttendance, error } = await supabase
      .from('attendance')
      .select('staff_id, staff_name, date')
      .order('date', { ascending: false });

    if (error) throw error;

    const staffStreaks = {};
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    allAttendance.forEach(record => {
      if (!staffStreaks[record.staff_id]) {
        staffStreaks[record.staff_id] = {
          name: record.staff_name,
          current: 0,
          best: 0,
          lastDate: null,
          dates: new Set()
        };
      }
      staffStreaks[record.staff_id].dates.add(record.date);
    });

    // Calculate streaks for each staff
    Object.keys(staffStreaks).forEach(id => {
      const dates = Array.from(staffStreaks[id].dates).sort().reverse();
      let current = 0;
      let best = 0;
      let temp = 0;

      // Current streak check
      let checkDate = new Date();
      if (!staffStreaks[id].dates.has(today) && !staffStreaks[id].dates.has(yesterday)) {
        current = 0;
      } else {
        let d = staffStreaks[id].dates.has(today) ? new Date(today) : new Date(yesterday);
        while (staffStreaks[id].dates.has(d.toISOString().split('T')[0])) {
          current++;
          d.setDate(d.getDate() - 1);
        }
      }

      // Best streak check
      let lastD = null;
      dates.reverse().forEach(dateStr => {
        const d = new Date(dateStr);
        if (lastD) {
          const diff = (d - lastD) / 86400000;
          if (diff === 1) {
            temp++;
          } else {
            temp = 1;
          }
        } else {
          temp = 1;
        }
        best = Math.max(best, temp);
        lastD = d;
      });

      staffStreaks[id].current = current;
      staffStreaks[id].best = best;
    });

    // Update My Stats
    const myStats = staffStreaks[user.id] || { current: 0, best: 0, dates: new Set() };
    document.getElementById('my-streak-count').innerText = myStats.current;
    document.getElementById('my-best-streak').innerText = myStats.best;
    document.getElementById('total-days-worked').innerText = myStats.dates.size;
    
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const consistency = ((myStats.dates.size / daysInMonth) * 100).toFixed(0);
    document.getElementById('consistency-score').innerText = `${consistency}%`;

    // Update Leaderboard
    const leaderboardBody = document.getElementById('streaks-leaderboard-body');
    leaderboardBody.innerHTML = '';
    
    const sortedStaff = Object.values(staffStreaks).sort((a, b) => b.current - a.current);
    if (sortedStaff.length > 0) {
      document.getElementById('top-streak-name').innerText = sortedStaff[0].name;
    }

    sortedStaff.forEach((staff, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="font-bold text-slate-500">#${index + 1}</span></td>
        <td>
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
              ${staff.name.charAt(0)}
            </div>
            <span>${staff.name}</span>
          </div>
        </td>
        <td>
          <div class="flex items-center gap-2">
            <i class="fas fa-fire text-orange-500"></i>
            <span class="font-bold">${staff.current} Days</span>
          </div>
        </td>
        <td>${staff.best} Days</td>
        <td><span class="status-badge ${staff.current > 0 ? 'status-completed' : 'status-pending'}">${staff.current > 0 ? 'Active' : 'Inactive'}</span></td>
      `;
      leaderboardBody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error fetching streaks:", err);
  }
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
    const { data, error } = await supabase
      .from('recognition')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    recognitionGrid.innerHTML = '';
    if (data.length === 0) {
      recognitionGrid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No recognition awards yet.</div>';
    } else {
      data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'glass p-6 relative overflow-hidden group';
        card.innerHTML = `
          <div class="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center text-black font-bold text-xl">
              <i class="fas fa-medal"></i>
            </div>
            <div>
              <h4 class="font-bold text-lg">${item.staff_name}</h4>
              <p class="text-xs text-cyan-400 font-bold uppercase tracking-widest">${item.type}</p>
            </div>
          </div>
          <p class="text-slate-400 text-sm italic mb-4">"${item.message}"</p>
          <div class="flex justify-between items-center pt-4 border-t border-slate-800">
            <span class="text-[10px] text-slate-500 uppercase font-bold">${new Date(item.created_at).toLocaleDateString()}</span>
            <span class="text-[10px] text-slate-500">By Admin</span>
          </div>
        `;
        recognitionGrid.appendChild(card);
      });
    }

    // Populate staff dropdown for modal
    if (recognitionStaffSelect) {
      const { data: staff } = await supabase.from('staff').select('id, name');
      recognitionStaffSelect.innerHTML = staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

  } catch (err) {
    console.error("Error fetching recognition:", err);
  }
}

if (giveRecognitionBtn) {
  giveRecognitionBtn.addEventListener('click', () => recognitionModal.classList.remove('hidden'));
}
if (closeRecognitionModal) {
  closeRecognitionModal.addEventListener('click', () => recognitionModal.classList.add('hidden'));
}

if (recognitionForm) {
  recognitionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const staffId = document.getElementById('recognition-staff-id').value;
    const staffName = recognitionStaffSelect.options[recognitionStaffSelect.selectedIndex].text;
    const type = document.getElementById('recognition-type').value;
    const message = document.getElementById('recognition-message').value;

    try {
      const { error } = await supabase
        .from('recognition')
        .insert([{ staff_id: staffId, staff_name: staffName, type, message }]);

      if (error) throw error;

      showToast('Recognition submitted!', 'success');
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
    const userResponse = await supabase.auth.getUser();
    const user = userResponse.data.user;
    if (!user) return;

    // Fetch My Leave History
    const { data: myLeaves, error: myError } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('staff_id', user.id)
      .order('created_at', { ascending: false });

    if (myError) throw myError;

    myLeaveHistoryBody.innerHTML = '';
    let pendingCount = 0;
    let approvedCount = 0;

    myLeaves.forEach(leave => {
      if (leave.status === 'Pending') pendingCount++;
      if (leave.status === 'Approved') approvedCount++;

      const tr = document.createElement('tr');
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      const days = Math.ceil((end - start) / 86400000) + 1;

      tr.innerHTML = `
        <td>${leave.type}</td>
        <td>${leave.start_date}</td>
        <td>${leave.end_date}</td>
        <td>${days} Days</td>
        <td><span class="status-badge ${leave.status === 'Approved' ? 'status-completed' : leave.status === 'Rejected' ? 'status-cancelled' : 'status-pending'}">${leave.status}</span></td>
        <td>
          ${leave.status === 'Pending' ? `<button onclick="cancelLeave('${leave.id}')" class="text-red-400 hover:text-red-500"><i class="fas fa-times"></i></button>` : '--'}
        </td>
      `;
      myLeaveHistoryBody.appendChild(tr);
    });

    document.getElementById('pending-leave-count').innerText = pendingCount;
    document.getElementById('approved-leave-count').innerText = approvedCount;

    // Admin View: All Leave Requests
    const isAdmin = localStorage.getItem('isAdminSession') === 'true';
    if (isAdmin && adminLeaveRequestsBody) {
      const { data: allLeaves, error: allError } = await supabase
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) throw allError;

      adminLeaveRequestsBody.innerHTML = '';
      allLeaves.forEach(leave => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${leave.staff_name}</td>
          <td>${leave.type}</td>
          <td>${leave.start_date} to ${leave.end_date}</td>
          <td class="max-w-xs truncate">${leave.reason}</td>
          <td><span class="status-badge ${leave.status === 'Approved' ? 'status-completed' : leave.status === 'Rejected' ? 'status-cancelled' : 'status-pending'}">${leave.status}</span></td>
          <td>
            ${leave.status === 'Pending' ? `
              <button onclick="updateLeaveStatus('${leave.id}', 'Approved')" class="text-emerald-400 hover:text-emerald-500 mr-2"><i class="fas fa-check"></i></button>
              <button onclick="updateLeaveStatus('${leave.id}', 'Rejected')" class="text-red-400 hover:text-red-500"><i class="fas fa-times"></i></button>
            ` : '--'}
          </td>
        `;
        adminLeaveRequestsBody.appendChild(tr);
      });
    }

  } catch (err) {
    console.error("Error fetching leave requests:", err);
  }
}

if (applyLeaveBtn) {
  applyLeaveBtn.addEventListener('click', () => leaveModal.classList.remove('hidden'));
}
if (closeLeaveModal) {
  closeLeaveModal.addEventListener('click', () => leaveModal.classList.add('hidden'));
}

if (leaveForm) {
  leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userResponse = await supabase.auth.getUser();
    const user = userResponse.data.user;
    
    const type = document.getElementById('leave-type').value;
    const startDate = document.getElementById('leave-start-date').value;
    const endDate = document.getElementById('leave-end-date').value;
    const reason = document.getElementById('leave-reason').value;

    try {
      const { error } = await supabase
        .from('leave_requests')
        .insert([{
          staff_id: user.id,
          staff_name: user.user_metadata?.full_name || user.email.split('@')[0],
          type,
          start_date: startDate,
          end_date: endDate,
          reason,
          status: 'Pending'
        }]);

      if (error) throw error;

      showToast('Leave request submitted!', 'success');
      leaveModal.classList.add('hidden');
      leaveForm.reset();
      fetchLeaveRequests();
    } catch (err) {
      console.error("Error submitting leave:", err);
      showToast('Failed to submit request', 'error');
    }
  });
}

window.updateLeaveStatus = async (id, status) => {
  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    showToast(`Leave request ${status.toLowerCase()}!`, 'success');
    fetchLeaveRequests();
  } catch (err) {
    console.error("Error updating leave status:", err);
    showToast('Failed to update status', 'error');
  }
};

window.cancelLeave = async (id) => {
  if (!confirm('Are you sure you want to cancel this request?')) return;
  try {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .eq('id', id);

    if (error) throw error;
    showToast('Request cancelled', 'success');
    fetchLeaveRequests();
  } catch (err) {
    console.error("Error cancelling leave:", err);
    showToast('Failed to cancel request', 'error');
  }
};

// --- MEDIA STORAGE LOGIC ---
const mediaGrid = document.getElementById('media-grid');
const fileUpload = document.getElementById('file-upload');

async function fetchMedia() {
  if (!mediaGrid) return;
  
  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

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

      // 1. Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      // 3. Save metadata to database
      const { error: dbError } = await supabase
        .from('media')
        .insert([{
          name: file.name,
          url: urlData.publicUrl,
          type: file.type,
          size: file.size,
          created_at: new Date().toISOString()
        }]);

      if (dbError) throw dbError;

      uploadBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Uploaded!';
      uploadBtn.style.background = '#10b981';
      fetchMedia();
      
      setTimeout(() => {
        uploadBtn.innerHTML = originalHTML;
        uploadBtn.style.background = '';
        uploadBtn.style.pointerEvents = 'auto';
      }, 2000);
    } catch (err) {
      console.error("Upload failed:", err);
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
    const { error } = await supabase
      .from('media')
      .delete()
      .eq('id', id);

    if (error) throw error;
    fetchMedia();
  } catch (err) {
    console.error("Delete failed:", err);
  }
};

// --- REAL-TIME SYNC LOGIC ---
function setupRealtimeSubscriptions() {
  // Sync Chat
  supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const user = (await supabase.auth.getUser()).data.user;
      const myId = user?.id || 'admin-session';
      const msg = payload.new;

      // Only refresh if relevant to current chat
      const isGlobal = activeRecipient === 'global' && !msg.recipient_id;
      const isPrivate = (activeRecipient === msg.sender_id && msg.recipient_id === myId) || 
                        (activeRecipient === msg.recipient_id && msg.sender_id === myId);

      if (chatView && !chatView.classList.contains('hidden') && (isGlobal || isPrivate)) {
        fetchChatMessages();
      }
      
      // Show notification if it's for me and I'm not looking at it
      const forMe = msg.recipient_id === myId || (!msg.recipient_id && myId !== msg.sender_id);
      const notLooking = chatView.classList.contains('hidden') || !isPrivate && !isGlobal;

      if (forMe && notLooking) {
        addNotification('New Message', `${msg.sender_name}: ${msg.content.substring(0, 30)}...`, 'Chat');
      }
    })
    .subscribe();

  // Sync Announcements
  supabase
    .channel('public:announcements')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
      if (announcementsView && !announcementsView.classList.contains('hidden')) {
        fetchAnnouncements();
      }
      addNotification('New Announcement', payload.new.title, 'Announcement');
    })
    .subscribe();

  // Sync Dashboard Stats (Bookings)
  supabase
    .channel('public:bookings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
      if (document.body.classList.contains('is-admin')) fetchDashboardStats();
    })
    .subscribe();
}

// Initialize real-time
setupRealtimeSubscriptions();

const staffTableBody = document.getElementById('staff-table-body');

async function fetchStaff() {
  if (!staffTableBody) return;
  
  try {
    const { data: staffList, error } = await supabase
      .from('staff')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    staffTableBody.innerHTML = '';
    
    staffList.forEach((staff) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="font-bold">${staff.name}</div></td>
        <td>${staff.email}</td>
        <td>${staff.role}</td>
        <td><span class="status-badge status-completed">${staff.status}</span></td>
        <td>
          <button onclick="deleteStaff('${staff.id}')" class="text-slate-400 hover:text-red-400 transition-colors">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      staffTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
  }
}

// Task Management Logic
async function fetchStaffForDropdown() {
  const assigneeSelect = document.getElementById('task-assignee');
  if (!assigneeSelect) return;

  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, name')
      .eq('status', 'Active');

    if (error) throw error;

    assigneeSelect.innerHTML = '<option value="">Select Staff</option>';
    staff.forEach(s => {
      const option = document.createElement('option');
      option.value = s.id;
      option.innerText = s.name;
      assigneeSelect.appendChild(option);
    });
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

    submitBtn.innerText = 'Assigning...';
    submitBtn.disabled = true;

    try {
      const taskData = {
        title: document.getElementById('task-title').value,
        assignee_id: document.getElementById('task-assignee').value,
        category: document.getElementById('task-category').value,
        priority: document.getElementById('task-priority').value,
        due_date: document.getElementById('task-due-date').value,
        description: document.getElementById('task-description').value,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('tasks')
        .insert([taskData]);

      if (error) throw error;

      submitBtn.innerText = 'Task Assigned!';
      submitBtn.style.background = '#10b981';
      assignTaskForm.reset();
      fetchAdminTasks(); // Refresh the table

      setTimeout(() => {
        submitBtn.innerText = originalText;
        submitBtn.style.background = '';
        submitBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error("Error assigning task:", error);
      submitBtn.innerText = 'Error!';
      submitBtn.disabled = false;
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get staff ID first
    const { data: staffMember } = await supabase
      .from('staff')
      .select('id')
      .eq('email', user.email)
      .single();

    if (!staffMember) return;

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', staffMember.id);

    if (filterValue !== 'all') {
      query = query.eq('status', filterValue);
    }

    const { data: tasks, error } = await query.order('due_date', { ascending: true });

    if (error) throw error;

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
      const priorityClass = `priority-${task.priority.toLowerCase()}`;
      
      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const isOverdue = dueDate < today && task.status !== 'completed';
      
      if (isOverdue) tr.classList.add('overdue-row');

      tr.innerHTML = `
        <td>
          <div class="font-bold">${task.title}</div>
          ${isOverdue ? '<span class="overdue-badge"><i class="fas fa-exclamation-triangle mr-1"></i> Overdue</span>' : ''}
        </td>
        <td>${task.category}</td>
        <td><span class="priority-badge ${priorityClass}">${task.priority}</span></td>
        <td class="${isOverdue ? 'text-red-500 font-bold' : ''}">${task.due_date}</td>
        <td><span class="status-badge status-${task.status.toLowerCase().replace(' ', '-')}">${task.status}</span></td>
        <td>
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
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    fetchMyTasks();
  } catch (error) {
    console.error("Error updating task status:", error);
  }
};

async function fetchStaffDashboardStats() {
  const userResponse = await supabase.auth.getUser();
  const user = userResponse.data.user;
  if (!user) return;

  const completedTasksEl = document.getElementById('staff-completed-tasks-stat');
  const streakEl = document.getElementById('staff-streak-stat');
  const attendanceRateEl = document.getElementById('staff-attendance-rate-stat');
  const attendanceDetailEl = document.getElementById('staff-attendance-detail');
  const staffDashboardTasksBody = document.getElementById('staff-dashboard-tasks-body');
  
  try {
    // Fetch user's tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', user.id)
      .order('due_date', { ascending: true });
    
    if (tasksError) throw tasksError;

    // Fetch user's attendance
    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id);
    
    if (attendanceError) throw attendanceError;

    const completedTasks = tasks ? tasks.filter(t => t.status === 'completed').length : 0;
    const upcomingTasks = tasks ? tasks.filter(t => t.status !== 'completed').slice(0, 5) : [];
    
    // Populate upcoming tasks table
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
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchStaff();
    } catch (error) {
      console.error("Error deleting staff:", error);
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
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*');

    if (bookingsError) throw bookingsError;

    // Fetch Messages (for new messages count)
    const { data: messages, error: messagesError } = await supabase
      .from('contact_messages')
      .select('*', { count: 'exact' })
      .eq('read', false);

    if (messagesError) throw messagesError;

    // Fetch Staff & Attendance (for team attendance)
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id');
    
    if (staffError) throw staffError;

    const today = new Date().toISOString().split('T')[0];
    const { data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today);
    
    if (attendanceError) throw attendanceError;

    // Fetch Tasks (for pending tasks)
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'completed');
    
    if (tasksError) throw tasksError;

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
    if (newMessagesStat) newMessagesStat.innerText = messages ? messages.length : 0;
    if (teamAttendanceStat) teamAttendanceStat.innerText = `${attendance ? attendance.length : 0}/${staff ? staff.length : 0}`;
    if (pendingTasksStat) pendingTasksStat.innerText = tasks ? tasks.length : 0;

    // Update Recent Bookings
    if (recentBookingsBody) {
      const recent = bookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
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
    let query = supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply Filters
    const status = filterStatus.value;
    const service = filterService.value;
    const dateFrom = filterDateFrom.value;
    const dateTo = filterDateTo.value;

    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (service !== 'all') {
      query = query.eq('service', service);
    }
    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    const { data: bookings, error } = await query;
    if (error) throw error;

    renderBookings(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    bookingsTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Error loading bookings. Check permissions.</td></tr>';
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
      <td>#${booking.id.substring(0, 6).toUpperCase()}</td>
      <td>
        <div class="font-bold">${booking.client_name}</div>
        <div class="text-xs text-slate-400">${booking.email}</div>
      </td>
      <td>${booking.service}</td>
      <td>${booking.date}</td>
      <td>${booking.time}</td>
      <td>
        ${isAdminSession ? `
          <input type="number" 
            class="w-20 bg-slate-900/50 border border-slate-800 rounded px-2 py-1 text-xs focus:border-cyan-500 outline-none" 
            value="${booking.price || ''}" 
            placeholder="500"
            onchange="updatePrice('${booking.id}', this.value)">
        ` : `
          <span>${currencyManager.format(booking.price || 500)}</span>
        `}
      </td>
      <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
      <td>
        <button class="text-slate-400 hover:text-cyan-400 transition-colors mr-3" onclick="updateStatus('${booking.id}', 'Confirmed')"><i class="fas fa-check"></i></button>
        <button class="text-slate-400 hover:text-red-400 transition-colors" onclick="deleteBooking('${booking.id}')"><i class="fas fa-trash"></i></button>
      </td>
    `;
    bookingsTableBody.appendChild(tr);
  });

  bookingsCount.innerText = `Showing ${bookings.length} bookings`;
}

// Global functions for inline onclick
window.updatePrice = async (id, newPrice) => {
  const userResponse = await supabase.auth.getUser();
  const user = userResponse.data.user;
  const isUserAdmin = await isAdmin(user);
  
  if (!isUserAdmin) {
    showToast('Only admins can set prices', 'error');
    return;
  }

  try {
    const { error } = await supabase
      .from('bookings')
      .update({ price: parseInt(newPrice) })
      .eq('id', id);

    if (error) throw error;
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

window.updateStatus = async (id, newStatus) => {
  try {
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    fetchBookings();
  } catch (error) {
    console.error("Error updating status:", error);
  }
};

window.deleteBooking = async (id) => {
  if (confirm('Are you sure you want to delete this booking?')) {
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchBookings();
    } catch (error) {
      console.error("Error deleting booking:", error);
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
    const { data, error } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    messageList.innerHTML = '';
    if (data.length === 0) {
      messageList.innerHTML = '<div class="text-center py-8 text-slate-500">No messages yet</div>';
    } else {
      data.forEach(msg => {
        const div = document.createElement('div');
        div.className = `p-4 rounded-xl border ${msg.read ? 'bg-white/5 border-white/10' : 'bg-cyan-500/5 border-cyan-500/20'} cursor-pointer hover:bg-white/10 transition-all`;
        div.innerHTML = `
          <div class="flex justify-between items-start mb-2">
            <h4 class="font-bold text-sm truncate">${msg.name}</h4>
            <span class="text-[10px] text-slate-500">${new Date(msg.created_at).toLocaleDateString()}</span>
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
  
  messageDetail.innerHTML = `
    <div class="flex justify-between items-start mb-8">
      <div>
        <h3 class="text-xl font-bold mb-1">${msg.subject}</h3>
        <p class="text-slate-400 text-sm">From: <span class="text-white font-semibold">${msg.name}</span> (${msg.email})</p>
      </div>
      <div class="text-right">
        <p class="text-slate-400 text-xs">${new Date(msg.created_at).toLocaleString()}</p>
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
  if (!msg.read) {
    markMessageAsRead(msg.id);
  }
}

async function markMessageAsRead(id) {
  try {
    await supabase.from('contact_messages').update({ read: true }).eq('id', id);
    fetchMessages();
    fetchDashboardStats();
  } catch (err) {
    console.error("Error marking message as read:", err);
  }
}

window.deleteMessage = async (id) => {
  if (confirm('Are you sure you want to delete this message?')) {
    try {
      await supabase.from('contact_messages').delete().eq('id', id);
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
      // 1. Try to save to Supabase
      const isSupabaseConfigured = import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder');
      
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('contact_messages')
          .insert([{
            name,
            email,
            subject,
            message,
            read: false,
            created_at: new Date().toISOString()
          }]);

        if (error) {
          console.error("Supabase insert error:", error);
        }
      }

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
    const userResponse = await supabase.auth.getUser();
    const user = userResponse.data.user;
    if (!user) return;

    // Fetch user's attendance for today
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAttendance, error: todayError } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (todayError) throw todayError;

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
      clockInTimeDisplay.innerText = new Date(todayAttendance.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (todayAttendance.clock_out) {
        const diff = new Date(todayAttendance.clock_out) - new Date(todayAttendance.clock_in);
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
    const { data: history, error: historyError } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', user.id)
      .order('date', { ascending: false })
      .limit(10);

    if (historyError) throw historyError;

    attendanceHistoryBody.innerHTML = '';
    if (history.length === 0) {
      attendanceHistoryBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No attendance records found.</td></tr>';
    } else {
      history.forEach(record => {
        const tr = document.createElement('tr');
        const clockIn = new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const clockOut = record.clock_out ? new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        
        let hours = '--';
        if (record.clock_out) {
          const diff = new Date(record.clock_out) - new Date(record.clock_in);
          hours = (diff / (1000 * 60 * 60)).toFixed(1);
        }

        tr.innerHTML = `
          <td>${record.date}</td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td>${hours}h</td>
          <td><span class="status-badge ${record.clock_out ? 'status-completed' : 'status-pending'}">${record.status}</span></td>
        `;
        attendanceHistoryBody.appendChild(tr);
      });
    }

    // Admin View: All Staff Attendance
    const isAdmin = localStorage.getItem('isAdminSession') === 'true';
    if (isAdmin && adminAttendanceBody) {
      const { data: allAttendance, error: allAttendanceError } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (allAttendanceError) throw allAttendanceError;

      adminAttendanceBody.innerHTML = '';
      allAttendance.forEach(record => {
        const tr = document.createElement('tr');
        const clockIn = new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const clockOut = record.clock_out ? new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        
        tr.innerHTML = `
          <td>${record.staff_name || 'Unknown'}</td>
          <td>${record.date}</td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td><span class="status-badge ${record.clock_out ? 'status-completed' : 'status-pending'}">${record.status}</span></td>
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
  clockInBtn.addEventListener('click', async () => {
    try {
      const userResponse = await supabase.auth.getUser();
      const user = userResponse.data.user;
      if (!user) return;

      const staffName = user.user_metadata?.full_name || user.email.split('@')[0];
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('attendance')
        .insert([{
          staff_id: user.id,
          staff_name: staffName,
          clock_in: new Date().toISOString(),
          date: today,
          status: 'Present'
        }]);

      if (error) throw error;

      showToast('Clocked in successfully!', 'success');
      fetchAttendance();
    } catch (err) {
      console.error("Error clocking in:", err);
      showToast('Failed to clock in', 'error');
    }
  });
}

if (clockOutBtn) {
  clockOutBtn.addEventListener('click', async () => {
    try {
      const userResponse = await supabase.auth.getUser();
      const user = userResponse.data.user;
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('attendance')
        .update({ 
          clock_out: new Date().toISOString(),
          status: 'Completed'
        })
        .eq('staff_id', user.id)
        .eq('date', today)
        .is('clock_out', null);

      if (error) throw error;

      showToast('Clocked out successfully!', 'success');
      fetchAttendance();
    } catch (err) {
      console.error("Error clocking out:", err);
      showToast('Failed to clock out', 'error');
    }
  });
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
  clearNotificationsBtn.addEventListener('click', () => {
    notificationList.innerHTML = '<p class="text-center text-slate-500 text-xs py-4">No new notifications</p>';
    if (notificationBadge) notificationBadge.classList.add('hidden');
  });
}

// Task Reminder System
async function fetchAdminTasks() {
  const adminTaskTableBody = document.getElementById('admin-tasks-table-body');
  if (!adminTaskTableBody) return;

  try {
    // Fetch all staff first to create a map for names
    const { data: staffList } = await supabase
      .from('staff')
      .select('id, name');
    
    const staffMap = {};
    if (staffList) {
      staffList.forEach(s => staffMap[s.id] = s.name);
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true });

    if (error) throw error;

    adminTaskTableBody.innerHTML = '';
    if (tasks.length === 0) {
      adminTaskTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500">No tasks assigned yet</td></tr>';
      return;
    }

    tasks.forEach(task => {
      const tr = document.createElement('tr');
      const priorityClass = `priority-${task.priority.toLowerCase()}`;
      const statusClass = task.status === 'completed' ? 'status-completed' : 'status-pending';
      const assigneeName = staffMap[task.assignee_id] || 'Unknown';

      tr.innerHTML = `
        <td><div class="font-bold">${task.title}</div></td>
        <td>${assigneeName}</td>
        <td><span class="priority-badge ${priorityClass}">${task.priority}</span></td>
        <td>${task.due_date}</td>
        <td><span class="status-badge ${statusClass}">${task.status}</span></td>
        <td>
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get staff ID
    const { data: staffMember } = await supabase
      .from('staff')
      .select('id')
      .eq('email', user.email)
      .single();

    if (!staffMember) return;

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', staffMember.id)
      .neq('status', 'completed');

    if (!tasks) return;

    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));

    tasks.forEach(task => {
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

function addNotification(title, message, tag) {
  const notificationList = document.getElementById('notification-list');
  const notificationBadge = document.getElementById('notification-badge');
  if (!notificationList) return;

  // Remove "No new notifications" if it exists
  if (notificationList.innerText.includes('No new notifications')) {
    notificationList.innerHTML = '';
  }

  const div = document.createElement('div');
  div.className = 'p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer';
  div.innerHTML = `
    <div class="flex justify-between items-start mb-1">
      <p class="text-sm font-semibold">${title}</p>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold">${tag}</span>
    </div>
    <p class="text-xs text-slate-400">${message}</p>
    <span class="text-[10px] text-slate-500">Just now</span>
  `;
  
  notificationList.prepend(div);
  if (notificationBadge) notificationBadge.classList.remove('hidden');
}

// Theme Toggle Logic removed from bottom
// --- BLOG MANAGEMENT LOGIC ---
async function fetchBlogs() {
  const container = document.getElementById('blog-posts-container');
  if (!container) return;

  try {
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!blogs || blogs.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500">No blog posts found yet. Check back soon!</div>';
      return;
    }

    container.innerHTML = blogs.map((blog, index) => `
      <article class="glass p-8 reveal" style="transition-delay: ${index * 100}ms">
        <div class="mb-6 overflow-hidden rounded-xl h-48 bg-slate-900">
          <img src="${blog.image_url || 'https://picsum.photos/seed/blog/800/400'}" alt="${blog.title}" class="w-full h-full object-cover">
        </div>
        <div class="flex items-center gap-4 text-xs text-cyan-400 mb-4 uppercase tracking-widest font-bold">
          <span>${blog.category}</span>
          <span>•</span>
          <span>${new Date(blog.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        </div>
        <h3 class="text-2xl font-bold mb-4">${blog.title}</h3>
        <p class="text-slate-400 mb-6">${blog.excerpt || 'Read our latest insights...'}</p>
        <a href="/blog-story.html?id=${blog.id}" class="text-cyan-400 font-bold hover:underline">Read Full Story →</a>
      </article>
    `).join('');

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
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!blogs || blogs.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500">No blogs found. Create your first post!</td></tr>';
      return;
    }

    tableBody.innerHTML = blogs.map(blog => `
      <tr>
        <td>
          <img src="${blog.image_url}" class="w-12 h-12 rounded object-cover border border-white/10">
        </td>
        <td class="font-bold">${blog.title}</td>
        <td><span class="status-badge bg-cyan-500/10 text-cyan-400">${blog.category}</span></td>
        <td class="text-slate-400 text-sm">${new Date(blog.created_at).toLocaleDateString()}</td>
        <td>
          <div class="flex gap-2">
            <button onclick="editBlog('${blog.id}')" class="text-cyan-400 hover:text-white transition-colors"><i class="fas fa-edit"></i></button>
            <button onclick="deleteBlog('${blog.id}')" class="text-red-400 hover:text-white transition-colors"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
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
    blogModal.classList.remove('hidden');
  });

  closeBlogModal.addEventListener('click', () => {
    blogModal.classList.add('hidden');
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

    setLoading(true);
    try {
      const blogData = {
        title,
        category,
        image_url: imageUrl,
        excerpt,
        content,
        updated_at: new Date()
      };

      let error;
      if (id) {
        ({ error } = await supabase.from('blogs').update(blogData).eq('id', id));
      } else {
        blogData.created_at = new Date();
        ({ error } = await supabase.from('blogs').insert([blogData]));
      }

      if (error) throw error;

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
    const { data: blog, error } = await supabase
      .from('blogs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    document.getElementById('blog-id').value = blog.id;
    document.getElementById('blog-title').value = blog.title;
    document.getElementById('blog-category').value = blog.category;
    document.getElementById('blog-image-url').value = blog.image_url;
    document.getElementById('blog-excerpt').value = blog.excerpt;
    document.getElementById('blog-content').value = blog.content;

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
    const { error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', id);

    if (error) throw error;

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
