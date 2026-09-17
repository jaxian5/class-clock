const SUPABASE_URL = "https://saxpyxzbiruwytllmoia.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_u6miLXnbZUhjtfH2YE7eGQ_CW0fDLQ9";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);


// DAY NAMES
const dayNames = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY"
];


// GET TODAY
function getToday() {

    const now = new Date();

    return {
        day: now.getDay(),
        date: now
    };
}


// GET TODAY'S DATE AS YYYY-MM-DD
function getTodayDateString() {

    const now = new Date();

    const year = now.getFullYear();

    const month =
        String(now.getMonth() + 1).padStart(2, "0");

    const day =
        String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// FORMAT TIME
function formatTime(time) {

    const [hour, minute] = time.split(":");

    const date = new Date();

    date.setHours(Number(hour));
    date.setMinutes(Number(minute));

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}


// DISPLAY TODAY'S DATE
function displayTodayDate() {

    const { date } = getToday();

    const formatted =
        date.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });

    document.getElementById("today-date").textContent =
        formatted;
}


function isClassFinishedNow(classItem, dismissedEarlyIds, now) {
    const start = (classItem.start_time || "").slice(0, 5);
    const end = (classItem.end_time || "").slice(0, 5);

    if (dismissedEarlyIds.has(classItem.id)) {
        return true;
    }

    const endDate = new Date(now);
    endDate.setHours(
        Number(end.split(":")[0]),
        Number(end.split(":")[1]),
        0,
        0
    );

    return endDate <= now;
}


