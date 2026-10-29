"""The error every Discover failure that is safe to show to the user uses."""


class DiscoverError(Exception):
    """A failure that is safe to show to the user.

    retry_after (seconds) is set when a source is resting or busy, so the page can say
    when to try again.
    """

    def __init__(self, message, status=400, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after
