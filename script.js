const SUPABASE_URL = "https://saxpyxzbiruwytllmoia.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_u6miLXnbZUhjtfH2YE7eGQ_CW0fDLQ9";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

let classes = [];
let tasksCache = [];

// subjects = weekly schedule + class countdown
// tasks = all-tasks list + soonest-task countdown
let viewMode = localStorage.getItem("classClockViewMode") === "tasks"
    ? "tasks"
    : "subjects";

// ------------------------------------------------------------
// TASK DONE (local to this browser)
// ------------------------------------------------------------

const TASKS_DONE_KEY = "classClockTasksDone";

function loadDoneTaskIds() {
    try {
        const raw = localStorage.getItem(TASKS_DONE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (error) {
        return new Set();
    }
}

function saveDoneTaskIds(set) {
    localStorage.setItem(
        TASKS_DONE_KEY,
        JSON.stringify([...set])
    );
}

function isTaskDone(taskId) {
    return loadDoneTaskIds().has(String(taskId));
}

function markTaskDone(taskId) {
    const set = loadDoneTaskIds();
    set.add(String(taskId));
    saveDoneTaskIds(set);
}

function unmarkTaskDone(taskId) {
    const set = loadDoneTaskIds();
    set.delete(String(taskId));
    saveDoneTaskIds(set);
}

function sortTasksByDeadline(tasks) {
    return [...tasks].sort((a, b) => {
        const aDone = isTaskDone(a.id);
        const bDone = isTaskDone(b.id);

        // Incomplete tasks first, done last
        if (aDone !== bDone) {
            return aDone ? 1 : -1;
        }

        // Soonest deadline first; no due date at the end of incomplete group
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;

        if (a.due_date < b.due_date) return -1;
        if (a.due_date > b.due_date) return 1;
        return 0;
    });
}

// ------------------------------------------------------------
// BROWSER NOTIFICATIONS
// ------------------------------------------------------------

const notificationState = {
    lastCheckedMinute: "",
    sent: new Set(),
    enabled: localStorage.getItem("classClockNotificationsEnabled") === "true"
};

// Decreasing reminder thresholds (hours before deadline) when under 24h
const TASK_NEAR_THRESHOLDS_HOURS = [24, 12, 6, 4, 2, 1, 0.5, 0.25];

function notificationElements() {
    return {
        button: document.getElementById("notification-toggle"),
        icon: document.getElementById("notification-icon"),
        label: document.getElementById("notification-label"),
        status: document.getElementById("notification-status")
    };
}

function setNotificationUI(message = "") {
    const { button, icon, label, status } = notificationElements();
    if (!button) return;

    const permission = ("Notification" in window)
        ? Notification.permission
        : "unsupported";

    button.classList.remove("enabled", "denied", "off");

    if (permission === "granted") {
        if (notificationState.enabled) {
            button.classList.add("enabled");
            icon.textContent = "🔔";
            label.textContent = "NOTIFY ON";
            button.title = "Turn Class Clock notifications off";
            if (status) status.textContent = message || "Class notifications are enabled.";
        } else {
            button.classList.add("off");
            icon.textContent = "🔕";
            label.textContent = "NOTIFY OFF";
            button.title = "Turn Class Clock notifications on";
            if (status) status.textContent = message || "Class notifications are OFF.";
        }
    } else if (permission === "denied") {
        button.classList.add("denied");
        icon.textContent = "🔕";
        label.textContent = "BLOCKED";
        button.title = "Notifications are blocked in your browser";
        if (status) status.textContent = message || "Notifications are blocked. Allow them in Firefox site permissions.";
    } else if (permission === "default") {
        icon.textContent = "🔕";
        label.textContent = "NOTIFY";
        button.title = "Enable class notifications";
        if (status) status.textContent = message || "Click NOTIFY to receive class reminders.";
    } else {
        icon.textContent = "🔕";
        label.textContent = "N/A";
        button.title = "Browser notifications are unavailable";
        if (status) status.textContent = "Browser notifications are not supported here.";
    }
}

async function toggleNotifications() {
    if (!("Notification" in window)) {
        setNotificationUI("This browser does not support notifications.");
        return;
    }

    // If the app is currently enabled, turn Class Clock notifications off.
    // Browser permission remains granted, but Class Clock stops sending alerts.
    if (notificationState.enabled) {
        notificationState.enabled = false;
        notificationState.sent.clear();
        localStorage.setItem("classClockNotificationsEnabled", "false");
        setNotificationUI("Class notifications are OFF. Click NOTIFY to turn them back on.");
        return;
    }

    // If permission was already granted, re-enable immediately.
    if (Notification.permission === "granted") {
        notificationState.enabled = true;
        notificationState.sent.clear();
        localStorage.setItem("classClockNotificationsEnabled", "true");
        setNotificationUI("Class notifications are ON.");
        return;
    }

    if (Notification.permission === "denied") {
        setNotificationUI("Notifications are blocked. Allow them in Firefox site permissions first.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            notificationState.enabled = true;
            notificationState.sent.clear();
            localStorage.setItem("classClockNotificationsEnabled", "true");

            setNotificationUI("Notifications enabled. You will get reminders 10 and 5 minutes before class, plus start/end alerts.");

            new Notification("Class Clock", {
                body: "Notifications are now enabled.",
                tag: "class-clock-enabled"
            });
        } else {
            setNotificationUI("Notification permission was not granted.");
        }
    } catch (error) {
        console.error("Notification permission error:", error);
        setNotificationUI("Could not enable notifications.");
    }
}

function sendClassNotification(title, body, tag, requireInteraction = false) {
    if (!notificationState.enabled) return;

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    try {
        new Notification(title, {
            body,
            tag,
            requireInteraction
        });
    } catch (error) {
        console.error("Could not send notification:", error);
    }
}

function notificationKey(classItem, date, event) {
    return [
        date.toISOString().slice(0, 10),
        classItem.name,
        classItem.start,
        classItem.end,
        event
    ].join("|");
}

function checkClassNotifications() {
    if (!notificationState.enabled) return;
    if (!classes.length) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    const today = now.getDay();

    for (const classItem of classes) {
        if (classItem.day !== today) continue;

        const times = getClassTimes(classItem, now);
        const minutesUntilStart = (times.start - now) / 60000;
        const minutesSinceEnd = (now - times.end) / 60000;

        // 10-minute reminder, with a small tolerance so a delayed browser
        // timer doesn't miss the notification.
        if (minutesUntilStart >= 0 && minutesUntilStart <= 10) {
            const key = notificationKey(classItem, now, "10-minute");
            if (!notificationState.sent.has(key) && minutesUntilStart <= 10 && minutesUntilStart > 5) {
                notificationState.sent.add(key);
                sendClassNotification(
                    "Class Clock",
                    `${classItem.name} starts in about 10 minutes.`,
                    `class-clock-10-${key}`
                );
            }
        }

        // 5-minute reminder.
        if (minutesUntilStart >= 0 && minutesUntilStart <= 5) {
            const key = notificationKey(classItem, now, "5-minute");
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);
                sendClassNotification(
                    "Class Clock",
                    `${classItem.name} starts in about 5 minutes.`,
                    `class-clock-5-${key}`
                );
            }
        }

        // Class starts.
        if (now >= times.start && now < new Date(times.start.getTime() + 60000)) {
            const key = notificationKey(classItem, now, "start");
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);
                sendClassNotification(
                    "Class Clock",
                    `${classItem.name} is starting now.`,
                    `class-clock-start-${key}`
                );
            }
        }

        // Class ends.
        if (minutesSinceEnd >= 0 && minutesSinceEnd < 1) {
            const key = notificationKey(classItem, now, "end");
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);
                sendClassNotification(
                    "Class Clock",
                    `${classItem.name} has ended.`,
                    `class-clock-end-${key}`
                );
            }
        }
    }

    // Keep memory bounded during long-running sessions.
    if (notificationState.sent.size > 200) {
        notificationState.sent = new Set(
            [...notificationState.sent].slice(-100)
        );
    }
}

