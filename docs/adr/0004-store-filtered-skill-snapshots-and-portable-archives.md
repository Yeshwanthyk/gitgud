# Store filtered skill snapshots and portable archives

Repositories are downloaded only into temporary discovery storage; the persistent cache stores immutable skill directories by content hash. `.git`, `node_modules`, `.gitgudignore` matches, and escaping symlinks are excluded. Cache deletion is explicit and may remove only unreferenced content. Manifest Profiles remain small, while complete archives contain the Profile, Resolution Lock, and filtered files for every enabled, disabled, or removed-upstream pin.
