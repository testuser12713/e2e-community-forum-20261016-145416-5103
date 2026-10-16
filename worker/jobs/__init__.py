"""One module per job kind the worker understands.

Each handler receives the job's payload and a session bound to its own
transaction. Returning normally marks the job done; raising marks it for a retry
with backoff (the worker's attempt counter decides when it is parked as failed).
"""