// LOAD SCHEDULE FOR ADMIN
// - While today still has unfinished classes → show today
// - Once all of today's classes are finished → preview next day that has classes
// - On a new calendar day, only that day's classes remain (yesterday drops off)
async function loadTodaySchedule() {

    const { day } = getToday();

    const today =
        getTodayDateString();

    const scheduleList =
        document.getElementById("schedule-list");

    const noClassesButton =
        document.getElementById("no-classes-button");

    const todayDateHeading =
        document.getElementById("today-date");

    try {

        // LOAD ALL ACTIVE CLASSES (all days)
        const {
            data: allClassesData,
            error: classesError
        } = await supabaseClient
            .from("classes")
            .select(
                "id, subject, day_of_week, start_time, end_time, online"
            )
            .eq("active", true)
            .order("day_of_week", { ascending: true })
            .order("start_time", { ascending: true });


        if (classesError) {
            throw classesError;
        }


        // LOAD ALL OF TODAY'S OVERRIDES
        const {
            data: overridesData,
            error: overridesError
        } = await supabaseClient
            .from("overrides")
            .select("class_id, override_type, reason")
            .eq("override_date", today);


        if (overridesError) {
            throw overridesError;
        }


        const noClassesToday =
            (overridesData || []).some(
                override =>
                    override.override_type === "NO_CLASSES"
            );


        // Cancelled class IDs
        const cancelledClassIds =
            new Set(
                (overridesData || [])
                    .filter(
                        override =>
                            override.override_type === "CANCEL_CLASS"
                    )
                    .map(override => override.class_id)
            );


        // Shift mode by class id
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
                        override.override_type === "DISMISS_EARLY"
                )
                .map(override => override.class_id)
        );


        const now = new Date();
        const allClasses = allClassesData || [];

        const todaysClasses = allClasses.filter(
            c => c.day_of_week === day
        );


        // Are all of today's classes finished?
        const allTodayFinished =
            todaysClasses.length === 0 ||
            noClassesToday ||
            todaysClasses.every(c =>
                isClassFinishedNow(c, dismissedEarlyIds, now)
            );


        // Decide which day to display
        let displayDay = day;
        let viewingPreview = false;

        if (allTodayFinished) {
            // Find next day (tomorrow → … → wrap) that has classes
            for (let offset = 1; offset <= 7; offset++) {
                const candidate = (day + offset) % 7;
                const hasClasses = allClasses.some(
                    c => c.day_of_week === candidate
                );
                if (hasClasses) {
                    displayDay = candidate;
                    viewingPreview = offset > 0;
                    break;
                }
            }
        }


        const classesData = allClasses.filter(
            c => c.day_of_week === displayDay
        );


        // Update heading / date label
        if (todayDateHeading) {
            if (viewingPreview) {
                const label = dayNames[displayDay] || "UPCOMING";
                todayDateHeading.textContent =
                    `Preview · ${label}`;
            } else {
                // Keep the formatted calendar date from displayTodayDate
                // unless we need to restore it after a preview state
                if (
                    todayDateHeading.textContent.startsWith("Preview")
                ) {
                    displayTodayDate();
                }
            }
        }


        // NO CLASSES button: blocked when day is fully finished
        // or already marked no classes
        if (noClassesButton) {
            if (noClassesToday) {
                noClassesButton.disabled = true;
                noClassesButton.textContent = "NO CLASSES (ACTIVE)";
            } else if (allTodayFinished && todaysClasses.length > 0) {
                noClassesButton.disabled = true;
                noClassesButton.textContent = "DAY FINISHED";
            } else {
                noClassesButton.disabled = false;
                noClassesButton.textContent = "NO CLASSES TODAY";
            }
        }


        if (noClassesToday && !viewingPreview) {
            scheduleList.innerHTML = `
                <div class="empty-state animate-fade-in">
                    Entire day marked as NO CLASSES.
                </div>
            `;
            return;
        }


        if (!classesData || classesData.length === 0) {
            scheduleList.innerHTML = `
                <div class="empty-state animate-fade-in">
                    No classes scheduled.
                </div>
            `;
            return;
        }


        scheduleList.innerHTML = "";

        if (viewingPreview) {
            const banner = document.createElement("div");
            banner.className = "preview-banner animate-fade-in";
            banner.textContent =
                `All classes for today are finished. Showing ${dayNames[displayDay]} schedule (preview).`;
            scheduleList.appendChild(banner);
        }


        classesData.forEach((classItem, index) => {

            const start =
                classItem.start_time.slice(0, 5);

            const end =
                classItem.end_time.slice(0, 5);


            // Overrides (skip / shift / dismiss) only apply when viewing TODAY
            const isSkipped =
                !viewingPreview &&
                cancelledClassIds.has(classItem.id);

            const shiftLabel =
                !viewingPreview
                    ? (shiftByClassId.get(classItem.id) || null)
                    : null;

            const isDismissedEarly =
                !viewingPreview &&
                dismissedEarlyIds.has(classItem.id);


            const startDate = new Date(now);
            startDate.setHours(
                Number(start.split(":")[0]),
                Number(start.split(":")[1]),
                0,
                0
            );

            const endDate = new Date(now);
            endDate.setHours(
                Number(end.split(":")[0]),
                Number(end.split(":")[1]),
                0,
                0
            );

            // For preview days, nothing is "finished" or "in progress" yet
            const isFinished =
                !viewingPreview &&
                (isDismissedEarly || endDate <= now);

            const isInProgress =
                !viewingPreview &&
                !isDismissedEarly &&
                startDate <= now &&
                now < endDate;


            const item =
                document.createElement("div");

            item.className = "schedule-item animate-slide-in";
            item.style.animationDelay = `${index * 40}ms`;


            let actionsHtml = "";

            if (viewingPreview) {
                actionsHtml = `
                    <button class="finished-button" type="button" disabled>
                        UPCOMING
                    </button>
                `;
            } else if (isFinished) {
                actionsHtml = `
                    <button class="finished-button" type="button" disabled>
                        CLASS FINISHED
                    </button>
                `;
            } else if (isInProgress) {
                actionsHtml = `
                    <button
                        class="dismiss-early-button"
                        data-class-id="${classItem.id}">
                        DISMISSED EARLY
                    </button>
                `;
            } else if (isSkipped) {
                actionsHtml = `
                    <button
                        class="unskip-button"
                        data-class-id="${classItem.id}">
                        UNSKIP
                    </button>
                `;
            } else {
                const shiftLocked = Boolean(shiftLabel);

                actionsHtml = `
                    <button
                        class="skip-button"
                        data-class-id="${classItem.id}">
                        SKIP
                    </button>
                    <button
                        class="shift-button${shiftLocked ? " shifted" : ""}"
                        data-class-id="${classItem.id}"
                        ${shiftLocked ? "disabled" : ""}>
                        ${shiftLocked ? "SHIFT ✓" : "SHIFT"}
                    </button>
                `;
            }


            item.innerHTML = `
                <div class="class-info">

                    <div class="class-time">
                        ${start} - ${end}
                    </div>

                    <div class="class-name">
                        ${classItem.subject}
                    </div>

                    <div class="class-secondary-time">
                        ${formatTime(start)} -
                        ${formatTime(end)}
                    </div>

                    ${shiftLabel
                        ? `<div class="class-shift-label">SHIFT: ${escapeHtml(shiftLabel)}</div>`
                        : ""
                    }
                    ${isDismissedEarly
                        ? `<div class="class-shift-label" style="color:#8a97a6;">DISMISSED EARLY</div>`
                        : ""
                    }

                </div>

                <div class="schedule-item-actions">
                    ${actionsHtml}
                </div>
            `;


            if (isSkipped) {
                item.classList.add("class-skipped");
            }

            if (isFinished) {
                item.classList.add("class-finished");
            }


            scheduleList.appendChild(item);

        });

    } catch (error) {

        console.error(
            "Failed to load today's schedule:",
            error
        );

        scheduleList.innerHTML = `
            <div class="empty-state">
                Could not load today's schedule.
            </div>
        `;
    }
}