function checkTaskNotifications() {
    if (!notificationState.enabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!tasksCache.length) return;

    const now = new Date();

    for (const task of tasksCache) {
        if (!task.due_date) continue;
        if (isTaskDone(task.id)) continue;

        const deadline = getDeadlineEnd(task.due_date);
        const msLeft = deadline.getTime() - now.getTime();

        // Already past deadline — one overdue notice
        if (msLeft <= 0) {
            const key = `task|${task.id}|overdue|${task.due_date}`;
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);
                sendClassNotification(
                    "Task overdue",
                    `"${task.title}" is past its deadline (${task.due_date}).`,
                    key,
                    true
                );
            }
            continue;
        }

        const hoursLeft = msLeft / 3600000;

        if (hoursLeft > 24) {
            // More than 24h out: at most one reminder per calendar day
            const dayKey = now.toISOString().slice(0, 10);
            const key = `task|${task.id}|daily|${dayKey}`;
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);
                const days = Math.ceil(hoursLeft / 24);
                sendClassNotification(
                    "Upcoming task",
                    `"${task.title}" is due in about ${days} day${days !== 1 ? "s" : ""} (${task.due_date}).`,
                    key
                );
            }
            continue;
        }

        // Under 24h: notify at decreasing thresholds
        // 24h → 12h → 6h → 4h → 2h → 1h → 30m → 15m
        // Only the tightest applicable unsent threshold fires each cycle
        let tightest = null;
        for (const threshold of TASK_NEAR_THRESHOLDS_HOURS) {
            if (hoursLeft <= threshold) {
                tightest = threshold;
            }
        }

        if (tightest !== null) {
            const key = `task|${task.id}|t${tightest}|${task.due_date}`;
            if (!notificationState.sent.has(key)) {
                notificationState.sent.add(key);

                let when;
                if (tightest >= 1) {
                    when = `about ${tightest} hour${tightest !== 1 ? "s" : ""}`;
                } else {
                    const mins = Math.round(tightest * 60);
                    when = `about ${mins} minutes`;
                }

                sendClassNotification(
                    "Task deadline soon",
                    `"${task.title}" is due in ${when} (${task.due_date}).`,
                    key
                );
            }
        }
    }

    if (notificationState.sent.size > 300) {
        notificationState.sent = new Set(
            [...notificationState.sent].slice(-150)
        );
    }
}

function initializeNotifications() {
    const button = document.getElementById("notification-toggle");
    if (!button) return;

    button.addEventListener("click", toggleNotifications);
    setNotificationUI();

    // Check immediately, then regularly. This continues while the page is open
    // or kept alive in the browser's background tabs.
    checkClassNotifications();
    checkTaskNotifications();
    setInterval(() => {
        checkClassNotifications();
        checkTaskNotifications();
    }, 15000);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            checkClassNotifications();
            checkTaskNotifications();
            setNotificationUI();
        }
    });
}


