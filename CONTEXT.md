# gitgud Skill Management

gitgud maintains shared skill intent, resolves it to immutable source content, and projects enabled skills into supported agent environments.

## Language

**Skill Source**:
A GitHub repository, local path, or registry resolution from which gitgud discovers skills.
_Avoid_: Install, registry

**Profile**:
The user's desired Skill Sources and enabled selections.
_Avoid_: Config, registry state

**Resolution Lock**:
The immutable source and skill resolution corresponding to a Profile.
_Avoid_: Profile, cache manifest

**Pinned Skill**:
A skill whose exact resolved content remains managed until the user explicitly changes its selection or resolution.
_Avoid_: Installed skill, latest skill

**Upstream Removal**:
A Skill Source no longer advertises a previously resolved skill; this does not invalidate or remove the Pinned Skill.
_Avoid_: Uninstall, deletion

**Selection**:
The enabled or disabled intent for a Pinned Skill. Disabling removes projections while retaining the source and pin.
_Avoid_: Installation state, cached state

**Generation**:
One internally consistent published state containing a Profile, its Resolution Lock, and the resulting managed skills.
_Avoid_: Snapshot, transaction

**Projection**:
A derived agent-specific view of managed skills; never authoritative state.
_Avoid_: Registry, source of truth

**Degraded Commit**:
A successfully published Generation whose Projection failed for one or more agents and requires a convergent sync retry.
_Avoid_: Rollback, full success

**Scope**:
The global or project-local boundary that owns a Profile and its Generations. Project-local intent overlays global intent when deriving effective skills.
_Avoid_: Agent, source
