# Test-only TLS fixtures

`localhost-test-only.key` / `.crt` form a self-signed certificate for `localhost` and `127.0.0.1`, used **only** by the tests that run a local SMTP server. It protects nothing and must never be used outside tests.
