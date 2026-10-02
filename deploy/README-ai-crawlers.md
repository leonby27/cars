# Shared GPTBot and Meta crawl budgets

`nginx-car-ai-limits.conf` belongs in nginx's `http` context as
`/etc/nginx/conf.d/car-ai-limits.conf`. `nginx-car-ai-limit-location.conf` belongs
at `/etc/nginx/snippets/car-ai-limit.conf`, included by the BY proxy snippet and
the RU dynamic location. Install both dependencies before either site config.

The budget is **30 requests per minute per crawler**, across all nginx workers,
source addresses and both domains. A burst admits up to three immediate requests;
excess requests return 429 with `Retry-After: 2`. Ordinary visitors, search bots,
ChatGPT user fetches and link previews have an empty key and bypass this budget.
Static assets also bypass it. Existing BY bot rules remain in effect.

Classification uses the declared GPTBot or meta-externalagent user-agent. This
is not authentication or an IP allowlist: a forged declaration is throttled too.
Do not add an IP to an exemption based solely on its user-agent.

For an authorized configuration release, run `bash deploy/install-car-ai-limits.sh`
from the ABDrive release containing the matching BY/RU snippets. It backs up all
four files, validates nginx, reloads it and restores the backup on failure.
The normal application deploy does not install these nginx files. Keep the common
files and BY proxy snippet synchronized in main; never deploy the RU application
through the BY runner.

Reproducible verification: `python3 tests/nginx-ai-limits.integration.py` on a
machine with nginx. It starts a temporary listener and fixture backend on
loopback, varies source IP and Host, and checks grouped budgets, separate bots,
Retry-After, ordinary/search requests and static assets. It does not use the live
listeners or production database.

ABDrive additionally shares prepared public cards between HTML and JSON for at
most 60 seconds (missing cards: 5 seconds), capped at 500 entries / 24 MiB of JSON.
Concurrent loads share one query; a new price-index generation invalidates the
cache. Lead/order submission explicitly bypasses it for an availability check.