const DAYS = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY"
];

const DAY_DEFAULT_COLOR = "#39a9ff";
const DAY_TODAY_COLOR = "#4ee38b";
const CLASS_DEFAULT_COLOR = "#39a9ff";
const LIVE_COLOR = "#4ee38b";

function getDayName(day) {
    return DAYS[day];
}

function getClassTimes(classItem, referenceDate) {
    const start = new Date(referenceDate);
    const end = new Date(referenceDate);

    start.setHours(
        Number(classItem.start.split(":")[0]),
        Number(classItem.start.split(":")[1]),
        0,
        0
    );

    end.setHours(
        Number(classItem.end.split(":")[0]),
        Number(classItem.end.split(":")[1]),
        0,
        0
    );

    // Dismissed early today → treat as already finished
    if (classItem.dismissedEarly) {
        const now = new Date();
        if (end > now) {
            end.setTime(now.getTime() - 1);
        }
        if (end < start) {
            end.setTime(start.getTime());
        }
    }

    return { start, end };
}

function findNextClass() {
    const now = new Date();
    const today = now.getDay();

    let current = null;
    let nextToday = null;
    let nextFuture = null;

    for (const classItem of classes) {

        // SKIPPED CLASSES NEVER COUNT AS CURRENT OR UPCOMING
        if (classItem.skipped) {
            continue;
        }

        let daysUntil = (classItem.day - today + 7) % 7;

        const classDate = new Date(now);
        classDate.setDate(now.getDate() + daysUntil);

        const times = getClassTimes(classItem, classDate);

        // A class currently in progress always takes priority.
        if (
            classItem.day === today &&
            times.start <= now &&
            now < times.end
        ) {
            current = {
                classItem,
                start: times.start,
                end: times.end
            };

            break;
        }

        // Classes later today are the next class for the current day.
        if (
            classItem.day === today &&
            times.start > now
        ) {
            if (
                nextToday === null ||
                times.start < nextToday.start
            ) {
                nextToday = {
                    classItem,
                    start: times.start,
                    end: times.end
                };
            }

            continue;
        }

        // Classes on a future day.
        // If the class is earlier today in the weekly cycle,
        // move it to its next weekly occurrence.
        if (times.start <= now) {

            classDate.setDate(
                classDate.getDate() + 7
            );

            const nextTimes =
                getClassTimes(classItem, classDate);

            if (
                nextFuture === null ||
                nextTimes.start < nextFuture.start
            ) {
                nextFuture = {
                    classItem,
                    start: nextTimes.start,
                    end: nextTimes.end
                };
            }

        } else if (
            nextFuture === null ||
            times.start < nextFuture.start
        ) {

            nextFuture = {
                classItem,
                start: times.start,
                end: times.end
            };
        }
    }

    if (current !== null) {
        return {
            state: "during",
            classItem: current.classItem,
            start: current.start,
            end: current.end,
            target: current.end
        };
    }

    if (nextToday !== null) {
        return {
            state: "before",
            classItem: nextToday.classItem,
            start: nextToday.start,
            end: nextToday.end,
            target: nextToday.start
        };
    }

    if (nextFuture !== null) {
        return {
            state: "after-today",
            classItem: nextFuture.classItem,
            start: nextFuture.start,
            end: nextFuture.end,
            target: null
        };
    }

    return null;
}

function getClassKey(classItem) {
    return `${classItem.day}-${classItem.start}-${classItem.end}-${classItem.name}`;
}

// Most recently finished class today (not skipped).
// Cleared automatically when a newer class ends, or on a new day
// (only today's classes are considered).
function findPreviousClass() {
    const now = new Date();
    const today = now.getDay();

    let previous = null;

    for (const classItem of classes) {
        if (classItem.skipped) continue;
        if (classItem.day !== today) continue;

        const times = getClassTimes(classItem, now);

        // Only classes that have already ended
        if (times.end > now) continue;

        if (
            previous === null ||
            times.end > previous.end
        ) {
            previous = {
                classItem,
                start: times.start,
                end: times.end
            };
        }
    }

    return previous;
}

