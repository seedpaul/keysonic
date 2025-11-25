# Helper wrapper to launch the Codex CLI with reduced log noise.
# Usage: .\run-codex.ps1 -CodexExe "path\to\codex.exe" -- your codex args
param(
    [string]$CodexExe = "codex",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

# Suppress verbose logs (including unknown MCP notifications) from the Codex CLI.
$env:RUST_LOG = "error"

# Pass through any provided args to the Codex executable.
& $CodexExe @Args