// SKIP A CLASS TODAY
async function skipClass(classId) {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (!session) {

        alert("You are not logged in.");

        return;
    }


    // Check whether this class is already skipped today
    const today =
        getTodayDateString();


    const {
        data: existingOverride,
        error: checkError
    } = await supabaseClient
        .from("overrides")
        .select("id")
        .eq("override_date", today)
        .eq("override_type", "CANCEL_CLASS")
        .eq("class_id", classId)
        .maybeSingle();


    if (checkError) {

        console.error(
            "Failed to check existing override:",
            checkError
        );

        alert(
            "Could not check whether this class was already skipped.\n\n" +
            checkError.message
        );

        return;
    }


    // Already skipped
    if (existingOverride) {

        alert(
            "This class has already been skipped for today."
        );

        await loadTodaySchedule();

        return;
    }


    const reason =
        prompt("Reason for skipping this class?");


    // User pressed Cancel
    if (reason === null) {
        return;
    }


    const button =
        document.querySelector(
            `.skip-button[data-class-id="${classId}"]`
        );


    if (button) {

        button.disabled = true;

        button.textContent =
            "SKIPPING...";

    }


    const {
        error
    } = await supabaseClient
        .from("overrides")
        .insert({

            override_date: today,

            override_type: "CANCEL_CLASS",

            class_id: classId,

            reason: reason,

            created_by: session.user.id

        });


    if (error) {

        console.error(
            "Failed to skip class:",
            error
        );


        // Duplicate protection from database
        if (error.code === "23505") {

            alert(
                "This class has already been skipped for today."
            );

        } else {

            alert(
                "Could not skip this class.\n\n" +
                error.message
            );

        }


        if (button) {

            button.disabled = false;

            button.textContent =
                "SKIP";

        }


        await loadTodaySchedule();

        return;
    }


    await loadTodaySchedule();
}


// UNSKIP A CLASS TODAY
async function unskipClass(classId) {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (!session) {
        alert("You are not logged in.");
        return;
    }


    const today = getTodayDateString();


    const confirmed = confirm(
        "Remove the skip for this class today?\n\n" +
        "The class will appear on the public schedule again."
    );

    if (!confirmed) {
        return;
    }


    const button =
        document.querySelector(
            `.unskip-button[data-class-id="${classId}"]`
        );


    if (button) {
        button.disabled = true;
        button.textContent = "UNSKIPPING...";
    }


    const {
        error
    } = await supabaseClient
        .from("overrides")
        .delete()
        .eq("override_date", today)
        .eq("override_type", "CANCEL_CLASS")
        .eq("class_id", classId);


    if (error) {
        console.error("Failed to unskip class:", error);

        alert(
            "Could not unskip this class.\n\n" +
            error.message
        );

        if (button) {
            button.disabled = false;
            button.textContent = "UNSKIP";
        }

        await loadTodaySchedule();
        return;
    }


    await loadTodaySchedule();
}


