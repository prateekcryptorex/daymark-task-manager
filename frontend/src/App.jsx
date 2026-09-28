import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Circle,
  CircleUserRound,
  ClipboardList,
  GripVertical,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import AuthDialog from './components/AuthDialog.jsx';
import { EvidenceControls, EvidencePreview } from './components/TaskEvidence.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';
import { deleteLocalEvidence, getLocalEvidence, saveLocalEvidence } from './lib/taskEvidence.js';

const STORAGE_KEY = 'daymark.tasks.v1';
const THEME_KEY = 'daymark.theme.v2';
const categories = ['Work', 'Personal', 'Urgent', 'Home', 'Study'];
const starterTaskIds = new Set(['starter-1', 'starter-2', 'starter-3', 'starter-4']);

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function normalizeTasks(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const taskIds = new Set();
  const attachmentIds = new Set();
  const maxFileSize = 50 * 1024 * 1024;

  return value.slice(0, 5000).flatMap((task, index) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return [];
    if (starterTaskIds.has(task.id)) return [];
    const title = typeof task.title === 'string' ? task.title.trim().slice(0, 500) : '';
    if (!title) return [];

    let id = typeof task.id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(task.id) ? task.id : makeId();
    if (taskIds.has(id)) id = makeId();
    taskIds.add(id);

    const dueDate = typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
      && !Number.isNaN(new Date(`${task.dueDate}T00:00:00`).getTime())
      && toDateInputValue(new Date(`${task.dueDate}T00:00:00`)) === task.dueDate
      ? task.dueDate
      : '';
    const dueTime = dueDate && typeof task.dueTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime)
      ? task.dueTime
      : '';
    const attachments = Array.isArray(task.attachments)
      ? task.attachments.slice(0, 10).flatMap((attachment) => {
          if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return [];
          const validId = typeof attachment.id === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(attachment.id);
          const validName = typeof attachment.name === 'string' && attachment.name.length > 0 && attachment.name.length <= 255;
          const validType = typeof attachment.type === 'string' && /^(image|video)\//.test(attachment.type);
          const validStorage = attachment.storage === 'local' || attachment.storage === 'cloud';
          const validSize = Number.isFinite(attachment.size) && attachment.size >= 0 && attachment.size <= maxFileSize;
          const validPath = attachment.storage !== 'cloud' || (typeof attachment.path === 'string' && attachment.path.length <= 512);
          if (!validId || !validName || !validType || !validStorage || !validSize || !validPath || attachmentIds.has(attachment.id)) return [];
          attachmentIds.add(attachment.id);
          return [{
            id: attachment.id,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            storage: attachment.storage,
            ...(attachment.storage === 'cloud' ? { path: attachment.path } : {}),
          }];
        })
      : [];

    return [{
      id,
      title,
      category: categories.includes(task.category) ? task.category : 'Work',
      dueDate,
      dueTime,
      completed: task.completed === true,
      order: Number.isFinite(task.order) ? task.order : index,
      ...(attachments.length ? { attachments } : {}),
    }];
  });
}

