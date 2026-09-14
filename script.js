let classes = [];


function getDayName(day) {

    const days = [
        "SUNDAY",
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY"
    ];

    return days[day];
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

    return {
        start: start,
        end: end
    };
}


function findNextClass() {

    const now = new Date();

    let current = null;
    let next = null;

    for (const classItem of classes) {

        let daysUntil =
            (classItem.day - now.getDay() + 7) % 7;

        let classDate = new Date(now);

        classDate.setDate(
            now.getDate() + daysUntil
        );

        let times =
            getClassTimes(classItem, classDate);


        /*
         * Is the class happening right now?
         */

        if (
            times.start <= now &&
            now < times.end
        ) {

            current = {
                classItem: classItem,
                start: times.start,
                end: times.end
            };

            break;
        }


        /*
         * If today's class has already ended,
         * move it to next week.
         */

        if (times.start <= now) {

            classDate.setDate(
                classDate.getDate() + 7
            );

            times =
                getClassTimes(classItem, classDate);
        }


        /*
         * Find the earliest upcoming class.
         */

        if (
            next === null ||
            times.start < next.start
        ) {

            next = {
                classItem: classItem,
                start: times.start,
                end: times.end
            };
        }
    }


    if (current !== null) {

        return {
            state: "during",
            classItem: current.classItem,
            target: current.end
        };
    }


    if (next !== null) {

        return {
            state: "before",
            classItem: next.classItem,
            target: next.start
        };
    }


    return null;
}


function formatCountdown(milliseconds) {

    if (milliseconds < 0) {
        milliseconds = 0;
    }


    const totalSeconds =
        Math.floor(milliseconds / 1000);


    const hours =
        Math.floor(totalSeconds / 3600);


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0")
    );
}


function updateCountdown() {

    const status =
        document.getElementById("status");

    const event =
        document.getElementById("event");

    const countdown =
        document.getElementById("countdown");

    const schedule =
        document.getElementById("schedule");


    const result =
        findNextClass();


    if (result === null) {

        status.textContent =
            "NO UPCOMING CLASSES";

        event.textContent =
            "No classes scheduled";

        countdown.textContent =
            "00:00:00";

        schedule.textContent =
            "";

        return;
    }


    const now = new Date();

    const remaining =
        result.target - now;


    event.textContent =
        result.classItem.name;


    countdown.textContent =
        formatCountdown(remaining);


    if (result.state === "during") {

        status.textContent =
            "CLASS IN PROGRESS:";

    } else {

        status.textContent =
            "TIME LEFT BEFORE:";

    }


    schedule.textContent =
        `${result.classItem.start} - ${result.classItem.end}`;
}


function displaySchedule() {

    const scheduleList =
        document.getElementById("schedule-list");


    scheduleList.innerHTML = "";


    for (const classItem of classes) {

        const item =
            document.createElement("div");

        item.className =
            "schedule-item";


        const day =
            document.createElement("div");

        day.className =
            "schedule-day";

        day.textContent =
            getDayName(classItem.day);


        const time =
            document.createElement("div");

        time.className =
            "schedule-time";

        time.textContent =
            `${classItem.start} - ${classItem.end}`;


        const name =
            document.createElement("div");

        name.className =
            "schedule-name";

        name.textContent =
            classItem.name;


        item.appendChild(day);

        item.appendChild(time);

        item.appendChild(name);


        scheduleList.appendChild(item);
    }
}


async function loadSchedule() {

    try {

        const response =
            await fetch("schedule.json");


        if (!response.ok) {

            throw new Error(
                `Could not load schedule.json (${response.status})`
            );
        }


        classes =
            await response.json();


        displaySchedule();

        updateCountdown();


    } catch (error) {

        console.error(
            "Failed to load schedule:",
            error
        );


        document.getElementById("status")
            .textContent =
            "ERROR";


        document.getElementById("event")
            .textContent =
            "Could not load schedule";


        document.getElementById("countdown")
            .textContent =
            "00:00:00";
    }
}


loadSchedule();


setInterval(
    updateCountdown,
    1000
);