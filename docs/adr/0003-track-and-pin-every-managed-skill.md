# Track and pin every managed skill

Every GitHub, local, and registry-resolved skill managed by gitgud enters the Profile and Resolution Lock. Explicit update advances present pins, preserves removed-upstream pins, discovers new skills disabled, and fails closed when a GitHub ref cannot resolve to a commit; local content moves only on explicit update. Disabling a skill retains its pin, source removal discards all owned pins, and Profile apply reproduces its lock without implicit refresh. Private GitHub access uses existing credentials without persisting secrets.
