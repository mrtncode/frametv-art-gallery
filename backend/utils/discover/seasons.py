"""What is in season, so the holiday collection has something fitting to show by default."""

import datetime

_BY_MONTH = {
    1: "winter",
    2: "valentine",
    3: "easter",
    4: "easter",
    5: "spring",
    6: "summer",
    7: "summer",
    8: "summer",
    9: "autumn",
    10: "halloween",
    11: "thanksgiving",
    12: "christmas",
}


def seasonal_word(today=None):
    return _BY_MONTH[(today or datetime.date.today()).month]
