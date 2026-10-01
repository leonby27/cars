// Entry points import this before modules that read the site or database profile.
try { process.loadEnvFile?.(".env.local"); } catch {}
try { process.loadEnvFile?.(); } catch {}
