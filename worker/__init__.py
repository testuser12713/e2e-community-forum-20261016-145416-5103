"""The forum's worker service: a separate process that drains the shared job table.

The worker owns the job queue's consumption side: it claims due rows of the
``jobs`` table with ``SELECT ... FOR UPDATE SKIP LOCKED``, dispatches them to the
handlers in ``jobs`` and enqueues the two periodic jobs (``recompute_hot`` and
``cleanup_sessions``). It shares its models, its session and its configuration
with the API through the ``shared`` package.
"""