function readTasks(key = STORAGE_KEY, fallback = []) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const parsed = JSON.parse(stored);
    return normalizeTasks(parsed, fallback);
  } catch {
    return fallback;
  }
}

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function formatDueDate(value) {
  if (!value) return '';
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const formatKey = (date) => toDateInputValue(date);
  if (value === formatKey(today)) return 'Today';
  if (value === formatKey(tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(due);
}

function formatDueTime(value) {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes));
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const [tasks, setTasks] = useState(readTasks);
  const [theme, setTheme] = useState(readTheme);
  const [reminderPermission, setReminderPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [reminderMessage, setReminderMessage] = useState('');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('local');
  const [evidenceUrls, setEvidenceUrls] = useState({});
  const [previewEvidence, setPreviewEvidence] = useState(null);
  const [evidenceBusyId, setEvidenceBusyId] = useState(null);
  const [evidenceError, setEvidenceError] = useState('');
  const [scope, setScope] = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ title: '', category: 'Work', dueDate: '', dueTime: '' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', category: 'Work', dueDate: '', dueTime: '' });
  const [draggedId, setDraggedId] = useState(null);
  const userRef = useRef(null);
  const guestTasksRef = useRef(readTasks());

  useEffect(() => {
    const storageKey = user ? `${STORAGE_KEY}.${user.id}` : STORAGE_KEY;
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks));
      if (!user) guestTasksRef.current = tasks;
    } catch {
      setCloudStatus('error');
    }
  }, [tasks, user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setCloudReady(true);
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      const nextUser = data.session?.user ?? null;
      userRef.current = nextUser;
      setUser(nextUser);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if (userRef.current && !nextUser) setTasks(guestTasksRef.current);
      userRef.current = nextUser;
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser) setAuthOpen(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user || !supabase) {
      setCloudReady(true);
      setCloudStatus('local');
      return undefined;
    }

    let cancelled = false;
    const accountStorageKey = `${STORAGE_KEY}.${user.id}`;
    const guestTasks = readTasks();
    const cachedTasks = readTasks(accountStorageKey, []);
    setTasks(cachedTasks);
    setCloudReady(false);
    setCloudStatus('syncing');

    async function loadAccountTasks() {
      const { data, error } = await supabase
        .from('user_task_lists')
        .select('tasks')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setCloudStatus('error');
        return;
      }

      const accountTasks = data?.tasks ? normalizeTasks(data.tasks, []) : (cachedTasks.length ? cachedTasks : guestTasks);
      if (!data) {
        const { error: saveError } = await supabase.from('user_task_lists').upsert({
          user_id: user.id,
          tasks: accountTasks,
          updated_at: new Date().toISOString(),
        });
        if (cancelled) return;
        if (saveError) {
          setCloudStatus('error');
          return;
        }
      }

      setTasks(accountTasks);
      setCloudReady(true);
      setCloudStatus('synced');
    }

    loadAccountTasks();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || !supabase || !cloudReady) return undefined;
    const timeout = window.setTimeout(async () => {
      setCloudStatus('syncing');
      const { error } = await supabase.from('user_task_lists').upsert({
        user_id: user.id,
        tasks,
        updated_at: new Date().toISOString(),
      });
      setCloudStatus(error ? 'error' : 'synced');
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [tasks, user, cloudReady]);

  useEffect(() => {
    if (reminderPermission !== 'granted' || typeof Notification === 'undefined') return undefined;
    const timers = new Set();
    const schedule = (when, task, minutesBefore) => {
      const delay = when.getTime() - Date.now();
      if (delay <= 0) return;
      const timer = window.setTimeout(() => {
        if (when.getTime() > Date.now()) {
          schedule(when, task, minutesBefore);
          return;
        }
        if (Notification.permission === 'granted') {
          const timing = minutesBefore ? 'in 15 minutes' : 'now';
          try {
            new Notification(minutesBefore ? 'Coming up' : 'Task due', {
              body: `${task.title} is due ${timing}.`,
              tag: `daymark-${task.id}-${minutesBefore ? '15m' : 'due'}`,
            });
          } catch {
            setReminderMessage('Your browser could not display a notification. Check its site settings.');
          }
        }
      }, Math.min(delay, 2_147_000_000));
      timers.add(timer);
    };

    tasks.forEach((task) => {
      if (task.completed || !task.dueDate || !task.dueTime) return;
      const dueAt = new Date(`${task.dueDate}T${task.dueTime}:00`);
      if (Number.isNaN(dueAt.getTime())) return;
      schedule(new Date(dueAt.getTime() - 15 * 60_000), task, true);
      schedule(dueAt, task, false);
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [tasks, reminderPermission]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];
    const attachments = tasks.flatMap((task) => (task.attachments || []).map((attachment) => ({ taskId: task.id, attachment })));
    setEvidenceUrls({});

    async function loadEvidenceUrls() {
      const entries = await Promise.all(attachments.map(async ({ attachment }) => {
        try {
          if (attachment.storage === 'cloud' && supabase) {
            const { data, error } = await supabase.storage.from('task-evidence').createSignedUrl(attachment.path, 3600);
            if (error) throw error;
            return [attachment.id, data.signedUrl];
          }
          const file = await getLocalEvidence(attachment.id);
          if (!file) return null;
          const url = URL.createObjectURL(file);
          objectUrls.push(url);
          return [attachment.id, url];
        } catch {
          return null;
        }
      }));

      if (cancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setEvidenceUrls(Object.fromEntries(entries.filter(Boolean)));
      if (entries.some((entry) => !entry)) setEvidenceError('One or more attachments could not be loaded.');
    }

    loadEvidenceUrls();
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [tasks, user]);

  const today = toDateInputValue(new Date());
  const activeCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - activeCount;
  const completionPercent = tasks.length ? Math.round(completedCount / tasks.length * 100) : 0;
  const todayCount = tasks.filter((task) => !task.completed && (!task.dueDate || task.dueDate <= today)).length;
  const upcomingCount = tasks.filter((task) => !task.completed && task.dueDate > today).length;
  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (scope === 'today' && task.dueDate && task.dueDate > today) return false;
        if (scope === 'upcoming' && (!task.dueDate || task.dueDate <= today)) return false;
        if (statusFilter === 'active' && task.completed) return false;
        if (statusFilter === 'completed' && !task.completed) return false;
        if (categoryFilter && task.category !== categoryFilter) return false;
        if (query && !task.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
        return true;
      })
      .sort((first, second) => first.order - second.order);
  }, [tasks, scope, statusFilter, categoryFilter, query, today]);

  const heading = categoryFilter || (scope === 'today' ? 'Today' : scope === 'upcoming' ? 'Upcoming' : statusFilter === 'completed' ? 'Completed' : statusFilter === 'active' ? 'Active' : 'Everything');
  const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  function addTask(event) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    setTasks((current) => [
      ...current,
      { id: makeId(), title, category: draft.category, dueDate: draft.dueDate, dueTime: draft.dueDate ? draft.dueTime : '', completed: false, order: current.length ? Math.max(...current.map((task) => task.order)) + 1 : 0 },
    ]);
    setDraft({ title: '', category: 'Work', dueDate: '', dueTime: '' });
  }

  function toggleTask(id) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  }

  function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (task?.attachments?.length) {
      Promise.all(task.attachments.map(deleteEvidenceAsset)).catch(() => setEvidenceError('Some attachments could not be removed.'));
    }
    setTasks((current) => current.filter((task) => task.id !== id));
    if (editingId === id) setEditingId(null);
    if (previewEvidence && task?.attachments?.some((attachment) => attachment.id === previewEvidence.id)) setPreviewEvidence(null);
  }

  function startEditing(task) {
    setEditingId(task.id);
    setEditDraft({ title: task.title, category: task.category, dueDate: task.dueDate || '', dueTime: task.dueTime || '' });
  }

  function saveEdit(event) {
    event.preventDefault();
    const title = editDraft.title.trim();
    if (!title) return;
    setTasks((current) => current.map((task) => task.id === editingId
      ? { ...task, title, category: editDraft.category, dueDate: editDraft.dueDate, dueTime: editDraft.dueDate ? editDraft.dueTime : '' }
      : task));
    setEditingId(null);
  }

  function moveTask(targetId) {
    if (!draggedId || draggedId === targetId) return;
    setTasks((current) => {
      const ordered = [...current].sort((first, second) => first.order - second.order);
      const from = ordered.findIndex((task) => task.id === draggedId);
      const to = ordered.findIndex((task) => task.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      return ordered.map((task, index) => ({ ...task, order: index }));
    });
    setDraggedId(null);
  }

  function selectScope(nextScope) {
    setScope(nextScope);
    setCategoryFilter('');
    setStatusFilter('all');
  }

  function clearCompleted() {
    const completedTasks = tasks.filter((task) => task.completed);
    Promise.all(completedTasks.flatMap((task) => (task.attachments || []).map(deleteEvidenceAsset)))
      .catch(() => setEvidenceError('Some attachments could not be removed.'));
    setTasks((current) => current.filter((task) => !task.completed));
    setPreviewEvidence(null);
  }

  async function enableReminders() {
    if (typeof Notification === 'undefined') {
      setReminderPermission('unsupported');
      setReminderMessage('This browser does not support desktop notifications.');
      return;
    }
    if (Notification.permission === 'denied') {
      setReminderPermission('denied');
      setReminderMessage('Notifications are blocked for this site. Allow them in your browser settings.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setReminderPermission(permission);
      setReminderMessage(permission === 'granted' ? 'Reminders are on for tasks with a due date and time.' : 'Allow notifications to receive task reminders.');
    } catch {
      setReminderMessage('Could not request notification permission in this browser.');
    }
  }

  async function deleteEvidenceAsset(attachment) {
    if (attachment.storage === 'cloud') {
      if (!supabase) throw new Error('Cloud attachment storage is unavailable.');
      const { error } = await supabase.storage.from('task-evidence').remove([attachment.path]);
      if (error) throw error;
      return;
    }
    await deleteLocalEvidence(attachment.id);
  }

  async function uploadTaskEvidence(taskId, files) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task?.completed) return;
    setEvidenceBusyId(taskId);
    setEvidenceError('');
    try {
      if ((task.attachments?.length || 0) + files.length > 10) {
        throw new Error('A task can have up to 10 attachments.');
      }
      for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          throw new Error('Choose an image or video file.');
        }
        if (file.size > 50 * 1024 * 1024) {
          throw new Error('Each attachment must be smaller than 50 MB.');
        }
        if (file.name.length > 255) {
          throw new Error('Attachment file names must be 255 characters or fewer.');
        }

        const id = makeId();
        let attachment;
        if (user && supabase) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `${user.id}/${taskId}/${id}-${safeName}`;
          const { error } = await supabase.storage.from('task-evidence').upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
          });
          if (error) throw error;
          attachment = { id, path, storage: 'cloud', name: file.name, type: file.type, size: file.size };
        } else {
          await saveLocalEvidence(id, file);
          attachment = { id, storage: 'local', name: file.name, type: file.type, size: file.size };
        }

        setTasks((current) => current.map((item) => item.id === taskId
          ? { ...item, attachments: [...(item.attachments || []), attachment] }
          : item));
      }
    } catch (error) {
      setEvidenceError(error.message || 'The attachment could not be uploaded.');
    } finally {
      setEvidenceBusyId(null);
    }
  }

  async function removeTaskEvidence(taskId, attachment) {
    try {
      await deleteEvidenceAsset(attachment);
      setTasks((current) => current.map((task) => task.id === taskId
        ? { ...task, attachments: (task.attachments || []).filter((item) => item.id !== attachment.id) }
        : task));
      if (previewEvidence?.id === attachment.id) setPreviewEvidence(null);
      setEvidenceError('');
    } catch {
      setEvidenceError('This attachment could not be removed. Try again.');
    }
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    setAuthError('');
    setAuthMessage('');
    setAuthOpen(true);
  }

  async function handleEmailAuth({ email, password, mode }) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setAuthMessage('Check your inbox to confirm your email, then come back to sign in.');
      } else {
        setAuthOpen(false);
      }
    } catch (error) {
      setAuthError(error.message || 'Could not sign in. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleProviderAuth(provider) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
          ...(provider === 'azure' ? { scopes: 'email' } : {}),
        },
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message || 'Could not connect to the provider. Please try again.');
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      openAuth();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" onClick={() => selectScope('today')} aria-label="Daymark home">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">daymark<span>.</span></span>
        </a>

        <nav className="primary-nav" aria-label="Task views">
          <button className={`nav-item ${scope === 'today' && !categoryFilter ? 'selected' : ''}`} onClick={() => selectScope('today')}>
            <CalendarDays size={17} strokeWidth={1.8} /><span>Today</span><span className="nav-count">{todayCount}</span>
          </button>
          <button className={`nav-item ${scope === 'upcoming' && !categoryFilter ? 'selected' : ''}`} onClick={() => selectScope('upcoming')}>
            <AlarmClock size={17} strokeWidth={1.8} /><span>Upcoming</span><span className="nav-count">{upcomingCount}</span>
          </button>
          <button className={`nav-item ${scope === 'all' && !categoryFilter ? 'selected' : ''}`} onClick={() => selectScope('all')}>
            <ClipboardList size={17} strokeWidth={1.8} /><span>Everything</span>
          </button>
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-heading"><span className="sidebar-label">CATEGORIES</span><Tag size={14} /></div>
        <nav className="category-nav" aria-label="Filter by category">
          {categories.map((category) => (
            <button key={category} className={`category-item ${categoryFilter === category ? 'selected' : ''}`} onClick={() => { setCategoryFilter(categoryFilter === category ? '' : category); setScope('all'); setStatusFilter('all'); }}>
              <span className={`category-dot dot-${category.toLowerCase()}`} />{category}
              <span className="nav-count">{tasks.filter((task) => task.category === category && !task.completed).length}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="theme-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span><span className="theme-state">{theme === 'light' ? 'OFF' : 'ON'}</span>
          </button>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="topbar-right">
            {user && <span className={`sync-indicator ${cloudStatus}`} aria-live="polite" title={cloudStatus === 'error' ? 'Cloud sync needs attention' : cloudStatus === 'syncing' ? 'Saving tasks to cloud' : 'Tasks saved to cloud'}><span className={`storage-dot ${cloudStatus === 'error' ? 'storage-error' : ''}`} /><span className="sync-indicator-label">{cloudStatus === 'error' ? 'Sync issue' : cloudStatus === 'syncing' ? 'Saving' : 'Saved'}</span></span>}
            <button className={`reminder-button ${reminderPermission === 'granted' ? 'reminders-enabled' : ''}`} onClick={enableReminders} disabled={reminderPermission === 'granted'} aria-label={reminderPermission === 'granted' ? 'Task reminders enabled' : 'Enable task reminders'} title={reminderPermission === 'granted' ? 'Task reminders enabled' : 'Enable task reminders'}>
              <Bell size={15} /><span>{reminderPermission === 'granted' ? 'Reminders on' : reminderPermission === 'denied' ? 'Allow in settings' : reminderPermission === 'unsupported' ? 'Unavailable' : 'Reminders'}</span>
            </button>
            <button className="account-button" onClick={() => user ? signOut() : openAuth()} aria-label={user ? `Sign out ${user.email}` : 'Sign in to sync tasks'} title={user ? 'Sign out' : 'Sign in to sync tasks'}>
              {user ? <LogOut size={15} /> : <CircleUserRound size={16} />}<span>{user ? 'Sign out' : authLoading ? 'Checking' : 'Sign in'}</span>
            </button>
            <button className="mobile-theme-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
            <span className="date-pill"><span className="live-dot" />{dateLabel}</span><div className="top-avatar">{user?.email?.[0]?.toUpperCase() || 'P'}</div>
          </div>
        </header>

        <section className="content-wrap">
          <div className="welcome-row">
            <h1>{heading}</h1>
          </div>
          {reminderMessage && <div className="reminder-notice" role="status"><span>{reminderMessage}</span><button type="button" aria-label="Dismiss reminder message" onClick={() => setReminderMessage('')}><X size={14} /></button></div>}

          <div className="overview-grid">
            <div className="overview-card active-overview-card">
              <div className="bento-card-kicker"><span className="bento-card-icon"><ClipboardList size={15} /></span>OPEN</div>
              <div className="bento-card-stat"><strong>{activeCount}</strong><span>{activeCount === 1 ? 'task' : 'tasks'}</span></div>
            </div>
            <div className="overview-card done-overview-card">
              <div className="bento-card-kicker"><span className="bento-card-icon"><Check size={15} /></span>COMPLETED</div>
              <div className="bento-card-stat"><strong>{completedCount}</strong><span>{completedCount === 1 ? 'task' : 'tasks'}</span></div>
            </div>
            <div className="overview-card completion-overview-card">
              <div className="bento-card-kicker"><span className="bento-card-icon"><Circle size={15} /></span>COMPLETION</div>
              <div className="bento-card-stat"><strong>{completionPercent}%</strong><span>of tasks</span></div>
              <div className="bento-progress"><span style={{ width: `${completionPercent}%` }} /></div>
            </div>
          </div>

          <section className="task-section" aria-label="Your task list">
            <div className="section-topline">
              <div className="section-title"><h2>Tasks</h2><span className="list-total">{visibleTasks.length}</span></div>
              <div className="list-tools">
                <label className="search-box"><Search size={15} /><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                {completedCount > 0 && <button className="clear-button" onClick={clearCompleted}><Trash2 size={14} />Clear completed</button>}
              </div>
            </div>

            <div className="filter-row" role="tablist" aria-label="Filter tasks by status">
              {['all', 'active', 'completed'].map((filter) => (
                <button key={filter} role="tab" aria-selected={statusFilter === filter} className={`filter-tab ${statusFilter === filter ? 'active' : ''}`} onClick={() => setStatusFilter(filter)}>
                  {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Completed'}
                </button>
              ))}
            </div>

            {evidenceError && <div className="evidence-alert" role="alert"><span>{evidenceError}</span><button type="button" aria-label="Dismiss attachment message" onClick={() => setEvidenceError('')}><X size={14} /></button></div>}
            <div className="task-list">
              {visibleTasks.map((task, index) => (
                <article key={task.id} style={{ animationDelay: `${index * 45}ms` }} className={`task-row ${task.completed ? 'is-complete' : ''} ${draggedId === task.id ? 'is-dragging' : ''}`} draggable={editingId !== task.id} onDragStart={(event) => { setDraggedId(task.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveTask(task.id); }} onDragEnd={() => setDraggedId(null)}>
                  {editingId === task.id ? (
                    <form className="edit-form" onSubmit={saveEdit}>
                      <input className="edit-title" autoFocus aria-label="Edit task title" value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} />
                      <div className="edit-controls">
                        <select aria-label="Task category" value={editDraft.category} onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
                        <input aria-label="Due date" type="date" value={editDraft.dueDate} onChange={(event) => setEditDraft({ ...editDraft, dueDate: event.target.value, dueTime: event.target.value ? editDraft.dueTime : '' })} />
                        <input aria-label="Due time" type="time" value={editDraft.dueTime} disabled={!editDraft.dueDate} onChange={(event) => setEditDraft({ ...editDraft, dueTime: event.target.value })} />
                        <button className="icon-action save-action" type="submit" aria-label="Save task"><Check size={16} /></button>
                        <button className="icon-action" type="button" aria-label="Cancel editing" onClick={() => setEditingId(null)}><X size={16} /></button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button className="drag-handle" aria-label={`Reorder ${task.title}`} title="Drag to reorder" tabIndex={-1}><GripVertical size={16} /></button>
                      <button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? `Mark ${task.title} active` : `Complete ${task.title}`} onClick={() => toggleTask(task.id)}>{task.completed && <Check size={13} strokeWidth={2.8} />}</button>
                      <button className="task-title-button" onClick={() => startEditing(task)} title="Edit task"><span className="task-title">{task.title}</span></button>
                      <span className={`task-category category-${task.category.toLowerCase()}`}>{task.category}</span>
                      {task.dueDate && <span className={`task-due ${!task.completed && task.dueDate < today ? 'overdue' : ''}`}><CalendarDays size={13} /><span>{!task.completed && task.dueDate < today ? 'Overdue' : formatDueDate(task.dueDate)}</span>{task.dueTime && <time>{formatDueTime(task.dueTime)}</time>}</span>}
                      <div className="task-actions">
                        {task.completed && <EvidenceControls attachments={task.attachments || []} urls={evidenceUrls} busy={evidenceBusyId === task.id} onUpload={(files) => uploadTaskEvidence(task.id, files)} onRemove={(attachment) => removeTaskEvidence(task.id, attachment)} onPreview={setPreviewEvidence} taskTitle={task.title} />}
                        <div className="task-edit-actions"><button className="icon-action" aria-label={`Edit ${task.title}`} onClick={() => startEditing(task)}><span className="edit-glyph">↗</span></button><button className="icon-action delete-action" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task.id)}><X size={15} /></button></div>
                      </div>
                    </>
                  )}
                  <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                </article>
              ))}
              {visibleTasks.length === 0 && (
                <div className="empty-state"><span className="empty-icon"><Circle size={21} /></span><strong>{query ? 'No matches found' : 'No tasks yet'}</strong>{query && <span>Try another search.</span>}</div>
              )}
            </div>

            <form className="add-task-form" onSubmit={addTask}>
              <span className="add-icon"><Plus size={18} /></span>
              <input aria-label="New task" placeholder="Task name" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <div className="add-controls">
                <label className="date-control" title="Set due date"><CalendarDays size={15} /><input aria-label="New task due date" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value, dueTime: event.target.value ? draft.dueTime : '' })} /></label>
                <label className="time-control" title={draft.dueDate ? 'Set due time' : 'Select a due date first'}><Clock3 size={14} /><input aria-label="New task due time" type="time" value={draft.dueTime} disabled={!draft.dueDate} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></label>
                {!draft.dueDate && <span className="due-time-hint">Select a date first</span>}
                <label className="category-control" title="Choose category"><Tag size={14} /><select aria-label="New task category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={12} /></label>
                <button className="add-submit" type="submit" disabled={!draft.title.trim()}><Plus size={15} /><span>Add task</span></button>
              </div>
            </form>
          </section>
        </section>
      </main>
      {previewEvidence && <EvidencePreview attachment={previewEvidence} url={evidenceUrls[previewEvidence.id]} onClose={() => setPreviewEvidence(null)} />}
      {authOpen && <AuthDialog configured={isSupabaseConfigured} mode={authMode} onModeChange={(mode) => { setAuthMode(mode); setAuthError(''); setAuthMessage(''); }} onClose={() => setAuthOpen(false)} onEmailSubmit={handleEmailAuth} onProvider={handleProviderAuth} busy={authBusy} message={authMessage} error={authError} />}
    </div>
  );
}

export default App;