// MARK ENTIRE DAY AS NO CLASSES
async function markNoClassesToday() {

    const button = document.getElementById("no-classes-button");

    if (button && button.disabled) {
        alert(
            "No Classes Today cannot be used right now.\n" +
            "Either the day is already marked, or all classes are finished."
        );
        return;
    }

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    if (!session) {
        alert("You are not logged in.");
        return;
    }


    const today = getTodayDateString();


    // Check whether a NO_CLASSES override already exists for today
    const {
        data: existingOverride,
        error: checkError
    } = await supabaseClient
        .from("overrides")
        .select("id")
        .eq("override_date", today)
        .eq("override_type", "NO_CLASSES")
        .maybeSingle();


    if (checkError) {
        console.error(
            "Failed to check existing NO_CLASSES override:",
            checkError
        );
        alert(
            "Could not check whether the day was already marked.\n\n" +
            checkError.message
        );
        return;
    }


    if (existingOverride) {
        alert("Today is already marked as having no classes.");
        await loadTodaySchedule();
        return;
    }


    const confirmed = confirm(
        "Mark the entire day as having NO CLASSES?\n\n" +
        "This will cancel every class scheduled for today."
    );

    if (!confirmed) {
        return;
    }


    const reason = prompt(
        "Reason for cancelling all classes today?",
        "No classes today"
    );

    if (reason === null) {
        return;
    }


    if (button) {
        button.disabled = true;
        button.textContent = "UPDATING...";
    }


    const {
        error
    } = await supabaseClient
        .from("overrides")
        .insert({
            override_date: today,
            override_type: "NO_CLASSES",
            class_id: null,
            reason: reason || "No classes today",
            created_by: session.user.id
        });


    if (error) {
        console.error("Failed to mark no classes:", error);

        if (error.code === "23505") {
            alert("Today is already marked as having no classes.");
        } else {
            alert(
                "Could not mark the day as no classes.\n\n" +
                error.message
            );
        }

        if (button) {
            button.disabled = false;
            button.textContent = "NO CLASSES TODAY";
        }

        await loadTodaySchedule();
        return;
    }


    if (button) {
        button.disabled = false;
        button.textContent = "NO CLASSES TODAY";
    }

    await loadTodaySchedule();
}


// CHECK AUTHENTICATION
async function checkAuth() {

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();


    // NOT LOGGED IN
    if (!session) {

        document.getElementById(
            "login-screen"
        ).style.display = "block";


        document.getElementById(
            "admin-panel"
        ).style.display = "none";


        const signOutButton =
            document.getElementById("sign-out-button");

        if (signOutButton) {
            signOutButton.style.display = "none";
        }


        return;
    }


    // CHECK IF LOGGED-IN USER IS AN ADMIN
    const {
        data: admin,
        error
    } = await supabaseClient
        .from("admins")
        .select(
            "user_id, display_name, role"
        )
        .eq(
            "user_id",
            session.user.id
        )
        .maybeSingle();


    if (error) {

        console.error(
            "Failed to check admin status:",
            error
        );


        document.getElementById(
            "login-error"
        ).textContent =
            "Could not verify administrator access.";


        return;
    }


    // LOGGED IN, BUT NOT AN ADMIN
    if (!admin || admin.role !== "admin") {

        await supabaseClient.auth.signOut();


        document.getElementById(
            "login-error"
        ).textContent =
            "This account is not authorized as an administrator.";


        const signOutButton =
            document.getElementById("sign-out-button");

        if (signOutButton) {
            signOutButton.style.display = "none";
        }


        return;
    }


    // ADMIN VERIFIED
    document.getElementById(
        "login-screen"
    ).style.display = "none";


    document.getElementById(
        "admin-panel"
    ).style.display = "block";


    const signOutButton =
        document.getElementById("sign-out-button");

    if (signOutButton) {
        signOutButton.style.display = "inline-flex";
    }


    displayTodayDate();

    loadTodaySchedule();
    loadClassOptions();
    loadTasks();
}


// START ADMIN PAGE
checkAuth();


// LOGIN
document
    .getElementById("login-form")
    .addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const email =
                document.getElementById(
                    "email"
                ).value.trim();


            const password =
                document.getElementById(
                    "password"
                ).value;


            const loginButton =
                document.getElementById(
                    "login-button"
                );


            const loginError =
                document.getElementById(
                    "login-error"
                );


            loginError.textContent = "";


            if (!email || !password) {
                loginError.textContent =
                    "Please fill all fields and try again";
                return;
            }


            loginButton.disabled = true;

            loginButton.textContent =
                "LOGGING IN...";


            const {
                error
            } = await supabaseClient
                .auth
                .signInWithPassword({

                    email: email,

                    password: password

                });


            if (error) {

                console.error(
                    "Login failed:",
                    error
                );


                loginError.textContent =
                    "Incorrect username or password";


                loginButton.disabled = false;

                loginButton.textContent =
                    "LOGIN";


                return;
            }


            loginButton.textContent =
                "LOGIN";


            await checkAuth();

        }
    );