function formatCountdown(milliseconds) {
    if (milliseconds < 0) {
        milliseconds = 0;
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return (
        String(hours).padStart(2, "0") + ":" +
        String(minutes).padStart(2, "0") + ":" +
        String(seconds).padStart(2, "0")
    );
}

function formatNaturalCountdown(milliseconds) {
    if (milliseconds < 0) {
        milliseconds = 0;
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
    if (seconds > 0 || parts.length === 0) {
        parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
    }

    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

function format12Hour(timeString) {
    const [hour, minute] = timeString.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;

    return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatTimeRange12(classItem) {
    return `${format12Hour(classItem.start)} - ${format12Hour(classItem.end)}`;
}

function getRelativeScheduleDay(classItem) {
    const today = new Date().getDay();
    const daysUntil = (classItem.day - today + 7) % 7;

    if (daysUntil === 1) {
        return "Tomorrow";
    }

    return getDayName(classItem.day);
}

function updateCurrentClock() {
    const now = new Date();

    document.getElementById("current-date").textContent =
        now.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric"
        }).toUpperCase();

    document.getElementById("current-time").textContent =
        now.toLocaleTimeString("en-US", {
            hour12: false
        });
}

function updateFloatingClassStatus() {
    const hero = document.getElementById("hero");
    const floating = document.getElementById("floating-class-status");

    if (!hero || !floating) {
        return;
    }

    // Show the compact class-status card only after the main hero
    // has scrolled out of view.
    const heroBottom = hero.getBoundingClientRect().bottom;
    const showFloating = heroBottom < 0;

    floating.classList.toggle("visible", showFloating);
    floating.setAttribute("aria-hidden", String(!showFloating));
}

function updateFloatingClassContent(result) {
    const title = document.getElementById("floating-note-title");
    const text = document.getElementById("floating-note-text");
    const floating = document.getElementById("floating-class-status");

    if (!title || !text || !floating) {
        return;
    }

    if (!result) {
        title.textContent = "SCHEDULE";
        text.textContent = "There are no classes in the schedule.";
        floating.classList.remove("live");
        return;
    }

    if (result.state === "after-today") {
        title.textContent = "NO MORE CLASSES TODAY";
        const relativeDay = getRelativeScheduleDay(result.classItem);
        text.textContent = relativeDay === "Tomorrow"
            ? "Come back tomorrow."
            : `Come back on ${relativeDay}.`;
        floating.classList.remove("live");
        floating.classList.add("after-today");
        return;
    }

    floating.classList.remove("after-today");

    const remaining = result.target - new Date();

    if (result.state === "during") {
        title.textContent = "CURRENT CLASS";
        text.textContent = `Class ends in ${formatNaturalCountdown(remaining)}.`;
        floating.classList.add("live");
    } else {
        title.textContent = "NEXT CLASS";
        text.textContent = `Starts in ${formatNaturalCountdown(remaining)}.`;
        floating.classList.remove("live");
    }
}

function updateHeroState(result) {
    const hero = document.getElementById("hero");

    hero.classList.toggle("live", result && result.state === "during");
    hero.classList.toggle("after-today", result && result.state === "after-today");
}

function findSoonestTask() {
    const open = tasksCache.filter(
        t => t.due_date && !isTaskDone(t.id)
    );

    if (!open.length) {
        return null;
    }

    open.sort((a, b) => {
        if (a.due_date < b.due_date) return -1;
        if (a.due_date > b.due_date) return 1;
        return 0;
    });

    const task = open[0];
    const deadline = getDeadlineEnd(task.due_date);
    const now = new Date();

    return {
        task,
        deadline,
        remaining: deadline.getTime() - now.getTime(),
        overdue: deadline.getTime() <= now.getTime()
    };
}

function getClassNameForTask(task) {
    if (!task || task.class_id == null) return "Task";
    const cls = classes.find(
        c => String(c.id) === String(task.class_id)
    );
    if (!cls) return "Task";
    return (cls.name || "").replace(" [ONLINE CLASS]", "") || "Task";
}

function updateViewModeUI() {
    const toggle = document.getElementById("view-mode-toggle");
    const subjectsSection = document.getElementById("subjects-section");
    const tasksSection = document.getElementById("tasks-section");
    const hero = document.getElementById("hero");

    if (toggle) {
        toggle.textContent =
            viewMode === "tasks" ? "ALL SUBJECTS" : "ALL TASKS";
    }

    if (subjectsSection) {
        subjectsSection.hidden = viewMode === "tasks";
    }

    if (tasksSection) {
        tasksSection.hidden = viewMode !== "tasks";
    }

    if (hero) {
        hero.classList.toggle("tasks-mode", viewMode === "tasks");
    }

    if (viewMode === "tasks") {
        renderAllTasksList();
    }
}

function renderAllTasksList() {
    const list = document.getElementById("all-tasks-list");
    if (!list) return;

    const sorted = sortTasksByDeadline(tasksCache);

    if (!sorted.length) {
        list.innerHTML = `
            <div class="empty-state animate-fade-in">
                No tasks yet.
            </div>
        `;
        return;
    }

    list.innerHTML = "";

    sorted.forEach((task, index) => {
        const done = isTaskDone(task.id);
        const row = document.createElement("div");
        row.className =
            "all-task-item animate-slide-in" +
            (done ? " task-done" : "");
        row.style.animationDelay = `${index * 30}ms`;

        const dueLabel = task.due_date
            ? `Due ${task.due_date}`
            : "No due date";

        const subject = getClassNameForTask(task);

        row.innerHTML = `
            <div class="all-task-main">
                <div class="all-task-title">
                    ${done ? `<span class="task-done-mark">DONE</span>` : ""}
                    ${escapeHtml(task.title)}
                </div>
                <div class="all-task-meta">
                    <span>${escapeHtml(subject)}</span>
                    <span class="meta-dot">·</span>
                    <span>${dueLabel}</span>
                </div>
                ${task.description
                    ? `<div class="all-task-desc">${escapeHtml(task.description)}</div>`
                    : ""
                }
            </div>
            <div class="all-task-side">
                ${!done && task.due_date
                    ? `<div class="class-task-countdown" data-due-date="${task.due_date}">…</div>`
                    : `<div class="class-task-countdown">—</div>`
                }
                ${done
                    ? `<button type="button" class="task-undo-button" data-task-id="${task.id}">UNDO</button>`
                    : `<button type="button" class="task-done-button" data-task-id="${task.id}">TASK DONE</button>`
                }
            </div>
        `;

        list.appendChild(row);
    });

    startTaskCountdowns();
}

function updateCountdown() {
    const status = document.getElementById("status");
    const event = document.getElementById("event");
    const countdown = document.getElementById("countdown");
    const countdownLabels = document.querySelector(".countdown-labels");
    const schedule = document.getElementById("schedule");
    const schedule12 = document.getElementById("schedule-12");
    const nextDay = document.getElementById("next-day");

    // ---------- TASKS MODE ----------
    if (viewMode === "tasks") {
        const soonest = findSoonestTask();
        const hero = document.getElementById("hero");

        if (hero) {
            hero.classList.remove("live", "after-today");
            hero.classList.toggle("tasks-mode", true);
            hero.classList.toggle("task-overdue", Boolean(soonest && soonest.overdue));
        }

        updateDayColors();
        highlightSchedule(null);

        if (!soonest) {
            status.textContent = "NO OPEN TASKS";
            event.textContent = "All caught up";
            countdown.textContent = "00:00:00";
            countdownLabels.hidden = false;
            nextDay.textContent = "Tasks";
            schedule.textContent = "—";
            schedule12.textContent = "No deadlines pending";

            updateFloatingClassContent(null);
            const title = document.getElementById("floating-note-title");
            const text = document.getElementById("floating-note-text");
            if (title) title.textContent = "TASKS";
            if (text) text.textContent = "No open task deadlines.";
            return;
        }

        status.textContent = soonest.overdue
            ? "DEADLINE PASSED:"
            : "TIME LEFT BEFORE DEADLINE:";
        event.textContent = soonest.task.title;
        countdownLabels.hidden = false;
        countdown.textContent = soonest.overdue
            ? "00:00:00"
            : formatCountdown(soonest.remaining);

        nextDay.textContent = getClassNameForTask(soonest.task);
        schedule.textContent = `Due ${soonest.task.due_date}`;
        schedule12.textContent = soonest.overdue
            ? "Overdue"
            : formatNaturalCountdown(soonest.remaining);

        const title = document.getElementById("floating-note-title");
        const text = document.getElementById("floating-note-text");
        const floating = document.getElementById("floating-class-status");
        if (title) title.textContent = soonest.overdue ? "OVERDUE TASK" : "NEXT TASK";
        if (text) {
            text.textContent = soonest.overdue
                ? `${soonest.task.title} is past due.`
                : `Due in ${formatNaturalCountdown(soonest.remaining)}.`;
        }
        if (floating) {
            floating.classList.toggle("live", !soonest.overdue);
            floating.classList.toggle("after-today", false);
        }

        return;
    }

    // ---------- SUBJECTS MODE ----------
    const result = findNextClass();

    updateFloatingClassContent(result);

    if (result === null) {
        updateHeroState(null);
        updateDayColors();

        status.textContent = "NO UPCOMING CLASSES";
        event.textContent = "No classes scheduled";
        countdown.textContent = "00:00:00";
        countdownLabels.hidden = false;
        schedule.textContent = "—";
        schedule12.textContent = "—";
        nextDay.textContent = "—";
        return;
    }

    updateHeroState(result);
    updateDayColors();

    // After the last class of today, the hero becomes a simple end-of-day
    // message. There is intentionally no countdown until the next class.
    if (result.state === "after-today") {
        status.textContent = "NO MORE CLASSES TODAY!";

        const relativeDay = getRelativeScheduleDay(result.classItem);
        event.textContent = relativeDay === "Tomorrow"
            ? "Come back Tomorrow"
            : `Come back on ${relativeDay}`;

        countdown.textContent = "";
        countdownLabels.hidden = true;

        // With no classes left today, show the next scheduled class and its
        // time instead of repeating the day name.
        nextDay.textContent = result.classItem.name.replace(" [ONLINE CLASS]", "");
        schedule.textContent = `${result.classItem.start} - ${result.classItem.end}`;
        schedule12.textContent = formatTimeRange12(result.classItem);
        highlightSchedule(null);
        return;
    }

    const now = new Date();
    const remaining = result.target - now;

    countdownLabels.hidden = false;
    event.textContent = result.classItem.name;
    countdown.textContent = formatCountdown(remaining);
    nextDay.textContent = getDayName(result.classItem.day);

    // Both formats coexist:
    // 24-hour first, 12-hour underneath.
    schedule.textContent =
        `${result.classItem.start} - ${result.classItem.end}`;

    schedule12.textContent =
        formatTimeRange12(result.classItem);

    if (result.state === "during") {
        status.textContent = "CLASS IN PROGRESS:";
    } else {
        status.textContent = "TIME LEFT BEFORE:";
    }

    highlightSchedule(result);
}

function updateDayColors() {
    const today = new Date().getDay();

    document.querySelectorAll(".day-group").forEach(group => {
        const day = Number(group.dataset.day);
        const color = day === today
            ? DAY_TODAY_COLOR
            : DAY_DEFAULT_COLOR;

        group.style.setProperty("--day-color", color);
    });
}

function setStatusBadges(container, badges) {
    if (!container) return;

    container.innerHTML = "";

    if (!badges || badges.length === 0) {
        container.hidden = true;
        return;
    }

    container.hidden = false;

    badges.forEach(({ text, type }) => {
        const badge = document.createElement("div");
        badge.className = `status-badge status-badge-${type}`;
        badge.textContent = text;
        container.appendChild(badge);
    });
}

function highlightSchedule(result) {
    const targetKey =
        result && result.state !== "after-today"
            ? getClassKey(result.classItem)
            : null;

    const previous = findPreviousClass();
    const previousKey = previous
        ? getClassKey(previous.classItem)
        : null;

    document.querySelectorAll(".schedule-item").forEach(item => {

        item.classList.remove(
            "next-class",
            "current-class",
            "previous-class",
            "shift-class"
        );

        const badgesEl =
            item.querySelector(".status-badges");

        const isSkipped =
            item.classList.contains("skipped-class");

        const shiftMode = item.dataset.shiftMode || "";
        const hasShift = Boolean(shiftMode);

        if (hasShift) {
            item.classList.add("shift-class");
        }

        // SKIPPED keeps red state; shift badge can still show
        if (isSkipped) {
            const badges = [
                { text: "SKIPPED", type: "skipped" }
            ];

            if (hasShift) {
                badges.push({
                    text: shiftMode.toUpperCase(),
                    type: "shift"
                });
            }

            setStatusBadges(badgesEl, badges);
            return;
        }

        const badges = [];
        const isTarget = item.dataset.key === targetKey;
        const isPrevious =
            previousKey !== null &&
            item.dataset.key === previousKey &&
            // Don't mark as previous if it is currently NOW
            !(isTarget && result && result.state === "during");

        if (isTarget && result) {
            if (result.state === "during") {
                item.classList.add("current-class");
                badges.push({ text: "NOW", type: "now" });
            } else if (result.state === "before") {
                item.classList.add("next-class");
                badges.push({ text: "NEXT", type: "next" });
            }
        } else if (isPrevious) {
            item.classList.add("previous-class");
            badges.push({ text: "PREVIOUS", type: "previous" });
        }

        if (hasShift) {
            badges.push({
                text: shiftMode.toUpperCase(),
                type: "shift"
            });
        }

        setStatusBadges(badgesEl, badges);
    });
}

function displaySchedule() {
    const scheduleList =
        document.getElementById("schedule-list");

    scheduleList.innerHTML = "";

    const grouped = {};

    for (const classItem of classes) {

        if (!grouped[classItem.day]) {
            grouped[classItem.day] = [];
        }

        grouped[classItem.day].push(classItem);
    }

    const orderedDays =
        Object.keys(grouped)
            .map(Number)
            .sort((a, b) => a - b);

    for (const day of orderedDays) {

        const dayGroup =
            document.createElement("div");

        dayGroup.className = "day-group";
        dayGroup.dataset.day = day;

        const dayInfo =
            document.createElement("div");

        dayInfo.className = "day-info";

        dayInfo.style.setProperty(
            "--day-color",
            day === new Date().getDay()
                ? DAY_TODAY_COLOR
                : DAY_DEFAULT_COLOR
        );

        const dayName =
            document.createElement("div");

        dayName.className = "day-name";
        dayName.textContent = getDayName(day);

        const dayCount =
            document.createElement("div");

        dayCount.className = "day-count";

        dayCount.textContent =
            `${grouped[day].length} class` +
            `${grouped[day].length !== 1 ? "es" : ""}`;

        dayInfo.appendChild(dayName);
        dayInfo.appendChild(dayCount);

        const dayClasses =
            document.createElement("div");

        dayClasses.className = "day-classes";

        for (const classItem of grouped[day]) {

            const item =
                document.createElement("div");

            item.className = "schedule-item";
            item.dataset.key =
                getClassKey(classItem);

            if (classItem.skipped) {
                item.classList.add("skipped-class");
            }

            const time =
                document.createElement("div");

            time.className = "schedule-time";

            const military =
                document.createElement("div");

            military.textContent =
                `${classItem.start} - ${classItem.end}`;

            const twelveHour =
                document.createElement("div");

            twelveHour.className =
                "schedule-time-12";

            twelveHour.textContent =
                formatTimeRange12(classItem);

            time.appendChild(military);
            time.appendChild(twelveHour);

            const dot =
                document.createElement("div");

            dot.className = "subject-dot";

            const name =
                document.createElement("div");

            name.className = "schedule-name";

            const baseName =
                classItem.name.replace(
                    " [ONLINE CLASS]",
                    ""
                );

            name.textContent = baseName;

            if (
                classItem.name.includes(
                    "[ONLINE CLASS]"
                )
            ) {
                const online =
                    document.createElement("span");

                online.className =
                    "online-label";

                online.textContent = "ONLINE";

                name.appendChild(online);
            }

            const badges =
                document.createElement("div");

            badges.className = "status-badges";
            badges.hidden = true;

            if (classItem.shiftMode) {
                item.dataset.shiftMode = classItem.shiftMode;
                item.classList.add("shift-class");
            }

            item.appendChild(time);
            item.appendChild(dot);
            item.appendChild(name);
            item.appendChild(badges);

            // Expandable tasks panel under each class
            const expandPanel = document.createElement("div");
            expandPanel.className = "class-tasks-panel";
            expandPanel.hidden = true;
            expandPanel.innerHTML = `
                <div class="class-tasks-heading">UPCOMING TASKS</div>
                <div class="class-tasks-list">
                    <div class="class-tasks-loading">Loading tasks...</div>
                </div>
            `;

            item.dataset.classId = classItem.id || "";
            item.classList.add("expandable");
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");
            item.setAttribute("aria-expanded", "false");

            const wrapper = document.createElement("div");
            wrapper.className = "schedule-item-wrapper";
            wrapper.appendChild(item);
            wrapper.appendChild(expandPanel);

            dayClasses.appendChild(wrapper);
        }

        dayGroup.appendChild(dayInfo);
        dayGroup.appendChild(dayClasses);

        scheduleList.appendChild(dayGroup);
    }
}

async function loadSchedule() {
    try {

        // GET TODAY'S DATE
        const now = new Date();

        const today =
            now.getFullYear() +
            "-" +
            String(now.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(now.getDate()).padStart(2, "0");


        // LOAD RECURRING CLASSES
        const {
            data: classesData,
            error: classesError
        } = await supabaseClient
            .from("classes")
            .select(
                "id, subject, day_of_week, start_time, end_time, online"
            )
            .eq("active", true)
            .order("day_of_week", {
                ascending: true
            })
            .order("start_time", {
                ascending: true
            });


        if (classesError) {
            throw classesError;
        }


        // LOAD TODAY'S OVERRIDES
        const {
            data: overridesData,
            error: overridesError
        } = await supabaseClient
            .from("overrides")
            .select(
                "override_type, class_id, reason"
            )
            .eq("override_date", today);


        if (overridesError) {
            throw overridesError;
        }


        // GET CANCELLED CLASS IDS
        const cancelledClassIds =
            new Set(
                (overridesData || [])
                    .filter(
                        override =>
                            override.override_type ===
                            "CANCEL_CLASS"
                    )
                    .map(
                        override =>
                            override.class_id
                    )
            );


        // SHIFT modes by class id (reason = modality label)
        const shiftByClassId = new Map(
            (overridesData || [])
                .filter(
                    override =>
                        override.override_type === "SHIFT"
                )
                .map(override => [
                    override.class_id,
                    override.reason || "Shifted"
                ])
        );


        // Classes dismissed early today
        const dismissedEarlyIds = new Set(
            (overridesData || [])
                .filter(
                    override =>
                        override.override_type ===
                        "DISMISS_EARLY"
                )
                .map(override => override.class_id)
        );


        // CHECK FOR A FULL NO-CLASSES DAY
        const noClassesToday =
            (overridesData || []).some(
                override =>
                    override.override_type ===
                    "NO_CLASSES"
            );


        // CONVERT TO CLASS CLOCK FORMAT
        classes =
            (classesData || []).map(classItem => {

                const isToday =
                    classItem.day_of_week === now.getDay();

                const skipped =
                    cancelledClassIds.has(
                        classItem.id
                    ) ||
                    (noClassesToday && isToday);

                return {
                    id: classItem.id,

                    name: classItem.subject,

                    day: classItem.day_of_week,

                    start:
                        classItem.start_time.slice(0, 5),

                    end:
                        classItem.end_time.slice(0, 5),

                    online:
                        classItem.online,

                    skipped,

                    shiftMode:
                        shiftByClassId.get(classItem.id) || null,

                    // Only meaningful for today's date-scoped overrides
                    dismissedEarly:
                        isToday &&
                        dismissedEarlyIds.has(classItem.id)
                };
            });


        // LOAD TASKS FOR NOTIFICATIONS + EXPANDED LISTS
        try {
            const {
                data: tasksData,
                error: tasksError
            } = await supabaseClient
                .from("tasks")
                .select("id, title, description, due_date, class_id");

            if (tasksError) throw tasksError;

            tasksCache = tasksData || [];
        } catch (taskLoadError) {
            console.error("Failed to load tasks:", taskLoadError);
            tasksCache = [];
        }


        // UPDATE THE INTERFACE
        displaySchedule();

        updateCurrentClock();

        updateCountdown();

        checkTaskNotifications();
        updateViewModeUI();


    } catch (error) {

        console.error(
            "Failed to load schedule from Supabase:",
            error
        );

        document.getElementById("status").textContent =
            "ERROR";

        document.getElementById("event").textContent =
            "Could not load schedule";

        document.getElementById("countdown").textContent =
            "00:00:00";
    }
}

loadSchedule();

updateFloatingClassStatus();

window.addEventListener(
    "scroll",
    updateFloatingClassStatus,
    { passive: true }
);

window.addEventListener(
    "resize",
    updateFloatingClassStatus
);

setInterval(() => {

    updateCurrentClock();

    updateCountdown();

}, 1000);

initializeNotifications();
updateViewModeUI();

document
    .getElementById("view-mode-toggle")
    ?.addEventListener("click", function() {
        viewMode = viewMode === "tasks" ? "subjects" : "tasks";
        localStorage.setItem("classClockViewMode", viewMode);
        updateViewModeUI();
        updateCountdown();
    });


// Task deadline countdown ticker (active while a panel is open)
let taskCountdownTimer = null;

function stopTaskCountdowns() {
    if (taskCountdownTimer !== null) {
        clearInterval(taskCountdownTimer);
        taskCountdownTimer = null;
    }
}

function getDeadlineEnd(dueDateString) {
    // Treat due_date as end of that local calendar day
    const [year, month, day] = dueDateString.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function formatTaskCountdown(milliseconds) {
    if (milliseconds <= 0) {
        return "OVERDUE";
    }

    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    if (days > 0) {
        return `${days}d ${hh}:${mm}:${ss}`;
    }

    return `${hh}:${mm}:${ss}`;
}

function updateTaskCountdowns() {
    const now = Date.now();

    document.querySelectorAll(".class-task-countdown[data-due-date]").forEach(el => {
        const due = el.dataset.dueDate;

        if (!due) {
            el.textContent = "—";
            el.classList.remove("overdue");
            return;
        }

        const remaining = getDeadlineEnd(due).getTime() - now;
        el.textContent = formatTaskCountdown(remaining);
        el.classList.toggle("overdue", remaining <= 0);
    });
}

function startTaskCountdowns() {
    stopTaskCountdowns();
    updateTaskCountdowns();
    taskCountdownTimer = setInterval(updateTaskCountdowns, 1000);
}


function renderClassTaskRows(listEl, tasks) {
    listEl.innerHTML = "";

    const sorted = sortTasksByDeadline(tasks);

    sorted.forEach(task => {
        const done = isTaskDone(task.id);
        const row = document.createElement("div");
        row.className = "class-task-row" + (done ? " task-done" : "");
        row.dataset.taskId = task.id;

        const dueLabel = task.due_date
            ? `Due ${task.due_date}`
            : "No due date";

        row.innerHTML = `
            <div class="class-task-header">
                <div class="class-task-title">
                    ${done ? `<span class="task-done-mark">DONE</span>` : ""}
                    ${escapeHtml(task.title)}
                </div>
                <div
                    class="class-task-countdown"
                    data-due-date="${done ? "" : (task.due_date || "")}">
                    ${done ? "—" : (task.due_date ? "…" : "—")}
                </div>
            </div>
            <div class="class-task-due">${dueLabel}</div>
            ${task.description
                ? `<div class="class-task-desc">${escapeHtml(task.description)}</div>`
                : ""
            }
            <div class="class-task-actions">
                ${done
                    ? `<button type="button" class="task-undo-button" data-task-id="${task.id}">UNDO</button>`
                    : `<button type="button" class="task-done-button" data-task-id="${task.id}">TASK DONE</button>`
                }
            </div>
        `;

        listEl.appendChild(row);
    });

    startTaskCountdowns();
}


// EXPAND / COLLAPSE CLASS TO SHOW UPCOMING TASKS
document.addEventListener("click", async function(event) {

    // Task done / undo handled separately — don't toggle expand
    if (
        event.target.closest(".task-done-button") ||
        event.target.closest(".task-undo-button")
    ) {
        return;
    }

    const item = event.target.closest(".schedule-item.expandable");

    if (!item) return;

    const wrapper = item.closest(".schedule-item-wrapper");

    if (!wrapper) return;

    const panel = wrapper.querySelector(".class-tasks-panel");

    if (!panel) return;

    const isOpen = !panel.hidden;

    // Close any other open panels
    document.querySelectorAll(".class-tasks-panel").forEach(p => {
        p.hidden = true;
    });

    document.querySelectorAll(".schedule-item.expandable").forEach(el => {
        el.classList.remove("expanded");
        el.setAttribute("aria-expanded", "false");
    });

    stopTaskCountdowns();

    if (isOpen) {
        return;
    }

    panel.hidden = false;
    item.classList.add("expanded");
    item.setAttribute("aria-expanded", "true");

    const classId = item.dataset.classId;
    const listEl = panel.querySelector(".class-tasks-list");

    if (!classId) {
        listEl.innerHTML = `
            <div class="class-tasks-empty">No class id available for tasks.</div>
        `;
        return;
    }

    listEl.innerHTML = `
        <div class="class-tasks-loading">Loading tasks...</div>
    `;

    try {

        // Prefer cache, fall back to fetch
        let data = tasksCache.filter(
            t => String(t.class_id) === String(classId)
        );

        if (!tasksCache.length) {
            const result = await supabaseClient
                .from("tasks")
                .select("id, title, description, due_date, class_id")
                .eq("class_id", classId);

            if (result.error) throw result.error;
            data = result.data || [];
        }

        if (!data || data.length === 0) {
            listEl.innerHTML = `
                <div class="class-tasks-empty">No upcoming tasks for this class.</div>
            `;
            return;
        }

        renderClassTaskRows(listEl, data);

    } catch (error) {
        console.error("Failed to load class tasks:", error);
        listEl.innerHTML = `
            <div class="class-tasks-empty">Could not load tasks.</div>
        `;
    }
});


// TASK DONE / UNDO
document.addEventListener("click", function(event) {

    const doneBtn = event.target.closest(".task-done-button");
    const undoBtn = event.target.closest(".task-undo-button");

    if (!doneBtn && !undoBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const taskId = (doneBtn || undoBtn).dataset.taskId;
    if (!taskId) return;

    if (doneBtn) {
        markTaskDone(taskId);
    } else {
        unmarkTaskDone(taskId);
    }

    // Refresh expanded class task list if open
    const listEl = event.target.closest(".class-tasks-list");
    if (listEl) {
        const classPanel = listEl.closest(".class-tasks-panel");
        const wrapper = classPanel && classPanel.closest(".schedule-item-wrapper");
        const scheduleItem = wrapper && wrapper.querySelector(".schedule-item");
        const classId = scheduleItem && scheduleItem.dataset.classId;

        if (classId) {
            const data = tasksCache.filter(
                t => String(t.class_id) === String(classId)
            );
            renderClassTaskRows(listEl, data);
        }
    }

    // Refresh All Tasks view + hero countdown
    if (viewMode === "tasks") {
        renderAllTasksList();
        updateCountdown();
    }
});


document.addEventListener("keydown", function(event) {
    if (event.key !== "Enter" && event.key !== " ") return;

    const item = event.target.closest(".schedule-item.expandable");

    if (!item) return;

    event.preventDefault();
    item.click();
});


function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}