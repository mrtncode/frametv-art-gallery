"""What is in season, so Discover can lead with something fitting and the holiday postcards
have a sensible default. The server decides (this is the only copy of the calendar), so the
page never needs updating and every visitor sees the same thing.

Easter and Thanksgiving move, so they are worked out for the year rather than listed.
"""

import datetime

LEAD_WEEKS_EASTER = 4


def easter(year):
    """Easter Sunday (the anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = divmod(b, 4)
    g = (b - (b + 8) // 25 + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return datetime.date(year, month, day + 1)


def thanksgiving(year):
    """The US holiday: the fourth Thursday of November."""
    first = datetime.date(year, 11, 1)
    return first + datetime.timedelta(days=(3 - first.weekday()) % 7 + 21)


def seasonal_word(today=None):
    today = today or datetime.date.today()
    year = today.year
    if today <= datetime.date(year, 1, 6) or today > thanksgiving(year):
        return "christmas"
    if today <= datetime.date(year, 1, 24):
        return "winter"
    if today <= datetime.date(year, 2, 14):
        return "valentine"
    eastertide = easter(year)
    if eastertide - datetime.timedelta(weeks=LEAD_WEEKS_EASTER) <= today <= eastertide:
        return "easter"
    if datetime.date(year, 11, 1) <= today:
        return "thanksgiving"
    if today.month == 10:
        return "halloween"
    if today.month == 9:
        return "autumn"
    if today.month >= 6:
        return "summer"
    return "spring" if today.month >= 3 else "winter"
