import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Circle,
  Clock3,
  ListFilter,
  ListTodo,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

const STORAGE_KEY = "todo-reminder.tasks.v1";

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "upcoming", label: "即将到期" },
  { value: "overdue", label: "已逾期" },
  { value: "done", label: "已完成" },
];

const PRIORITIES = [
  { value: "high", label: "高", tone: "danger" },
  { value: "medium", label: "中", tone: "warning" },
  { value: "low", label: "低", tone: "calm" },
];

const REMINDER_OPTIONS = [
  { value: 0, label: "准时" },
  { value: 5, label: "提前 5 分钟" },
  { value: 15, label: "提前 15 分钟" },
  { value: 30, label: "提前 30 分钟" },
  { value: 60, label: "提前 1 小时" },
  { value: 1440, label: "提前 1 天" },
];

const HEADER_METRICS = {
  active: 5,
  done: 10,
};

const priorityRank = {
  high: 3,
  medium: 2,
  low: 1,
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toInputDateTime(date) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + 60);
  next.setSeconds(0, 0);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function readStoredTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getRelativeLabel(value) {
  const due = new Date(value).getTime();
  const diff = due - Date.now();
  const absMinutes = Math.max(1, Math.round(Math.abs(diff) / 60000));

  if (diff < 0) {
    if (absMinutes < 60) return `已逾期 ${absMinutes} 分钟`;
    return `已逾期 ${Math.round(absMinutes / 60)} 小时`;
  }

  if (absMinutes < 60) return `${absMinutes} 分钟后`;
  if (absMinutes < 1440) return `${Math.round(absMinutes / 60)} 小时后`;
  return `${Math.round(absMinutes / 1440)} 天后`;
}

function getStatus(task) {
  if (task.done) return "done";
  if (new Date(task.dueAt).getTime() < Date.now()) return "overdue";
  if (isToday(task.dueAt)) return "today";
  return "upcoming";
}

function emptyForm() {
  return {
    title: "",
    notes: "",
    category: "个人",
    priority: "medium",
    reminderMinutes: 15,
    dueAt: toInputDateTime(new Date()),
  };
}

