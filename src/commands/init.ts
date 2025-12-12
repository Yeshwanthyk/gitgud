import path from "node:path";

import {
  ensureDir,
  getGlobalSkillsDir,
} from "../core/paths";
import type { Scope } from "../types";

export type InitOptions = {
  scope: Scope;
};

const AGENTS_SNIPPET = `# gitgud — skills discovery & usage
#
# gitgud discovers skills in these directories (highest precedence first):
#   1) ~/.gitgud/skills
#   2) ~/.claude/skills
#   3) <repo>/.gitgud/skills
#   4) <repo>/.claude/skills
#
# Common commands:
#   gitgud list
#   gitgud show <name>
#   gitgud search <query>
#   gitgud install <name> [--local|--global]
#   gitgud uninstall <name> [--local|--global]
#   gitgud init [--local|--global]
`;

export async function initCommand(
  _args: string[],
  options: InitOptions,
): Promise<void> {
  const scope = options.scope;

  const skillsDir =
    scope === "local"
      ? path.join(process.cwd(), ".gitgud", "skills")
      : getGlobalSkillsDir();

  ensureDir(skillsDir);

  const targetLabel =
    scope === "local" ? skillsDir : `global skills dir: ${skillsDir}`;

  process.stdout.write(
    `Initialized gitgud ${targetLabel}\n\n` +
      "Add this snippet to your AGENTS.md if you want gitgud skills support:\n\n" +
      `${AGENTS_SNIPPET}\n`,
  );
}