// SKIP / UNSKIP BUTTON CLICK HANDLER
document.addEventListener(
    "click",
    function(event) {

        if (
            event.target.classList.contains(
                "skip-button"
            )
        ) {

            const classId =
                event.target.dataset.classId;


            skipClass(classId);

        }


        if (
            event.target.classList.contains(
                "unskip-button"
            )
        ) {

            const classId =
                event.target.dataset.classId;


            unskipClass(classId);

        }

    }
);


// NO CLASSES TODAY BUTTON
document
    .getElementById("no-classes-button")
    .addEventListener("click", markNoClassesToday);


// SIGN OUT
document
    .getElementById("sign-out-button")
    .addEventListener("click", async function() {

        await supabaseClient.auth.signOut();

        document.getElementById(
            "login-screen"
        ).style.display = "block";

        document.getElementById(
            "admin-panel"
        ).style.display = "none";

        const signOutButton =
            document.getElementById("sign-out-button");

        if (signOutButton) {
            signOutButton.style.display = "none";
        }

        document.getElementById(
            "login-error"
        ).textContent = "";

        document.getElementById("login-form").reset();

    });


// DIRECTORY: SCHEDULE / TASKS
document.querySelectorAll(".directory-button").forEach(button => {
    button.addEventListener("click", function() {
        const view = this.dataset.view;

        document.querySelectorAll(".directory-button").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.view === view);
        });

        document.getElementById("schedule-view").style.display =
            view === "schedule" ? "block" : "none";

        document.getElementById("tasks-view").style.display =
            view === "tasks" ? "block" : "none";

        if (view === "tasks") {
            loadClassOptions();
            loadTasks();
        }
    });
});


// LOAD CLASSES INTO TASK FORM DROPDOWN
async function loadClassOptions() {

    const select = document.getElementById("task-class");

    if (!select) return;

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("classes")
            .select("id, subject, day_of_week, start_time")
            .eq("active", true)
            .order("day_of_week", { ascending: true })
            .order("start_time", { ascending: true });

        if (error) throw error;

        const dayNames = [
            "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
        ];

        const current = select.value;

        select.innerHTML =
            `<option value="">Select a class...</option>`;

        (data || []).forEach(classItem => {
            const start = (classItem.start_time || "").slice(0, 5);
            const label =
                `${dayNames[classItem.day_of_week]} ${start} — ${classItem.subject}`;

            const option = document.createElement("option");
            option.value = classItem.id;
            option.textContent = label;
            select.appendChild(option);
        });

        if (current) {
            select.value = current;
        }

    } catch (error) {
        console.error("Failed to load class options:", error);
    }
}


// LOAD ALL TASKS
async function loadTasks() {

    const tasksList = document.getElementById("tasks-list");

    if (!tasksList) return;

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("tasks")
            .select(
                "id, title, description, due_date, class_id, classes(subject, day_of_week, start_time)"
            )
            .order("due_date", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            tasksList.innerHTML = `
                <div class="empty-state">
                    No tasks yet. Add one above.
                </div>
            `;
            return;
        }

        const dayNames = [
            "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
        ];

        tasksList.innerHTML = "";

        data.forEach(task => {
            const classInfo = task.classes;
            const classLabel = classInfo
                ? `${dayNames[classInfo.day_of_week]} ${(classInfo.start_time || "").slice(0, 5)} — ${classInfo.subject}`
                : "Unlinked class";

            const dueLabel = task.due_date
                ? `Due ${task.due_date}`
                : "No due date";

            const item = document.createElement("div");
            item.className = "task-item";

            item.innerHTML = `
                <div class="task-item-info">
                    <div class="task-item-title">${escapeHtml(task.title)}</div>
                    <div class="task-item-meta">${escapeHtml(classLabel)} · ${dueLabel}</div>
                    ${task.description
                        ? `<div class="task-item-description">${escapeHtml(task.description)}</div>`
                        : ""
                    }
                </div>
                <div class="task-item-actions">
                    <button
                        class="task-modify-button"
                        data-task-id="${task.id}"
                        data-due-date="${task.due_date || ""}">
                        MODIFY
                    </button>
                    <button
                        class="task-delete-button"
                        data-task-id="${task.id}">
                        DELETE
                    </button>
                </div>
            `;

            tasksList.appendChild(item);
        });

    } catch (error) {
        console.error("Failed to load tasks:", error);

        tasksList.innerHTML = `
            <div class="empty-state">
                Could not load tasks. Make sure the <code>tasks</code> table exists in Supabase.
            </div>
        `;
    }
}


