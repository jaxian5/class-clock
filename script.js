let classes = [];

// ------------------------------------------------------------
// BROWSER NOTIFICATIONS
// ------------------------------------------------------------

const notificationState = {
    lastCheckedMinute: "",
    sent: new Set(),
    enabled: localStorage.getItem("classClockNotificationsEnabled") === "true"
};

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

function initializeNotifications() {
    const button = document.getElementById("notification-toggle");
    if (!button) return;

    button.addEventListener("click", toggleNotifications);
    setNotificationUI();

    // Check immediately, then regularly. This continues while the page is open
    // or kept alive in the browser's background tabs.
    checkClassNotifications();
    setInterval(checkClassNotifications, 15000);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            checkClassNotifications();
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

    return { start, end };
}

function findNextClass() {
    const now = new Date();

    let current = null;
    let next = null;

    for (const classItem of classes) {
        let daysUntil = (classItem.day - now.getDay() + 7) % 7;
        let classDate = new Date(now);

        classDate.setDate(now.getDate() + daysUntil);

        let times = getClassTimes(classItem, classDate);

        if (times.start <= now && now < times.end) {
            current = {
                classItem,
                start: times.start,
                end: times.end
            };
            break;
        }

        if (times.start <= now) {
            classDate.setDate(classDate.getDate() + 7);
            times = getClassTimes(classItem, classDate);
        }

        if (next === null || times.start < next.start) {
            next = {
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

    if (next !== null) {
        return {
            state: "before",
            classItem: next.classItem,
            start: next.start,
            end: next.end,
            target: next.start
        };
    }

    return null;
}

function getClassKey(classItem) {
    return `${classItem.day}-${classItem.start}-${classItem.end}-${classItem.name}`;
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
}

function updateCountdown() {
    const status = document.getElementById("status");
    const event = document.getElementById("event");
    const countdown = document.getElementById("countdown");
    const schedule = document.getElementById("schedule");
    const schedule12 = document.getElementById("schedule-12");
    const nextDay = document.getElementById("next-day");
    const result = findNextClass();

    updateFloatingClassContent(result);

    if (result === null) {
        updateHeroState(null);
        updateDayColors();

        status.textContent = "NO UPCOMING CLASSES";
        event.textContent = "No classes scheduled";
        countdown.textContent = "00:00:00";
        schedule.textContent = "—";
        schedule12.textContent = "—";
        nextDay.textContent = "—";
        return;
    }

    const now = new Date();
    const remaining = result.target - now;

    updateHeroState(result);
    updateDayColors();

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
        // The persistent status card is handled by updateFloatingClassContent().
    } else {
        status.textContent = "TIME LEFT BEFORE:";
        // The persistent status card is handled by updateFloatingClassContent().
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

function highlightSchedule(result) {
    const targetKey = getClassKey(result.classItem);

    document.querySelectorAll(".schedule-item").forEach(item => {
        item.classList.remove("next-class", "current-class");

        const badge = item.querySelector(".status-badge");

        if (item.dataset.key === targetKey) {
            if (result.state === "during") {
                item.classList.add("current-class");
                badge.textContent = "NOW";
                badge.hidden = false;
            } else {
                item.classList.add("next-class");
                badge.textContent = "NEXT";
                badge.hidden = false;
            }
        } else {
            if (badge) {
                badge.textContent = "";
                badge.hidden = true;
            }
        }
    });
}

function displaySchedule() {
    const scheduleList = document.getElementById("schedule-list");
    scheduleList.innerHTML = "";

    const grouped = {};

    for (const classItem of classes) {
        if (!grouped[classItem.day]) {
            grouped[classItem.day] = [];
        }

        grouped[classItem.day].push(classItem);
    }

    const orderedDays = Object.keys(grouped)
        .map(Number)
        .sort((a, b) => a - b);

    for (const day of orderedDays) {
        const dayGroup = document.createElement("div");
        dayGroup.className = "day-group";
        dayGroup.dataset.day = day;

        const dayInfo = document.createElement("div");
        dayInfo.className = "day-info";
        dayInfo.style.setProperty(
            "--day-color",
            day === new Date().getDay()
                ? DAY_TODAY_COLOR
                : DAY_DEFAULT_COLOR
        );

        const dayName = document.createElement("div");
        dayName.className = "day-name";
        dayName.textContent = getDayName(day);

        const dayCount = document.createElement("div");
        dayCount.className = "day-count";
        dayCount.textContent =
            `${grouped[day].length} class${grouped[day].length !== 1 ? "es" : ""}`;

        dayInfo.appendChild(dayName);
        dayInfo.appendChild(dayCount);

        const dayClasses = document.createElement("div");
        dayClasses.className = "day-classes";

        for (const classItem of grouped[day]) {
            const item = document.createElement("div");
            item.className = "schedule-item";
            item.dataset.key = getClassKey(classItem);

            item.style.setProperty("--subject-color", CLASS_DEFAULT_COLOR);

            const time = document.createElement("div");
            time.className = "schedule-time";

            const military = document.createElement("div");
            military.textContent =
                `${classItem.start} - ${classItem.end}`;

            const twelveHour = document.createElement("div");
            twelveHour.className = "schedule-time-12";
            twelveHour.textContent =
                formatTimeRange12(classItem);

            time.appendChild(military);
            time.appendChild(twelveHour);

            const dot = document.createElement("div");
            dot.className = "subject-dot";

            const name = document.createElement("div");
            name.className = "schedule-name";

            const baseName = classItem.name.replace(
                " [ONLINE CLASS]",
                ""
            );

            name.textContent = baseName;

            if (classItem.name.includes("[ONLINE CLASS]")) {
                const online = document.createElement("span");
                online.className = "online-label";
                online.textContent = "ONLINE";
                name.appendChild(online);
            }

            const badge = document.createElement("div");
            badge.className = "status-badge";
            badge.hidden = true;

            item.appendChild(time);
            item.appendChild(dot);
            item.appendChild(name);
            item.appendChild(badge);

            dayClasses.appendChild(item);
        }

        dayGroup.appendChild(dayInfo);
        dayGroup.appendChild(dayClasses);
        scheduleList.appendChild(dayGroup);
    }
}

async function loadSchedule() {
    try {
        const response = await fetch("schedule.json");

        if (!response.ok) {
            throw new Error(
                `Could not load schedule.json (${response.status})`
            );
        }

        classes = await response.json();

        displaySchedule();
        updateCurrentClock();
        updateCountdown();

    } catch (error) {
        console.error("Failed to load schedule:", error);

        document.getElementById("status").textContent = "ERROR";
        document.getElementById("event").textContent =
            "Could not load schedule";
        document.getElementById("countdown").textContent = "00:00:00";
    }
}

loadSchedule();

updateFloatingClassStatus();

window.addEventListener("scroll", updateFloatingClassStatus, { passive: true });
window.addEventListener("resize", updateFloatingClassStatus);

setInterval(() => {
    updateCurrentClock();
    updateCountdown();
}, 1000);

initializeNotifications();
