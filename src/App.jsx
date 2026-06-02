import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Circle,
  Clock3,
  ListFilter,
  ListTodo,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

const STORAGE_KEY = "todo-reminder.tasks.v1";
const STARTER_TASKS_KEY = "todo-reminder.seeded.v1";

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

const priorityRank = {
  high: 3,
  medium: 2,
  low: 1,
};

const NOTIFICATION_UNSUPPORTED = "unsupported";
const NOTIFICATION_INSECURE = "insecure";

const TASK_TEMPLATES = [
  {
    title: "整理今天最重要的三件事",
    notes: "把优先级和预估耗时补充完整，避免临时切换任务。",
    category: "工作",
    priority: "high",
    reminderMinutes: 15,
    offsetMinutes: 90,
  },
  {
    title: "回复本周待确认的消息",
    notes: "优先处理需要明确时间和结论的对话。",
    category: "沟通",
    priority: "medium",
    reminderMinutes: 30,
    offsetMinutes: 180,
  },
  {
    title: "晚上散步或拉伸 30 分钟",
    notes: "结束工作前先准备好运动鞋或瑜伽垫。",
    category: "个人",
    priority: "low",
    reminderMinutes: 60,
    offsetMinutes: 720,
  },
  {
    title: "检查并更新购物清单",
    notes: "顺手补上本周常用消耗品，减少临时出门。",
    category: "生活",
    priority: "low",
    reminderMinutes: 1440,
    offsetMinutes: 1560,
  },
  {
    title: "完成 25 分钟专注学习",
    notes: "只定一个小目标，例如看完一节课程或做完一页笔记。",
    category: "学习",
    priority: "medium",
    reminderMinutes: 15,
    offsetMinutes: 2040,
  },
  {
    title: "整理本周要跟进的待办",
    notes: "把卡住的事项拆成下一步动作，方便继续推进。",
    category: "规划",
    priority: "high",
    reminderMinutes: 30,
    offsetMinutes: 2880,
  },
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toInputDateTime(date) {
  const next = new Date(date);
  next.setHours(18, 30, 0, 0);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function toLocalDateTimeValue(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readStoredTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function getNotificationPermissionState() {
  if (typeof window === "undefined") return NOTIFICATION_UNSUPPORTED;
  if (!("Notification" in window)) return NOTIFICATION_UNSUPPORTED;
  if (!window.isSecureContext) return NOTIFICATION_INSECURE;
  return Notification.permission;
}

function showSystemNotification(title, options = {}) {
  if (getNotificationPermissionState() !== "granted") return false;

  try {
    new Notification(title, options);
    return true;
  } catch (error) {
    console.error("Failed to show system notification.", error);
    return false;
  }
}

function getNotificationButtonLabel(permission) {
  if (permission === "granted") return "已开启通知";
  if (permission === NOTIFICATION_UNSUPPORTED) return "当前浏览器不支持";
  if (permission === NOTIFICATION_INSECURE) return "仅 localhost / HTTPS 可用";
  if (permission === "denied") return "去浏览器里允许通知";
  return "开启系统通知";
}

function getNotificationButtonClassName(permission) {
  if (permission === "granted") return "notification-button is-granted";
  if (permission === "denied") return "notification-button is-denied";
  return "notification-button";
}

function getNotificationHelperText(permission) {
  if (permission === "granted") {
    return "授权成功后，会在到期前弹出系统通知，同时保留页面内提醒。";
  }

  if (permission === "denied") {
    return "浏览器已经拦截通知，请在地址栏或系统设置里允许当前站点通知。";
  }

  if (permission === NOTIFICATION_INSECURE) {
    return "系统通知只在 localhost 或 HTTPS 环境可用，直接打开文件或普通 HTTP 页面无法授权。";
  }

  if (permission === NOTIFICATION_UNSUPPORTED) {
    return "当前环境不支持系统通知，不过页面内提醒仍然可以使用。";
  }

  return "建议先开启通知权限，提醒到点时会同时显示系统通知和页面提醒。";
}

function pickTaskTemplates(count) {
  const pool = [...TASK_TEMPLATES];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count);
}

function createGeneratedTasks(count = 3) {
  const createdAt = new Date().toISOString();

  return pickTaskTemplates(count).map((template, index) => {
    const dueAt = new Date();
    dueAt.setMinutes(dueAt.getMinutes() + template.offsetMinutes + index * 15);
    dueAt.setSeconds(0, 0);

    return {
      id: crypto.randomUUID(),
      title: template.title,
      notes: template.notes,
      category: template.category,
      priority: template.priority,
      reminderMinutes: template.reminderMinutes,
      dueAt: dueAt.toISOString(),
      done: false,
      createdAt,
      notifiedAt: null,
    };
  });
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
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null);
  const composerRef = useRef(null);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermissionState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
    };

    syncNotificationPermission();
    window.addEventListener("focus", syncNotificationPermission);
    document.addEventListener("visibilitychange", syncNotificationPermission);

    return () => {
      window.removeEventListener("focus", syncNotificationPermission);
      document.removeEventListener("visibilitychange", syncNotificationPermission);
    };
  }, []);

  useEffect(() => {
    if (tasks.length > 0 || localStorage.getItem(STARTER_TASKS_KEY)) return;

    const starterTasks = createGeneratedTasks(3);
    setTasks(starterTasks);
    localStorage.setItem(STARTER_TASKS_KEY, "true");
    setNotice({
      id: "starter-tasks",
      title: "已生成 3 条待办事项",
      message: "可以直接开始勾选，也可以继续调整时间、优先级和备注。",
    });
  }, [tasks.length]);

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
          const delivered = showSystemNotification(`待办提醒：${task.title}`, {
            body: message,
            tag: task.id,
          });

          setNotice({
            id: task.id,
            title: task.title,
            message: delivered ? message : `${message} · 系统通知未显示，已切换为页面提醒`,
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
      active: active.length,
      done: tasks.length - active.length,
      today: active.filter((task) => isToday(task.dueAt)).length,
      overdue: active.filter((task) => new Date(task.dueAt).getTime() < Date.now()).length,
    };
  }, [tasks]);

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingTaskId) || null,
    [editingTaskId, tasks],
  );

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
    const currentPermission = getNotificationPermissionState();
    setNotificationPermission(currentPermission);

    if (currentPermission === NOTIFICATION_UNSUPPORTED) {
      setNotice({
        id: NOTIFICATION_UNSUPPORTED,
        title: "浏览器不支持系统通知",
        message: "页面内提醒仍会正常显示",
      });
      return;
    }

    if (currentPermission === NOTIFICATION_INSECURE) {
      setNotice({
        id: NOTIFICATION_INSECURE,
        title: "当前环境无法授权通知",
        message: "请在 localhost 或 HTTPS 环境中打开页面后再开启系统通知。",
      });
      return;
    }

    if (currentPermission === "granted") {
      const delivered = showSystemNotification("系统通知已开启", {
        body: "已发送测试通知，后续待办到点时会自动提醒你。",
        tag: "todo-reminder.permission-test",
      });

      setNotice({
        id: "notification-granted",
        title: delivered ? "系统通知已开启" : "通知权限已授权",
        message: delivered
          ? "测试通知已经发送，后续提醒会继续通过系统通知和页面内提醒同时显示。"
          : "浏览器权限已经开启，但测试通知没有显示，请检查系统通知设置是否拦截了浏览器。",
      });
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(getNotificationPermissionState());

      if (permission === "granted") {
        const delivered = showSystemNotification("系统通知已开启", {
          body: "已发送测试通知，后续待办到点时会自动提醒你。",
          tag: "todo-reminder.permission-test",
        });

        setNotice({
          id: "notification-granted",
          title: delivered ? "系统通知已开启" : "通知权限已授权",
          message: delivered
            ? "测试通知已经发送，后续提醒会继续通过系统通知和页面内提醒同时显示。"
            : "浏览器权限已经开启，但测试通知没有显示，请检查系统通知设置是否拦截了浏览器。",
        });
        return;
      }

      if (permission === "denied") {
        setNotice({
          id: "notification-denied",
          title: "系统通知被拦截",
          message: "请在浏览器地址栏或系统设置里允许当前站点通知，然后回到页面重试。",
        });
        return;
      }

      setNotice({
        id: "notification-default",
        title: "还没有开启系统通知",
        message: "浏览器没有完成授权，本应用会继续使用页面内提醒。",
      });
    } catch (error) {
      console.error("Failed to request notification permission.", error);
      setNotice({
        id: "notification-error",
        title: "无法请求系统通知",
        message: "请确认当前页面运行在 localhost 或 HTTPS 环境，并检查浏览器是否允许弹出通知授权。",
      });
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm(nextCategory = "个人") {
    setForm({ ...emptyForm(), category: nextCategory });
  }

  function cancelEditing() {
    setEditingTaskId(null);
    resetForm(form.category.trim() || "个人");
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setForm({
      title: task.title,
      notes: task.notes,
      category: task.category,
      priority: task.priority,
      reminderMinutes: task.reminderMinutes,
      dueAt: toLocalDateTimeValue(task.dueAt),
    });
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitTask(event) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const category = form.category.trim() || "未分类";
    const dueAt = new Date(form.dueAt).toISOString();
    const reminderMinutes = Number(form.reminderMinutes);
    const nextCategory = form.category.trim() || "个人";

    if (editingTaskId) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingTaskId
            ? {
                ...task,
                title,
                notes: form.notes.trim(),
                category,
                priority: form.priority,
                reminderMinutes,
                dueAt,
                notifiedAt: null,
              }
            : task,
        ),
      );
      setNotice({
        id: `edited-${editingTaskId}`,
        title: "待办已更新",
        message: `${title} 的内容已经保存。`,
      });
      setEditingTaskId(null);
      resetForm(nextCategory);
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      notes: form.notes.trim(),
      category,
      priority: form.priority,
      reminderMinutes,
      dueAt,
      done: false,
      createdAt: new Date().toISOString(),
      notifiedAt: null,
    };

    setTasks((current) => [task, ...current]);
    resetForm(nextCategory);
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
    if (editingTaskId === id) {
      setEditingTaskId(null);
      resetForm();
    }
  }

  function addGeneratedTasks() {
    const generatedTasks = createGeneratedTasks(3);
    setTasks((current) => [...generatedTasks, ...current]);
    localStorage.setItem(STARTER_TASKS_KEY, "true");
    setNotice({
      id: `generated-${generatedTasks[0].id}`,
      title: "已添加 3 条随机待办",
      message: "可以继续编辑内容，或者直接开始完成它们。",
    });
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
        <aside ref={composerRef} className="composer" aria-label={editingTask ? "修改待办" : "新建待办"}>
          <div className="section-title">
            <CalendarClock size={20} />
            <h2>{editingTask ? "修改事项" : "新建事项"}</h2>
          </div>

          {editingTask ? <p className="composer-caption">正在修改：{editingTask.title}</p> : null}

          <form className="task-form" onSubmit={submitTask}>
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

            <div className={editingTask ? "composer-actions editing" : "composer-actions"}>
              <button className="primary-button" type="submit">
                {editingTask ? <Check size={18} /> : <Plus size={18} />}
                <span>{editingTask ? "保存修改" : "添加待办"}</span>
              </button>

              {editingTask ? (
                <button className="subtle-button" type="button" onClick={cancelEditing}>
                  <X size={18} />
                  <span>取消修改</span>
                </button>
              ) : null}

              <button className="secondary-button" type="button" onClick={addGeneratedTasks}>
                <ListTodo size={18} />
                <span>随机生成 3 条</span>
              </button>
            </div>
          </form>

          <button
            className={getNotificationButtonClassName(notificationPermission)}
            type="button"
            onClick={requestNotifications}
            disabled={
              notificationPermission === NOTIFICATION_UNSUPPORTED ||
              notificationPermission === NOTIFICATION_INSECURE
            }
            aria-pressed={notificationPermission === "granted"}
          >
            <Bell size={18} />
            <span>{getNotificationButtonLabel(notificationPermission)}</span>
          </button>

          <p className="notification-hint">{getNotificationHelperText(notificationPermission)}</p>
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
                <TaskCard
                  key={task.id}
                  task={task}
                  isEditing={editingTaskId === task.id}
                  onEdit={startEditing}
                  onToggle={toggleTask}
                  onRemove={removeTask}
                />
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

function TaskCard({ task, isEditing, onEdit, onToggle, onRemove }) {
  const status = getStatus(task);
  const priority = PRIORITIES.find((item) => item.value === task.priority) || PRIORITIES[1];

  return (
    <article className={`task-card ${task.done ? "completed" : ""} ${status} ${isEditing ? "editing" : ""}`}>
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

      <div className="task-actions">
        <button
          className="icon-button edit-button"
          type="button"
          onClick={() => onEdit(task)}
          title="修改待办"
        >
          <Pencil size={18} />
        </button>

        <button
          className="icon-button danger-button"
          type="button"
          onClick={() => onRemove(task.id)}
          title="删除待办"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}

export default App;