function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}


// CREATE TASK
document
    .getElementById("task-form")
    .addEventListener("submit", async function(event) {

        event.preventDefault();

        const {
            data: {
                session
            }
        } = await supabaseClient.auth.getSession();

        if (!session) {
            alert("You are not logged in.");
            return;
        }

        const classId = document.getElementById("task-class").value;
        const title = document.getElementById("task-title").value.trim();
        const description = document.getElementById("task-description").value.trim();
        const dueDate = document.getElementById("task-due").value || null;
        const errorEl = document.getElementById("task-form-error");
        const submitBtn = document.getElementById("task-submit");

        errorEl.textContent = "";

        if (!classId || !title) {
            errorEl.textContent = "Class and title are required.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "ADDING...";

        const {
            error
        } = await supabaseClient
            .from("tasks")
            .insert({
                class_id: classId,
                title: title,
                description: description || null,
                due_date: dueDate,
                created_by: session.user.id
            });

        submitBtn.disabled = false;
        submitBtn.textContent = "ADD TASK";

        if (error) {
            console.error("Failed to add task:", error);
            errorEl.textContent =
                "Could not add task. " + error.message;
            return;
        }

        document.getElementById("task-form").reset();
        alert("Task successfully created!");
        await loadTasks();
    });


// DELETE TASK
document.addEventListener("click", async function(event) {

    if (!event.target.classList.contains("task-delete-button")) {
        return;
    }

    const taskId = event.target.dataset.taskId;

    if (!taskId) return;

    const confirmed = confirm("Delete this task?");

    if (!confirmed) return;

    event.target.disabled = true;
    event.target.textContent = "DELETING...";

    const {
        error
    } = await supabaseClient
        .from("tasks")
        .delete()
        .eq("id", taskId);

    if (error) {
        console.error("Failed to delete task:", error);
        alert("Could not delete task.\n\n" + error.message);
        event.target.disabled = false;
        event.target.textContent = "DELETE";
        return;
    }

    await loadTasks();
});


// ---------- MODALS ----------

let pendingModifyTaskId = null;
let pendingShiftClassId = null;

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.hidden = false;
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.hidden = true;
    }
}

document.addEventListener("click", function(event) {
    const closeId = event.target.dataset.closeModal;
    if (closeId) {
        closeModal(closeId);
    }
});


// MODIFY TASK DEADLINE (calendar picker)
document.addEventListener("click", function(event) {

    if (!event.target.classList.contains("task-modify-button")) {
        return;
    }

    const taskId = event.target.dataset.taskId;
    const currentDue = event.target.dataset.dueDate || "";

    if (!taskId) return;

    pendingModifyTaskId = taskId;

    const input = document.getElementById("modify-deadline-input");
    if (input) {
        input.value = currentDue;
    }

    openModal("modify-deadline-modal");
});


document
    .getElementById("modify-deadline-clear")
    .addEventListener("click", function() {
        const input = document.getElementById("modify-deadline-input");
        if (input) input.value = "";
    });


document
    .getElementById("modify-deadline-save")
    .addEventListener("click", async function() {

        if (!pendingModifyTaskId) return;

        const input = document.getElementById("modify-deadline-input");
        const value = (input && input.value) ? input.value.trim() : "";
        const saveBtn = document.getElementById("modify-deadline-save");

        saveBtn.disabled = true;
        saveBtn.textContent = "SAVING...";

        const {
            error
        } = await supabaseClient
            .from("tasks")
            .update({
                due_date: value === "" ? null : value
            })
            .eq("id", pendingModifyTaskId);

        saveBtn.disabled = false;
        saveBtn.textContent = "SAVE";

        if (error) {
            console.error("Failed to modify task deadline:", error);
            alert(
                "Could not update the deadline.\n\n" +
                error.message +
                "\n\nIf this is a permission error, add an UPDATE policy for admins on the tasks table."
            );
            return;
        }

        pendingModifyTaskId = null;
        closeModal("modify-deadline-modal");
        await loadTasks();
    });


