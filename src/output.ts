import type { OutputFormat, Skill } from "./types";

export function formatSkillList(skills: Skill[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(skills, null, 2);
  }

  return skills
    .map((skill) => `${skill.name} (${skill.scope}) - ${skill.description}`)
    .join("\n");
}

export function formatSkillDetail(
  skill: Skill,
  content: string,
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify({ ...skill, content }, null, 2);
  }

  return content;
}

export function formatError(message: string, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify({ error: message }, null, 2);
  }

  return `Error: ${message}`;
}
