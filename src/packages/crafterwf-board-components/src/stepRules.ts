export type StepRoleRuleMode = 'all' | 'include' | 'exclude';
export type StepContentRuleMode = 'all' | 'any';

export interface StepRoleRule {
  mode: StepRoleRuleMode;
  roles: string[];
}

export interface StepContentRule {
  mode: StepContentRuleMode;
  pathPatterns: string[];
  contentTypes: string[];
}

export const CONTENT_RULE_BLOCKED_MESSAGE = 'Content associated with package not allowed in Step';
export const ROLE_RULE_BLOCKED_MESSAGE = 'Your role is not allowed to move packages into this step';

export function defaultRoleRule(): StepRoleRule {
  return { mode: 'all', roles: [] };
}

export function defaultContentRule(): StepContentRule {
  return { mode: 'all', pathPatterns: [], contentTypes: [] };
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const p = pattern.trim();
  if (!p) {
    return false;
  }
  if (p === '*' || p === '**' || p === '/*') {
    return true;
  }
  const normalizedPattern = normalizePath(p);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith('/*')) {
    const prefix = normalizedPattern.slice(0, -2);
    if (normalizedPath === prefix) {
      return true;
    }
    if (!normalizedPath.startsWith(`${prefix}/`)) {
      return false;
    }
    const remainder = normalizedPath.slice(prefix.length + 1);
    return !remainder.includes('/');
  }
  if (normalizedPattern.includes('*')) {
    const regex = normalizedPattern
      .replace(/\\/g, '\\\\')
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<DOUBLESTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<DOUBLESTAR>>/g, '.*');
    return new RegExp(`^${regex}$`).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function pathMatchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

function contentTypeMatches(contentType: string, configured: string): boolean {
  return contentType === configured || contentType.endsWith(configured);
}

export function evaluateRoleRule(rule: StepRoleRule | undefined, userGroups: string[]): { allowed: boolean; message?: string } {
  const mode = rule?.mode ?? 'all';
  const roles = rule?.roles ?? [];
  if (mode === 'all' || roles.length === 0) {
    return { allowed: true };
  }
  const userSet = new Set(userGroups.map((g) => g.toLowerCase()));
  const configured = roles.map((r) => r.toLowerCase());
  if (mode === 'include') {
    const matched = configured.some((role) => userSet.has(role));
    return matched ? { allowed: true } : { allowed: false, message: ROLE_RULE_BLOCKED_MESSAGE };
  }
  const blocked = configured.some((role) => userSet.has(role));
  return blocked ? { allowed: false, message: ROLE_RULE_BLOCKED_MESSAGE } : { allowed: true };
}

export function evaluateContentRule(
  rule: StepContentRule | undefined,
  contentPaths: string[],
  contentTypes: string[]
): { allowed: boolean; message?: string } {
  const mode = rule?.mode ?? 'all';
  if (mode === 'all') {
    return { allowed: true };
  }
  const patterns = rule?.pathPatterns ?? [];
  const types = rule?.contentTypes ?? [];
  if (!patterns.length && !types.length) {
    return { allowed: true };
  }
  if (!contentPaths.length) {
    return { allowed: true };
  }
  for (let i = 0; i < contentPaths.length; i += 1) {
    const path = contentPaths[i];
    const type = contentTypes[i] || '';
    const pathMatch = patterns.length ? pathMatchesAny(path, patterns) : false;
    const typeMatch = types.length && type ? types.some((configured) => contentTypeMatches(type, configured)) : false;
    if (!pathMatch && !typeMatch) {
      return { allowed: false, message: CONTENT_RULE_BLOCKED_MESSAGE };
    }
  }
  return { allowed: true };
}

export function evaluateStepMove(
  roleRule: StepRoleRule | undefined,
  contentRule: StepContentRule | undefined,
  userGroups: string[],
  contentPaths: string[],
  contentTypes: string[]
): { allowed: boolean; message?: string } {
  const roleResult = evaluateRoleRule(roleRule, userGroups);
  if (!roleResult.allowed) {
    return roleResult;
  }
  return evaluateContentRule(contentRule, contentPaths, contentTypes);
}

export function hasConfiguredRoleRule(rule?: StepRoleRule): boolean {
  const normalized = rule ?? defaultRoleRule();
  return normalized.mode !== 'all' && normalized.roles.length > 0;
}

export function hasConfiguredContentRule(rule?: StepContentRule): boolean {
  const normalized = rule ?? defaultContentRule();
  return (
    normalized.mode === 'any' &&
    (normalized.pathPatterns.length > 0 || normalized.contentTypes.length > 0)
  );
}