// SHIFT CLASS MODE
document.addEventListener("click", function(event) {

    if (!event.target.classList.contains("shift-button")) {
        return;
    }

    const classId = event.target.dataset.classId;

    if (!classId) return;

    pendingShiftClassId = classId;

    // Reset options
    const syncRadio = document.querySelector(
        'input[name="shift-mode"][value="Synchronous"]'
    );
    if (syncRadio) syncRadio.checked = true;

    const othersField = document.getElementById("shift-others-field");
    const othersInput = document.getElementById("shift-others-input");
    if (othersField) othersField.hidden = true;
    if (othersInput) othersInput.value = "";

    openModal("shift-modal");
});


document.querySelectorAll('input[name="shift-mode"]').forEach(radio => {
    radio.addEventListener("change", function() {
        const othersField = document.getElementById("shift-others-field");
        if (!othersField) return;
        othersField.hidden = this.value !== "Others";
    });
});


document
    .getElementById("shift-save")
    .addEventListener("click", async function() {

        if (!pendingShiftClassId) return;

        const {
            data: {
                session
            }
        } = await supabaseClient.auth.getSession();

        if (!session) {
            alert("You are not logged in.");
            return;
        }

        const selected = document.querySelector(
            'input[name="shift-mode"]:checked'
        );

        if (!selected) {
            alert("Please choose a shift mode.");
            return;
        }

        let modeLabel = selected.value;

        if (modeLabel === "Others") {
            const specified = (
                document.getElementById("shift-others-input").value || ""
            ).trim();

            if (!specified) {
                alert("Please specify the other shift mode.");
                return;
            }

            modeLabel = specified;
        }

        const confirmed = confirm(
            "Confirm shift for this class?\n\n" +
            "Once confirmed, this shift cannot be reverted until the day is finished.\n\n" +
            "Mode: " + modeLabel
        );

        if (!confirmed) {
            return;
        }

        const saveBtn = document.getElementById("shift-save");
        saveBtn.disabled = true;
        saveBtn.textContent = "SAVING...";

        const today = getTodayDateString();

        // Do not allow changing an existing shift (locked until day ends)
        const {
            data: existingShift
        } = await supabaseClient
            .from("overrides")
            .select("id")
            .eq("override_date", today)
            .eq("override_type", "SHIFT")
            .eq("class_id", pendingShiftClassId)
            .maybeSingle();

        if (existingShift) {
            saveBtn.disabled = false;
            saveBtn.textContent = "SAVE SHIFT";
            alert(
                "This class is already shifted for today.\n" +
                "It cannot be changed until the day is finished."
            );
            return;
        }

        const {
            error
        } = await supabaseClient
            .from("overrides")
            .insert({
                override_date: today,
                override_type: "SHIFT",
                class_id: pendingShiftClassId,
                reason: modeLabel,
                created_by: session.user.id
            });

        saveBtn.disabled = false;
        saveBtn.textContent = "SAVE SHIFT";

        if (error) {
            console.error("Failed to save shift:", error);
            alert(
                "Could not save shift.\n\n" +
                error.message +
                "\n\nIf the error mentions override_type or check constraint, " +
                "add 'SHIFT' to the overrides.override_type allowed values (see instructions)."
            );
            return;
        }

        pendingShiftClassId = null;
        closeModal("shift-modal");
        await loadTodaySchedule();
    });


// DISMISS CLASS EARLY (in progress only)
document.addEventListener("click", async function(event) {

    if (!event.target.classList.contains("dismiss-early-button")) {
        return;
    }

    const classId = event.target.dataset.classId;

    if (!classId) return;

    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();

    if (!session) {
        alert("You are not logged in.");
        return;
    }

    const confirmed = confirm(
        "Dismiss this class early?\n\n" +
        "On the public Class Clock it will become PREVIOUS and the next class (if any) will become NEXT."
    );

    if (!confirmed) return;

    const button = event.target;
    button.disabled = true;
    button.textContent = "DISMISSING...";

    const today = getTodayDateString();

    const {
        error
    } = await supabaseClient
        .from("overrides")
        .insert({
            override_date: today,
            override_type: "DISMISS_EARLY",
            class_id: classId,
            reason: "Dismissed early",
            created_by: session.user.id
        });

    if (error) {
        console.error("Failed to dismiss class early:", error);
        alert(
            "Could not dismiss class early.\n\n" +
            error.message +
            "\n\nIf needed, add 'DISMISS_EARLY' to the overrides.override_type check constraint."
        );
        button.disabled = false;
        button.textContent = "DISMISSED EARLY";
        return;
    }

    await loadTodaySchedule();
});