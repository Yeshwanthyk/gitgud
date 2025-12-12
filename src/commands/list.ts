import type { OutputFormat, Skill } from "../types";
import { getAllSkills, scanSkillsDir } from "../core/skills";
import { getGlobalSkillsDir, getLocalSkillsDir } from "../core/paths";
import { formatSkillList } from "../output";

export type ListOptions = {
  format: OutputFormat;
  local: boolean;
  global: boolean;
};

export function listCommand(options: ListOptions): void {
  let skills: Skill[] = [];

  if (options.local) {
    const localDir = getLocalSkillsDir();
    skills = localDir ? scanSkillsDir(localDir, "local") : [];
  } else if (options.global) {
    const globalDir = getGlobalSkillsDir();
    skills = scanSkillsDir(globalDir, "global");
  } else {
    skills = getAllSkills();
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));

  const output = formatSkillList(skills, options.format);
  process.stdout.write(`${output}\n`);
}