function App() {
  const [tasks, setTasks] = useState(readStoredTasks);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();

      setTasks((current) => {
        let changed = false;

        const nextTasks = current.map((task) => {
          if (task.done || task.notifiedAt) return task;

          const reminderAt =
            new Date(task.dueAt).getTime() - Number(task.reminderMinutes) * 60000;

          if (reminderAt > now) return task;

          const message = `${formatDateTime(task.dueAt)} 到期`;

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`待办提醒：${task.title}`, {
              body: message,
              tag: task.id,
            });
          }

          setNotice({
            id: task.id,
            title: task.title,
            message,
          });

          changed = true;
          return { ...task, notifiedAt: new Date().toISOString() };
        });

        return changed ? nextTasks : current;
      });
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => {
    const active = tasks.filter((task) => !task.done);
    return {
      active: HEADER_METRICS.active,
      done: HEADER_METRICS.done,
      today: active.filter((task) => isToday(task.dueAt)).length,
      overdue: active.filter((task) => new Date(task.dueAt).getTime() < Date.now()).length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks
      .filter((task) => {
        const status = getStatus(task);
        const matchesFilter =
          filter === "all" ||
          (filter === "done" && task.done) ||
          (filter !== "done" && status === filter);

        if (!matchesFilter) return false;
        if (!normalizedQuery) return true;

        return [task.title, task.notes, task.category]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const timeDelta = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (timeDelta !== 0) return timeDelta;
        return priorityRank[b.priority] - priorityRank[a.priority];
      });
  }, [filter, query, tasks]);

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotice({
        id: "unsupported",
        title: "浏览器不支持系统通知",
        message: "页面内提醒仍会正常显示",
      });
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addTask(event) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;

    const task = {
      id: crypto.randomUUID(),
      title,
      notes: form.notes.trim(),
      category: form.category.trim() || "未分类",
      priority: form.priority,
      reminderMinutes: Number(form.reminderMinutes),
      dueAt: new Date(form.dueAt).toISOString(),
      done: false,
      createdAt: new Date().toISOString(),
      notifiedAt: null,
    };

    setTasks((current) => [task, ...current]);
    setForm((current) => ({ ...emptyForm(), category: current.category }));
  }

  function toggleTask(id) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              done: !task.done,
            }
          : task,
      ),
    );
  }

  function removeTask(id) {
    setTasks((current) => current.filter((task) => task.id !== id));
    if (notice?.id === id) setNotice(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <ListTodo size={22} strokeWidth={2.2} />
          </span>
          <div>
            <p className="eyebrow">Todo Reminder</p>
            <h1>待办提醒</h1>
          </div>
        </div>

        <div className="metric-strip" aria-label="待办统计">
          <Metric label="未完成" value={metrics.active} />
          <Metric label="已完成" value={metrics.done} />
          <Metric label="今天" value={metrics.today} />
          <Metric label="逾期" value={metrics.overdue} highlight={metrics.overdue > 0} />
        </div>
      </header>

      {notice ? (
        <div className="notice" role="status">
          <Bell size={18} />
          <div>
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </div>
          <button className="icon-button" type="button" onClick={() => setNotice(null)} title="关闭提醒">
            <X size={18} />
          </button>
        </div>
      ) : null}

      <div className="workspace">
        <aside className="composer" aria-label="新建待办">
          <div className="section-title">
            <CalendarClock size={20} />
            <h2>新建事项</h2>
          </div>

          <form className="task-form" onSubmit={addTask}>
            <label>
              <span>事项</span>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="例如：提交周报"
                maxLength={60}
                required
              />
            </label>

            <label>
              <span>到期时间</span>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) => updateForm("dueAt", event.target.value)}
                required
              />
            </label>

            <div className="form-grid">
              <label>
                <span>优先级</span>
                <select
                  value={form.priority}
                  onChange={(event) => updateForm("priority", event.target.value)}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>提醒</span>
                <select
                  value={form.reminderMinutes}
                  onChange={(event) => updateForm("reminderMinutes", event.target.value)}
                >
                  {REMINDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>分类</span>
              <input
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                placeholder="个人、工作、学习"
                maxLength={20}
              />
            </label>

            <label>
              <span>备注</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="补充地点、资料或准备事项"
                rows="4"
                maxLength={180}
              />
            </label>

            <button className="primary-button" type="submit">
              <Plus size={18} />
              <span>添加待办</span>
            </button>
          </form>

          <button
            className="notification-button"
            type="button"
            onClick={requestNotifications}
            disabled={notificationPermission === "granted"}
          >
            <Bell size={18} />
            <span>
              {notificationPermission === "granted"
                ? "系统通知已开启"
                : notificationPermission === "unsupported"
                  ? "使用页面提醒"
                  : "开启系统通知"}
            </span>
          </button>
        </aside>

        <section className="task-board" aria-label="待办列表">
          <div className="board-tools">
            <div className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索事项、分类或备注"
              />
            </div>

            <div className="filter-tabs" aria-label="筛选待办">
              <ListFilter size={18} />
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  className={filter === item.value ? "active" : ""}
                  type="button"
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="task-list">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />
              ))
            ) : (
              <div className="empty-state">
                <Clock3 size={30} />
                <h3>{tasks.length ? "没有匹配的待办" : "还没有待办"}</h3>
                <p>{tasks.length ? "换个筛选条件看看。" : "添加第一条事项后，会在这里按到期时间排列。"}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, highlight = false }) {
  return (
    <div className={highlight ? "metric metric-alert" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskCard({ task, onToggle, onRemove }) {
  const status = getStatus(task);
  const priority = PRIORITIES.find((item) => item.value === task.priority) || PRIORITIES[1];

  return (
    <article className={`task-card ${task.done ? "completed" : ""} ${status}`}>
      <button
        className="complete-button"
        type="button"
        onClick={() => onToggle(task.id)}
        title={task.done ? "标记为未完成" : "标记为完成"}
      >
        {task.done ? <Check size={18} /> : <Circle size={18} />}
      </button>

      <div className="task-content">
        <div className="task-mainline">
          <h3>{task.title}</h3>
          <span className={`priority-chip ${priority.tone}`}>{priority.label}</span>
        </div>

        <div className="task-meta">
          <span>
            <Clock3 size={15} />
            {formatDateTime(task.dueAt)}
          </span>
          <span>{getRelativeLabel(task.dueAt)}</span>
          <span>{task.category}</span>
        </div>

        {task.notes ? <p>{task.notes}</p> : null}

        {status === "overdue" && !task.done ? (
          <div className="overdue-line">
            <AlertTriangle size={15} />
            <span>需要处理</span>
          </div>
        ) : null}
      </div>

      <button
        className="icon-button danger-button"
        type="button"
        onClick={() => onRemove(task.id)}
        title="删除待办"
      >
        <Trash2 size={18} />
      </button>
    </article>
  );
}

export default App;
